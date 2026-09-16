# Simple-first Course Scheduling — Design Spec

**Date:** 2026-07-18  
**Status:** Approved  
**Repos:** `schedjuice-reimagined-fe`, `schedjuice-reimagined-be`  
**Approach:** Shared `SimpleSchedulePicker` with Custom escape hatch (Approach 1)

## 1. Summary

Most schools schedule weekly-recurring classes with one shared time range. Today’s intake slots editor and calendar event form expose the full multi-slot / one-off surface immediately, which is heavier than the common case.

Make **dead-simple weekly scheduling first-class for all tenants**: pick days + one time range, with org-overridable defaults (start **19:00**, duration **90** minutes). A **Custom schedule** control unlocks today’s full editors unchanged. Orgs that include `course_type` in `course_fields` get **WD / WE** day buttons instead of weekday chips (WD = Mon–Thu, WE = Sat–Sun; Friday only via Custom).

## 2. Context

### Current surfaces

| Surface | Key files | Behavior today |
| --- | --- | --- |
| Intake create (preview) | `recurring-slots-editor.tsx`, `intake-schedule.ts` | Per-slot weekday select + from/to; empty default Mon 09:00–10:00 |
| Course calendar / Schedule tab | `event-form.tsx`, `calendar.tsx` | One-off or “Set recurring” with full weekday checkboxes |
| Manual course create | `manual-course-form.tsx` | Date span presets; schedule refined on Schedule tab |

### Persistence (unchanged)

- Recurrence is expanded into discrete `Event` rows (`time_from` / `time_to` / `date`).
- Intake uses `RecurringSlot[]` → generate-courses materializes events.
- `Course.course_type` is `WD` \| `WE` \| `OTHER` (classification, not a schedule UI today).
- `Organization.course_fields` controls which course form fields appear; **`course_type` is not yet in `VALID_COURSE_FIELD_NAMES`** and must be added so WE/WD mode can be enabled.

### Gaps

- No org default session start time or duration.
- No simple-vs-custom progressive disclosure.
- WE/WD is metadata/reporting, not the day picker.

## 3. Goals

1. Default scheduling UX everywhere days/times are set: day selection + single time range.
2. Custom always available → existing full UI for that surface.
3. Org-overridable defaults: session start time (`19:00`) and duration minutes (`90`).
4. When `course_type` ∈ org `course_fields`, show only WD / WE; picking one sets days **and** `course_type`.
5. No new recurrence storage model — adapters map simple state into existing slot/event payloads.

## 4. Non-goals

- New rrule / schedule-template persistence on Course or Intake.
- Changing teacher-assign calendar **Recurring Mode** (`custom` / `weekly` / `all_days`).
- Changing how events are materialized or overlap/Sabbath rules in custom/calendar paths.
- Mobile app changes.
- Inferring WE/WD mode from historical course data (only via `course_fields`).

## 5. Locked decisions

| Topic | Choice |
| --- | --- |
| Rollout | Simple mode default for **all** tenants; Custom always available |
| Surfaces | Intake create, course calendar event form, and any other create path that sets days/times |
| Custom unlocks | Today’s full UI for that surface, unchanged |
| WE/WD enablement | `course_type` present in org `course_fields` |
| WD meaning | Monday–Thursday only |
| WE meaning | Saturday–Sunday |
| Friday | Only via Custom (not part of WD or WE) |
| WD/WE selection | Sets weekdays **and** `course_type` |
| WD ↔ WE | Mutually exclusive; switching replaces days and type |
| Defaults | Start `19:00`, duration `90` minutes; both org-overridable |
| Architecture | Shared FE `SimpleSchedulePicker` + thin adapters |
| Persistence | Expand to existing `RecurringSlot[]` / recurring event payloads |

## 6. Architecture

### 6.1 `SimpleSchedulePicker` (FE)

Reusable control with internal mode: `simple` \| `custom`.

**Simple UI**

- Day controls:
  - Standard: multi-select weekday chips (existing `weekdayNames` labels).
  - WE/WD mode: two buttons, **WD** and **WE** only.
- Time range: start + end; end defaults to start + duration; both editable.
- Link/button: **Custom schedule →**

**Custom UI**

- Renders the existing surface editor via slot/render-prop (e.g. `RecurringSlotsEditor` or calendar `event-form` recurring section).
- Prefill from simple state when entering Custom (expand WD/WE to underlying days first).
- Optional **Back to simple** only when current custom state collapses to one shared time range + day set (see §7.3). Otherwise remain in custom.

### 6.2 Adapters

| Surface | Simple → existing model |
| --- | --- |
| Intake preview / generation defaults | Expand to `RecurringSlot[]`: one slot per selected weekday, same `time_from` / `time_to` |
| Calendar add recurring session | Same payload as today’s “Set recurring” path |
| Other create paths | Same expansion before generate/save |

In WE/WD mode, adapters also set `course_type` on course / intake defaults when WD or WE is selected.

### 6.3 Org settings (BE + FE)

On `Organization`:

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `default_session_start_time` | time | `19:00` | Stored as time / `HH:MM` consistent with existing time fields |
| `default_session_duration_minutes` | positive int | `90` | Invalid/missing → FE falls back to `90` |

Expose on org settings UI near timezone / course fields: **Default class start**, **Default class duration (minutes)**.

Add `course_type` to FE `VALID_COURSE_FIELD_NAMES` (and any BE allowlist for `course_fields`) so orgs can enable WE/WD mode through the existing course-fields editor.

### 6.4 Out of scope components

Teacher schedule assign modes, read-only calendars, Zoom/Teams meeting scheduling.

## 7. Data flow & UX

### 7.1 Defaults on open (new schedule)

1. Start = org `default_session_start_time` (fallback `19:00`).
2. End = start + org `default_session_duration_minutes` (fallback `90`).
3. No days selected until the user picks (unless editing an existing schedule that collapses to simple — §7.3).

### 7.2 Simple → save / generate

1. User selects days (chips or WD/WE) and optionally adjusts the time range.
2. Adapter expands to N identical-time slots / recurring weekdays.
3. Existing APIs unchanged (`preview-courses`, `generate-courses`, `edit-events`, etc.).
4. In WE/WD mode, write `course_type` when WD or WE is selected.

### 7.3 Editing / reopen mode detection

Open in **simple** when existing sessions collapse to one shared `time_from`/`time_to` across all weekly days, and:

- **Standard mode:** day set is any non-empty subset of Sun–Sat (chips can represent it).
- **WE/WD mode:** day set is **exactly** Mon–Thu (select WD) or **exactly** Sat–Sun (select WE). Partial subsets (e.g. Mon+Wed only) or any set including Friday open in **custom**, because simple only offers the two buttons.

Otherwise open in **custom** (mixed times, one-offs, multi-slot different times, etc.).

### 7.4 Time editing rules

- Changing start keeps duration when possible (recompute end).
- Editing end updates the effective duration for that form session.
- End must be after start (reuse existing validation helpers).

### 7.5 Lofi layouts

```
Simple (standard)                 Simple (course_type in course_fields)
─────────────────                 ────────────────────────────────────
Days                              Days
[Mon][Tue][Wed][Thu][Fri][Sat][Sun]   [ WD ]   [ WE ]
Time                              Time
19:00 ——— 20:30                   19:00 ——— 20:30
Custom schedule →                 Custom schedule →
```

## 8. Error handling & edge cases

| Case | Behavior |
| --- | --- |
| No days selected when sessions expected | Match each surface’s current empty-session rules (intake: allow create with “no sessions” warning on confirm; calendar recurring submit: require ≥1 day) |
| Invalid time range | Existing `isClassTimeRangeValid` / slot validators |
| Invalid org duration/start | FE falls back to `90` / `19:00` |
| Empty slots (schedule later) | Still allowed where intake already allows it |
| Switch WD ↔ WE | Replace days and `course_type`; no mixed set |
| Custom with Friday / mixed times | Do not silently collapse to simple |
| Timezone labeling | Unchanged (show org timezone / offset where already shown) |
| Overlap / Sabbath / one-off | Remain in custom/calendar paths only |

## 9. Testing

### Unit (FE)

- Expand chips → `RecurringSlot[]` with shared times.
- WD → Mon–Thu + `course_type=WD`; WE → Sat–Sun + `course_type=WE`.
- Default start/duration from org + fallbacks.
- “Can collapse to simple?” detector (positive and negative cases, including Friday-only).

### Component (FE)

- Picker opens with 19:00 / +90 (or org overrides).
- Custom reveals existing editor; prefill carries weekdays + times.
- WE/WD buttons only when `course_type` ∈ `course_fields`.

### Backend

- Migration + serializer for org default fields.
- Validation: duration positive integer; start time parseable.
- `course_fields` accept `course_type` if an allowlist exists.

### Integration / e2e

- Intake preview + generate still creates events for selected days/times.
- Calendar add recurring still saves via `edit-events`.
- Extend or lightly touch existing scheduling e2e if present (`e2e/r9-courses-attendance-scheduling.spec.ts`).

## 10. Implementation sketch (for planning)

1. BE: org fields + migration + API/serializer exposure.
2. FE types/org form: wire defaults; add `course_type` to valid course fields.
3. FE helpers: expand/collapse, WE/WD maps, default resolution.
4. `SimpleSchedulePicker` component.
5. Wire intake `RecurringSlotsEditor` call sites (default + per-row).
6. Wire calendar `event-form` create-recurring path.
7. Audit other create paths that set days/times; wrap or redirect through picker.
8. Tests as in §9.

## 11. Success criteria

- New schedule flows open simple-first with 7pm / 90min (or org overrides) without hunting for Custom.
- WE/WD orgs see two day buttons; Friday requires Custom.
- Custom remains fully capable of today’s multi-slot / one-off workflows.
- No change to Event persistence shape or generate/edit-events contracts beyond existing payloads + `course_type` when applicable.
}
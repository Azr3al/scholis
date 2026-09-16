# Overnight course sessions (cross-midnight events)

**Status:** draft (awaiting user review)  
**Date:** 2026-07-24  
**Repos:** `schedjuice-reimagined-be`, `schedjuice-reimagined-fe`  
**Surfaces:** Course schedule calendar editor (Add/Edit Event, recurring add, overlap Fix/Replace, calendar display)  
**Builds on:**
- `docs/superpowers/specs/2026-07-21-schedule-overlap-past-ignore-and-fix-reschedule-design.md`
- Attendance `_get_event_end_utc` / payroll overnight handling (already treats `time_to <= time_from` as next-day end)

## Context

Users schedule classes that start late at night and end after midnight (e.g. 10:30 PM → 12:00 AM). Today:

- **Frontend** `isClassTimeRangeValid` rejects `time_to <= time_from` (“End time must be after start time”).
- **Backend** `Event.save()` rejects the same case, despite attendance/checkout already interpreting `time_to <= time_from` as ending on the **next calendar day**.
- **Overlap** and **calendar layout** helpers assume all sessions fit on one calendar day.

The `Event` model docstring says multi-day events are unsupported; this spec narrows scope to **overnight only** (one logical session, max ~24 h), not arbitrary multi-day spans.

## Goals

1. Allow creating/editing **overnight sessions** with the existing schema (`date`, `time_from`, `time_to`).
2. **Auto-detect** overnight when `time_to <= time_from`; show a next-day hint in the form.
3. **Guard long overnight spans:** silent auto-accept when duration **< 2 hours**; require explicit confirmation when **≥ 2 hours** (likely AM/PM mistake).
4. Apply the same rules to **recurring** session creation in the Add Event form.
5. **Calendar display:** event stays on **start date**; time label shows next-day cue; week view draws through midnight on the start column.
6. **Overlap detection** respects the portion of an overnight session on the start day **and** the tail on the next day.
7. Keep attendance/check-in behavior unchanged (already overnight-aware).

## Non-goals

- Arbitrary multi-day events (separate start/end dates).
- Splitting one class into two event rows.
- New DB columns (e.g. `ends_next_day` flag) — use implicit convention.
- Intake wizard / course-create simple-schedule picker (can follow later with shared helpers).
- Visual spill of event blocks into the next day column in week view.
- Showing duplicate chips on the end date.

## Decisions

| # | Decision |
| --- | --- |
| 1 | **Approach:** implicit overnight convention — `time_to <= time_from` ⇒ end on `date + 1 day` at `time_to` |
| 2 | **Scope:** overnight only; max span **24 hours**; reject zero duration (`time_from === time_to`) |
| 3 | **Form UX:** auto-detect; hint under end time; confirm checkbox when overnight duration **≥ 2 h** |
| 4 | **Recurring:** same overnight rules on generated occurrences |
| 5 | **Calendar:** start-day chip; label `10:30 PM – 12:00 AM (+1)`; week block ends at midnight |
| 6 | **Overlap:** compare full org-local datetime ranges, not raw clock times on one day |
| 7 | **Storage:** no migration; relax `Event.save()` validation |

---

## Part A — Data model & semantics

### Fields (unchanged)

| Field | Meaning |
| --- | --- |
| `date` | Session **start** calendar day (org timezone) |
| `time_from` | Start clock time on `date` |
| `time_to` | End clock time on `date` if same-day; on **`date + 1`** if overnight |

### Overnight predicate

```text
is_overnight(time_from, time_to) := time_to <= time_from   // strict: time_from === time_to is NOT overnight; it is invalid
```

### Duration

```text
if time_to > time_from:
  duration = time_to - time_from          // same day
else:
  duration = (24:00 - time_from) + time_to   // overnight wrap
```

Reject `duration <= 0` or `duration > 24 h`.

### Backend changes

| Location | Change |
| --- | --- |
| `Event.save()` | Remove `time_to <= time_from` rejection; validate zero duration and max 24 h instead |
| `Event` docstring | Update: overnight sessions supported via `time_to <= time_from`; arbitrary multi-day still not |
| `event_overlap.event_end_datetime()` | Add +1 day when overnight (align with `_get_event_end_utc`) |
| `overlap_reschedule_services.apply_overlap_reschedule` | Allow overnight times; use shared duration validation |
| Shared BE helper (new) | `event_bounds_local(event, tz) -> (start_dt, end_dt)` used by overlap + past checks |

Attendance/payroll paths that already add +1 day when `time_to <= time_from` remain unchanged.

---

## Part B — Shared time helpers

Introduce parallel helpers in **FE** (`src/helpers/session-time.ts` or extend `calendar.ts`) and **BE** (`app_course/session_time.py`):

| Helper | Purpose |
| --- | --- |
| `isOvernightSession(from, to)` | `to <= from` after normalizing to `HH:MM` |
| `sessionDurationMinutes(from, to)` | Same-day or overnight duration |
| `isValidSessionTimeRange(from, to)` | Non-empty, not zero duration, ≤ 24 h |
| `eventBoundsLocal(date, from, to, tz)` | `(start_dt, end_dt)` in org TZ |
| `formatSessionTimeRange(from, to, opts)` | Display string; append `(+1)` when overnight |

Replace direct uses of `isClassTimeRangeValid` (strict `end > start`) with `isValidSessionTimeRange` on schedule surfaces in scope.

**Interval overlap** (back-to-back allowed):

```text
overlap(A, B) := startA < endB && endA > startB
```

Use full datetime bounds, not minute-of-day on a single date.

### Cross-day overlap

An overnight session on **July 24** 22:30 → 00:00 conflicts with:

- **July 24** sessions from 22:30 onward (start-day portion), and
- **July 25** sessions before 00:00 (tail portion).

Implementation: when checking conflicts for proposed `(date, from, to)`, compute `(start, end)` datetimes and test against every existing event’s `(start, end)`. For listing “events on date D”, include any event whose range intersects `[D 00:00, D+1 00:00)`.

Update FE `timeRangesOverlap`, `findOverlappingEventsOnDate`, cluster builders, and BE `find_overlap_clusters` / `find_schedule_conflicts` to use datetime bounds. Same-day bucketing alone is insufficient for overnight tails — cluster by intersecting local day or use pairwise datetime overlap (prefer pairwise on filtered candidate sets for correctness).

---

## Part C — Form UX (Add/Edit Event)

### Auto-detect

When user sets `time_from` and `time_to`:

1. If `time_to > time_from` → normal same-day session; no overnight UI.
2. If `time_to <= time_from` and valid overnight duration:
   - **< 2 h:** accept silently; show muted hint under end time: `Ends next day (Jul 25)` (org date formatting).
   - **≥ 2 h:** show required checkbox: `This session ends the next day (~9 hr). I confirm this is correct.` Block submit until checked.
3. If zero duration or > 24 h → field error.

### lofi mockup

```text
Start time *     [10] [30] [PM]
End time *       [12] [00] [AM]
                 Ends next day (Jul 25)

── or (≥ 2 h) ──

End time *       [08] [00] [AM]
                 Ends next day (Jul 25)
[ ] This session ends the next day (~9 hr). I confirm this is correct.
```

### Surfaces using same validation

| Surface | Overnight support |
| --- | --- |
| `event-form.tsx` | Primary — add/edit + recurring |
| `reschedule-conflicts-dialog.tsx` | Same rules on Fix apply |
| `calendar-menu.tsx` bulk times | Same rules |
| `calendar-reschedule.ts` | Delegate to shared helper |

Form state: optional `overnight_confirmed: boolean` (local only, not persisted).

### Recurring

When “Set recurring” is checked, the same start/end times apply to each generated weekday occurrence. Each occurrence is overnight independently (e.g. Mon 22:30 → Tue 00:00). Overlap scan for recurring uses overnight-aware bounds per proposed date.

---

## Part D — Calendar display

### List / month / day chips

- Event appears only on **start `date`**.
- Time line uses `formatSessionTimeRange` → e.g. `10:30 PM – 12:00 AM (+1)`.

### Week view

- `eventHourRange`: if overnight, render `start` → `24` (midnight) on the start-day column; no next-column spill.
- Overlap clustering within a day column uses `[start, 24)` for overnight events.

### Timeslot UTC helper

Update `getTimeslotUtcRange` in `timeslot.ts`: when overnight, compute `utcEnd` from `date + 1 day` at `time_to` (match attendance).

---

## Part E — Error handling

| Case | Message / behavior |
| --- | --- |
| `time_from === time_to` | “End time must be after start time” |
| Duration > 24 h | “Session cannot be longer than 24 hours” |
| Overnight ≥ 2 h, checkbox unchecked | “Confirm this session ends the next day” |
| Overlap on start or tail day | Existing overlap copy + Fix/Replace |
| BE save invalid range | Same validation messages in API `details` |

---

## Part F — Testing

### Backend (high-value)

| Test | Assert |
| --- | --- |
| Save overnight event 22:30 → 00:00 | 201/ persists; `time_to <= time_from` allowed |
| Reject zero duration | ValidationError |
| Reject 22:00 → 21:00 same interpretation (> 24 h or invalid) | ValidationError |
| `event_end_datetime` overnight | End on next calendar day |
| Overlap: overnight vs next-morning session | Conflict detected |
| Overlap: overnight vs prior-day unrelated | No false conflict |
| `apply_overlap_reschedule` with overnight times | Succeeds when no conflict |
| Past detection for overnight | Uses next-day end datetime |

### Frontend (high-value)

| Test | Assert |
| --- | --- |
| `sessionDurationMinutes` / `isOvernightSession` | Edge cases: 22:30→00:00, same-day 09:00→10:00 |
| `isValidSessionTimeRange` | Rejects zero, > 24 h; allows overnight |
| `timeRangesOverlap` with overnight | Tail conflicts next-day morning |
| Form validation | < 2 h no checkbox; ≥ 2 h requires confirm |

Skip happy-path-only “renders form” tests.

---

## Rollout

Single PR spanning BE + FE. No migration. Deploy BE and FE together so save validation stays aligned.

## Open questions

None — scope and UX confirmed in brainstorming (2026-07-24).

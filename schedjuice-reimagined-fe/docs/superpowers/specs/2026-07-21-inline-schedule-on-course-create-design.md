# Inline Schedule on Single-Course Create — Design Spec

**Date:** 2026-07-21  
**Status:** Approved (brainstorm)  
**Repos:** `schedjuice-reimagined-fe` (no backend API changes)  
**Approach:** FE create-then-schedule (Approach 1)

## 1. Summary

When creating a single course, show the updated simple scheduling UI (`SimpleSchedulePicker` via `SlotsSimpleScheduleField`) directly under the create form. Schedule is **optional**: empty days means create the course with no sessions. If slots are set, one submit creates the course and then materializes sessions via existing `edit-events`. After success, always land on the course edit **Schedule** tab so the user can refine.

Bulk intake wizard and multi-course intake add are unchanged.

## 2. Context

| Surface today | Behavior |
| --- | --- |
| `ManualCourseForm` | Identity, details, date span only → `POST courses` → redirect `/courses/{id}/edit?tab=edit-schedule` |
| `ExistingIntakeAddForm` (single) | Same redirect pattern (ref to intake) |
| Intake preview | Already uses `SlotsSimpleScheduleField`; sessions created by `generate-courses` |
| Edit Schedule tab | `Calendar` + `EventForm` with `SimpleSchedulePicker`; saves via `POST courses/{id}/edit-events` |

Related: [2026-07-18 simple-course-scheduling design](./2026-07-18-simple-course-scheduling-design.md). That work intentionally left manual create as “date span now, schedule on Schedule tab.” This spec closes that gap for single-course create paths only.

## 3. Goals

1. Put optional weekly schedule UI under every **single-course** create form.
2. Reuse `SlotsSimpleScheduleField` / `SimpleSchedulePicker` (simple + Custom).
3. One primary submit: create course; if slots set, also create sessions.
4. Preserve post-create redirect to edit Schedule tab.
5. Fix `?tab=edit-schedule` so the Schedule tab actually opens.

## 4. Non-goals

- Extending `POST courses` (or any new create API) to accept events atomically.
- Changing bulk intake wizard layout or `generate-courses`.
- Inline schedule on multi-course intake add (`ExistingIntakeAddFormMulti`).
- Calendar / session-list preview under the create form.
- Making schedule required.
- Backend overlap / Sabbath rule changes.

## 5. Locked decisions

| Topic | Choice |
| --- | --- |
| Scope | Manual create + single-course add-to-existing-intake |
| UI under form | `SlotsSimpleScheduleField` only (no calendar preview) |
| Schedule required? | No — empty days = skip sessions |
| Submit model | Create course, then optional `edit-events` |
| Persistence | Discrete events via existing `edit-events` |
| After success | Always `/courses/{id}/edit?tab=edit-schedule&ref=...` |
| Partial failure | Toast error; still redirect to Schedule tab |
| `course_type` | When WD/WE nomenclature applies and user picks WD/WE, include on create payload if field allowed |
| Default picker state | Org session time defaults; **no weekdays selected** |

## 6. Architecture

### 6.1 UI

Under date fields, above the create button:

```text
┌─────────────────────────────────────────┐
│  Identity / Details / Date span         │  (unchanged)
│  ─────────────────────────────────────  │
│  Schedule (optional)                    │
│  [SimpleSchedulePicker / Custom]        │
│  empty days = no sessions on create     │
│  ─────────────────────────────────────  │
│  [Create course]                        │
└─────────────────────────────────────────┘
```

Wire into:

- `src/components/scheduling/manual-course-form.tsx`
- `src/components/scheduling/existing-intake-add-form.tsx`

Local state: `RecurringSlot[]` (not part of the Zod course schema).

### 6.2 Submit helper

Shared FE helper `createCourseThenOptionalSchedule` used by both forms:

1. Validate course fields (existing).
2. If slots non-empty, validate each slot has weekday(s) and valid `time_from` / `time_to`; else inline schedule error and abort (no create).
3. `POST courses` with sanitized payload (+ optional `course_type` from WD/WE slots).
4. If slots empty → toast + redirect to edit Schedule tab.
5. If slots set → expand to event create payloads over `start_date`–`end_date`, then `POST courses/{id}/edit-events`.
6. Redirect to edit Schedule tab (same `ref` behavior as today).

### 6.3 Slot → event expansion

Reuse calendar expansion rather than inventing a third path:

- Simple mode (shared time + weekdays): map slots → weekday list + times, then reuse `addRecurringEvents` from `helpers/calendar.ts` (same rules as `EventForm` recurring add).
- Custom mode (multiple `RecurringSlot`s): expand **per slot** (weekday + that slot’s times) across the date span, concatenate events.
- No existing events on a brand-new course; skip Fix-reschedule UI. If generated set is invalid (e.g. bad times), fail validation before create.

`edit-events` body matches calendar save: `{ course, events }` where `events` is the expanded list (new rows without ids). Build the same shape the Schedule tab Save button posts today.

### 6.4 Edit tab deep-link

Course edit page currently may set `?tab=edit-schedule` but keep `Tabs.Root` on `defaultValue="edit-info"`. Bind active tab to the `tab` query param so Schedule opens after redirect.

## 7. Error handling

| Case | Behavior |
| --- | --- |
| Course validation fails | Stay on form; existing field errors |
| Non-empty schedule invalid | Inline schedule error; no `POST courses` |
| Create fails | Stay on form; no `edit-events` |
| Create OK, `edit-events` fails | Error toast (“Course created, but sessions could not be added”); redirect to Schedule tab |
| Empty schedule | Create only; redirect |

## 8. Testing

FE only; prefer high-value cases:

| Case | Assert |
| --- | --- |
| Empty slots | `POST courses` only; no `edit-events`; redirect includes `tab=edit-schedule` |
| Slots set | Create then `edit-events` with expanded events; redirect includes tab |
| Partial failure | After create, `edit-events` rejects → error toast + still navigate to Schedule |
| Invalid non-empty schedule | Blocks create; no network create call |
| Optional thin success | One simple weekday+time expansion produces expected dates in range |

Out of test scope: “picker renders”, bulk intake, multi-course add, backend.

## 9. Implementation notes

- Files likely touched: `manual-course-form.tsx`, `existing-intake-add-form.tsx`, new/shared create+schedule helper, calendar/edit page tab binding, focused Vitest coverage.
- No changes to `POST courses` contract or intake generate flow.
- Keep schedule section visually secondary (optional); do not turn create into a mini calendar editor.

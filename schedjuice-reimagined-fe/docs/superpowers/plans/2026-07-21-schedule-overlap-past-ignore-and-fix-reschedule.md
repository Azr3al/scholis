# Schedule Overlap Past-Ignore & Fix Reschedule — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ignore past session slots (`time_to < now` in org timezone) in overlap validation, and add a unified **Fix** (reschedule times) action alongside **Replace** (merge) everywhere future overlaps are shown — without losing attendance data.

**Architecture:** Add a shared past-event predicate on BE (`event_overlap.py`) and FE (`calendar.ts`). Filter past sessions out of cluster detection used by save, form, bulk times, and data health. Calendar **Fix** updates draft event times client-side then continues the flow; Data Health **Fix** uses a new atomic reschedule apply endpoint. **Replace** keeps existing merge/resolve paths (already `@transaction.atomic`).

**Tech Stack:** Django/DRF, django-tenants, Next.js, React, Vitest, `date-fns-tz` (`toUtcFromTenant`), existing RBAC (`course.manage_content` + `check_course_write`).

**Spec:** `docs/superpowers/specs/2026-07-21-schedule-overlap-past-ignore-and-fix-reschedule-design.md`

## Global Constraints

- Past = `event_end_org < now_org` where end is org-local date + `time_to`; `time_to == now` is **not** past.
- Copy everywhere: **Fix** = reschedule; **Replace** = merge. No “Fix overlaps” / “Replace conflicting session”.
- Fix never deletes events or UserEvents; Replace must preserve attendance via existing merge.
- Persisted Fix/Replace applies must run inside `transaction.atomic()`.
- Backend tests: `./scripts/run_backend_tests.sh <target>` from `schedjuice-reimagined-be/` (always `--keepdb`).
- Frontend tests: `pnpm test <path>` from `schedjuice-reimagined-fe/`.
- Do **not** commit unless the user explicitly asks.

---

## File Structure

### Backend (`schedjuice-reimagined-be`)

| File | Responsibility |
| --- | --- |
| `app_course/event_overlap.py` | `event_end_datetime`, `is_past_event`, filter past in `find_overlap_clusters` |
| `app_course/overlap_reschedule_services.py` | **Create** — preview + atomic apply for Data Health Fix |
| `app_course/views.py` | Reschedule preview/apply views |
| `app_course/urls.py` | Routes under `data-health/reschedule-overlapping-events/` |
| `app_course/tests/test_event_overlap.py` | Past-ignore unit tests |
| `app_course/tests/test_overlap_reschedule.py` | **Create** — reschedule apply + atomicity + attendance unchanged |

### Frontend (`schedjuice-reimagined-fe`)

| File | Responsibility |
| --- | --- |
| `src/helpers/calendar.ts` | `isPastEvent`, pass `orgTimezone`/`now` into overlap helpers |
| `src/helpers/calendar-overlap.test.ts` | Past-ignore + reschedule helper tests |
| `src/helpers/calendar-reschedule.ts` | **Create** — apply shared times to conflict IDs; validate clear |
| `src/components/calendar/reschedule-conflicts-dialog.tsx` | **Create** — shared Fix dialog |
| `src/components/calendar/event-form.tsx` | Fix + Replace links; Apply & add |
| `src/components/calendar/calendar.tsx` | Save-bar Fix + Replace labels |
| `src/components/calendar/calendar-menu.tsx` | Bulk-times Fix + Replace labels |
| `src/helpers/course-insights.ts` | Reschedule preview/apply API clients |
| `src/types/course-insights.ts` | Reschedule request/response types |
| `src/components/course-insights/overlap-fix-preview-sheet.tsx` | Fix (reschedule) + Replace (merge) entry |

---

### Task 1: Backend past-event filter in overlap clustering

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/event_overlap.py`
- Modify: `schedjuice-reimagined-be/app_course/tests/test_event_overlap.py`

**Interfaces:**
- Produces:
  - `event_end_datetime(event: Event, tz: ZoneInfo) -> datetime`
  - `is_past_event(event: Event, tz: ZoneInfo, *, now: datetime | None = None) -> bool`
  - `find_overlap_clusters(events, tz, *, now=None, ignore_past=True)` — when `ignore_past`, drop past events before clustering

- [ ] **Step 1: Write the failing tests**

Add to `EventOverlapTests` in `app_course/tests/test_event_overlap.py`:

```python
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from app_course.event_overlap import is_past_event, find_overlap_clusters, has_overlapping_events

def test_is_past_event_by_time_to(self):
    tz = ZoneInfo("UTC")
    now = datetime(2026, 7, 1, 12, 0, tzinfo=tz)
    past = Event(
        title="P",
        course_id=1,
        date=_aware(self.day, 9),
        time_from=time(9, 0),
        time_to=time(10, 0),
    )
    current_end = Event(
        title="N",
        course_id=1,
        date=_aware(self.day, 11),
        time_from=time(11, 0),
        time_to=time(12, 0),
    )
    future = Event(
        title="F",
        course_id=1,
        date=_aware(self.day, 13),
        time_from=time(13, 0),
        time_to=time(14, 0),
    )
    self.assertTrue(is_past_event(past, tz, now=now))
    self.assertFalse(is_past_event(current_end, tz, now=now))  # time_to == now → not past
    self.assertFalse(is_past_event(future, tz, now=now))

def test_past_overlap_ignored_future_still_flagged(self):
    tz = ZoneInfo("UTC")
    now = datetime(2026, 7, 1, 12, 0, tzinfo=tz)
    past_a = Event(
        title="A", course_id=1, date=_aware(self.day, 9),
        time_from=time(9, 0), time_to=time(10, 30),
    )
    past_b = Event(
        title="B", course_id=1, date=_aware(self.day, 9, 30),
        time_from=time(9, 30), time_to=time(11, 0),
    )
    fut_a = Event(
        title="C", course_id=1, date=_aware(self.day, 13),
        time_from=time(13, 0), time_to=time(14, 30),
    )
    fut_b = Event(
        title="D", course_id=1, date=_aware(self.day, 13, 30),
        time_from=time(13, 30), time_to=time(15, 0),
    )
    self.assertFalse(
        has_overlapping_events([past_a, past_b], tz, now=now)
    )
    self.assertTrue(
        has_overlapping_events([past_a, past_b, fut_a, fut_b], tz, now=now)
    )
    clusters = find_overlap_clusters([past_a, past_b, fut_a, fut_b], tz, now=now)
    self.assertEqual(len(clusters), 1)
    self.assertEqual({ev.title for ev in clusters[0]}, {"C", "D"})
```

Update `has_overlapping_events` / `find_schedule_conflicts` signatures to accept and forward `now` / `ignore_past`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_course.tests.test_event_overlap.EventOverlapTests.test_is_past_event_by_time_to
./scripts/run_backend_tests.sh app_course.tests.test_event_overlap.EventOverlapTests.test_past_overlap_ignored_future_still_flagged
```

Expected: FAIL (import/attribute errors for `is_past_event` / unexpected kwargs).

- [ ] **Step 3: Implement past helpers and filter**

In `app_course/event_overlap.py`:

```python
from datetime import date, datetime, time

def event_end_datetime(event: Event, tz: ZoneInfo) -> datetime:
    local_day = event_local_date(event, tz)
    return datetime.combine(local_day, event.time_to, tzinfo=tz)

def is_past_event(
    event: Event, tz: ZoneInfo, *, now: datetime | None = None
) -> bool:
    now_local = (now or timezone.now()).astimezone(tz)
    return event_end_datetime(event, tz) < now_local

def find_overlap_clusters(
    events: list[Event],
    tz: ZoneInfo,
    *,
    now: datetime | None = None,
    ignore_past: bool = True,
) -> list[list[Event]]:
    if ignore_past:
        events = [ev for ev in events if not is_past_event(ev, tz, now=now)]
    # ... existing clustering body unchanged ...
```

Forward `now`/`ignore_past` through `has_overlapping_events`, `find_schedule_conflicts`, and `validate_no_overlapping_events`. Default `ignore_past=True` so all existing callers (save, resolve, data health) pick up the behavior.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_course.tests.test_event_overlap
```

Expected: PASS (including new tests).

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add app_course/event_overlap.py app_course/tests/test_event_overlap.py
git commit -m "feat(course): ignore past sessions in overlap clustering"
```

---

### Task 2: Backend Data Health reschedule (Fix) service + API

**Files:**
- Create: `schedjuice-reimagined-be/app_course/overlap_reschedule_services.py`
- Create: `schedjuice-reimagined-be/app_course/tests/test_overlap_reschedule.py`
- Modify: `schedjuice-reimagined-be/app_course/views.py`
- Modify: `schedjuice-reimagined-be/app_course/urls.py`

**Interfaces:**
- Consumes: `find_overlap_clusters`, `org_timezone`, `event_local_date` from `event_overlap`
- Produces:
  - `build_overlap_reschedule_preview(course, org) -> dict` — future clusters + event ids (no survivor/merge fields)
  - `apply_overlap_reschedule(course, org, *, event_ids: list[int], time_from: time, time_to: time) -> dict` — `@transaction.atomic`, updates only times, re-validates no future overlaps remain among updated set vs course schedule

Request body for apply:

```json
{
  "event_ids": [11, 12, 15],
  "time_from": "10:00:00",
  "time_to": "11:00:00"
}
```

- [ ] **Step 1: Write failing service tests**

Create `app_course/tests/test_overlap_reschedule.py` following patterns in `test_overlap_fix.py` (`schema_context`, `seed_rbac` if hitting views, `UserEvent` with check-in fields):

```python
def test_apply_reschedule_updates_times_keeps_user_events(self):
    # create course + two overlapping FUTURE events today afternoon
    # UserEvent on both with check_in / attendance_status
    # apply_overlap_reschedule(... event_ids=[a.id,b.id], time_from=10:00, time_to=11:00)
    # assert both events have new times
    # assert UserEvent ids and check_in values unchanged
    # assert has_overlapping_events(course events) is False

def test_apply_reschedule_rejects_invalid_range(self):
    # time_to <= time_from → ValidationError; no DB change

def test_apply_reschedule_is_atomic_on_failure(self):
    # monkeypatch Event.save or bulk_update to raise after first update
    # OR pass event_ids including one that would still overlap a third untouched future event
    # assert original times restored / unchanged when apply raises
```

For atomicity: prefer validating **before** writes that the new times clear overlaps for the whole course simulation; if validation fails, raise without writing. Additionally wrap writes in `@transaction.atomic`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_course.tests.test_overlap_reschedule
```

Expected: FAIL (module missing).

- [ ] **Step 3: Implement service**

`overlap_reschedule_services.py` sketch:

```python
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from app_course.event_overlap import (
    find_overlap_clusters,
    find_schedule_conflicts,
    org_timezone,
    event_local_date,
)
from app_course.models import Course, Event

def build_overlap_reschedule_preview(course: Course, org) -> dict:
    tz = org_timezone(org)
    events = list(Event.objects.filter(course_id=course.id).order_by("date", "time_from", "id"))
    clusters = find_overlap_clusters(events, tz)  # past already ignored
    return {
        "course_id": course.id,
        "has_overlaps": bool(clusters),
        "clusters": [
            {
                "local_date": event_local_date(cluster[0], tz).isoformat(),
                "events": [
                    {
                        "id": ev.id,
                        "time_from": ev.time_from.isoformat(),
                        "time_to": ev.time_to.isoformat(),
                    }
                    for ev in sorted(cluster, key=lambda e: e.time_from)
                ],
            }
            for cluster in clusters
        ],
        "summary": {
            "clusters_count": len(clusters),
            "events_count": sum(len(c) for c in clusters),
        },
    }

@transaction.atomic
def apply_overlap_reschedule(
    course: Course,
    org,
    *,
    event_ids: list[int],
    time_from,
    time_to,
) -> dict:
    if time_to <= time_from:
        raise ValidationError({"message": "End time must be after start time."})
    tz = org_timezone(org)
    qs = Event.objects.filter(course_id=course.id, id__in=event_ids).select_for_update()
    targets = list(qs)
    if len(targets) != len(set(event_ids)):
        raise ValidationError({"message": "One or more events were not found."})

    for ev in targets:
        ev.time_from = time_from
        ev.time_to = time_to
    # Simulate full course schedule with updates applied
    all_events = {
        e.id: e for e in Event.objects.filter(course_id=course.id)
    }
    for ev in targets:
        all_events[ev.id] = ev
    conflicts = find_schedule_conflicts(list(all_events.values()), tz)
    if conflicts:
        raise ValidationError(
            {
                "message": "Sessions cannot overlap on the same day.",
                "conflicts": conflicts,
            }
        )
    Event.objects.bulk_update(targets, ["time_from", "time_to"])
    return {
        "applied": True,
        "updated_event_ids": [ev.id for ev in targets],
        "time_from": time_from.isoformat(),
        "time_to": time_to.isoformat(),
    }
```

- [ ] **Step 4: Wire views + urls**

Mirror `OverlapFixPreviewView` / `OverlapFixApplyView` permission checks.

Routes:

```python
path(
    "courses/<int:course_id>/data-health/reschedule-overlapping-events/preview",
    views.OverlapReschedulePreviewView.as_view(),
),
path(
    "courses/<int:course_id>/data-health/reschedule-overlapping-events/apply",
    views.OverlapRescheduleApplyView.as_view(),
),
```

Apply view parses `event_ids`, `time_from`, `time_to` from `request.data`.

- [ ] **Step 5: Run tests**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_course.tests.test_overlap_reschedule
```

Expected: PASS.

- [ ] **Step 6: Commit** (only if user asked)

```bash
git add app_course/overlap_reschedule_services.py app_course/tests/test_overlap_reschedule.py app_course/views.py app_course/urls.py
git commit -m "feat(course): atomic reschedule apply for overlapping sessions"
```

---

### Task 3: Frontend past-event filter in calendar helpers

**Files:**
- Modify: `schedjuice-reimagined-fe/src/helpers/calendar.ts`
- Modify: `schedjuice-reimagined-fe/src/helpers/calendar-overlap.test.ts`
- Modify call sites that invoke overlap helpers to pass `orgTimezone` from tenant context:
  - `src/components/calendar/event-form.tsx`
  - `src/components/calendar/calendar.tsx`
  - `src/components/calendar/calendar-menu.tsx`

**Interfaces:**
- Produces:
  - `isPastEvent(event, orgTimezone, now?: Date): boolean` — uses `toUtcFromTenant(date, time_to, orgTimezone) < now`
  - Overlap helpers gain optional `options?: { orgTimezone?: string; now?: Date; ignorePast?: boolean }` (default `ignorePast: true` when `orgTimezone` provided)

- [ ] **Step 1: Write failing tests** in `calendar-overlap.test.ts`

```typescript
import { isPastEvent, findOverlappingEventOnDate, findOverlapClusters } from "./calendar";

describe("isPastEvent", () => {
  it("treats ended slots as past in org timezone", () => {
    const now = new Date("2026-07-07T12:00:00.000Z"); // noon UTC
    const past = baseEvent({
      id: 1,
      date: "2026-07-07",
      time_from: "09:00:00",
      time_to: "10:00:00",
    });
    const boundary = baseEvent({
      id: 2,
      date: "2026-07-07",
      time_from: "11:00:00",
      time_to: "12:00:00",
    });
    expect(isPastEvent(past, "UTC", now)).toBe(true);
    expect(isPastEvent(boundary, "UTC", now)).toBe(false);
  });
});

describe("findOverlappingEventOnDate ignores past", () => {
  it("does not return a past conflict", () => {
    const now = new Date("2026-07-07T12:00:00.000Z");
    const flat = [
      baseEvent({ id: 1, time_from: "09:00:00", time_to: "10:00:00" }),
    ];
    expect(
      findOverlappingEventOnDate(flat, "2026-07-07", "09:30:00", "10:30:00", undefined, {
        orgTimezone: "UTC",
        now,
        ignorePast: true,
      })
    ).toBeNull();
  });
});
```

Adapt the options parameter shape to whatever fits existing call signatures cleanly (prefer an options object as the last arg rather than inserting middle parameters).

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-fe
pnpm test src/helpers/calendar-overlap.test.ts
```

Expected: FAIL on missing `isPastEvent` / options.

- [ ] **Step 3: Implement**

In `calendar.ts`:

```typescript
import { toUtcFromTenant } from "@/helpers/timeslot";

export type OverlapCheckOptions = {
  orgTimezone?: string;
  now?: Date;
  ignorePast?: boolean;
};

export function isPastEvent(
  event: Partial<eventType>,
  orgTimezone: string,
  now: Date = new Date()
): boolean {
  const dateRaw = event.date as string | Date | undefined;
  if (!dateRaw || !event.time_to) return false;
  const dateStr =
    typeof dateRaw === "string"
      ? dateRaw.split("T")[0]
      : toISODateString(dateRaw);
  if (!dateStr) return false;
  const endUtc = toUtcFromTenant(dateStr, event.time_to, orgTimezone);
  return endUtc.getTime() < now.getTime();
}
```

In `getActiveEventsOnDate` / `findOverlapClusters` / `findOverlappingEventOnDate` / `hasOverlappingEventsInFlatList` / `wouldRecurringEventsOverlap`: when `options?.ignorePast !== false` and `options?.orgTimezone` is set, skip past events (and skip proposed recurring days whose end would already be past if easy; at minimum skip past *existing* conflicts).

Wire `tenant?.timezone || "UTC"` from existing calendar tenant context into form/save/bulk call sites.

- [ ] **Step 4: Run tests**

```bash
cd schedjuice-reimagined-fe
pnpm test src/helpers/calendar-overlap.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add src/helpers/calendar.ts src/helpers/calendar-overlap.test.ts src/components/calendar/event-form.tsx src/components/calendar/calendar.tsx src/components/calendar/calendar-menu.tsx
git commit -m "feat(calendar): ignore past sessions in overlap checks"
```

---

### Task 4: Frontend reschedule helper + dialog

**Files:**
- Create: `schedjuice-reimagined-fe/src/helpers/calendar-reschedule.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/calendar-reschedule.test.ts`
- Create: `schedjuice-reimagined-fe/src/components/calendar/reschedule-conflicts-dialog.tsx`

**Interfaces:**
- Produces:
  - `applySharedTimesToEvents(flatEvents, eventIds, time_from, time_to): Partial<eventType>[]` — maps matching ids; marks persisted rows `is_edit: true` when applicable
  - `rescheduleClearsOverlaps(flatEvents, orgTimezone, now?): boolean` — `!hasOverlappingEventsInFlatList(...)`

Dialog props:

```typescript
type RescheduleConflictsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflictCount: number;
  primaryLabel: "Apply & add" | "Apply";
  isSubmitting?: boolean;
  error?: string | null;
  onApply: (times: { time_from: string; time_to: string }) => void | Promise<void>;
};
```

UI: title “Reschedule conflicting sessions”; helper “{N} future sessions will use these times.”; two `TimeSelect`s (match event-form patterns); Cancel + primary.

- [ ] **Step 1: Write helper tests**

```typescript
it("applies the same times to all conflict ids", () => {
  const flat = [
    baseEvent({ id: 1, time_from: "09:00:00", time_to: "10:00:00" }),
    baseEvent({ id: 2, time_from: "09:30:00", time_to: "10:30:00" }),
    baseEvent({ id: 3, time_from: "14:00:00", time_to: "15:00:00" }),
  ];
  const next = applySharedTimesToEvents(flat, [1, 2], "11:00:00", "12:00:00");
  expect(next.find((e) => e.id === 1)?.time_from).toBe("11:00:00");
  expect(next.find((e) => e.id === 2)?.time_to).toBe("12:00:00");
  expect(next.find((e) => e.id === 3)?.time_from).toBe("14:00:00");
});
```

- [ ] **Step 2: Run failing test**

```bash
cd schedjuice-reimagined-fe
pnpm test src/helpers/calendar-reschedule.test.ts
```

- [ ] **Step 3: Implement helper + dialog**

Reuse `TimeSelect` / `Dialog` primitives already used by `event-form.tsx`. Validate `isClassTimeRangeValid` before calling `onApply`.

- [ ] **Step 4: Pass tests**

```bash
pnpm test src/helpers/calendar-reschedule.test.ts
```

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add src/helpers/calendar-reschedule.ts src/helpers/calendar-reschedule.test.ts src/components/calendar/reschedule-conflicts-dialog.tsx
git commit -m "feat(calendar): add reschedule conflicts dialog"
```

---

### Task 5: Wire Fix + Replace on Add Event form (Apply & add)

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/calendar/event-form.tsx`

**Behavior:**
1. On overlap, collect **all** future conflicting events for that day (or for recurring: all conflicting occurrence dates’ events) into `overlapConflictIds`.
2. Show two underlined buttons: **Fix** and **Replace** (rename existing replace link; update toast/error strings to say “replace” not “Replace conflicting session”).
3. **Fix** opens `RescheduleConflictsDialog` with `primaryLabel="Apply & add"`.
4. On apply: `applySharedTimesToEvents` → setEvents → re-check overlap with new session times → if clear, run the same append/edit logic as successful `onSubmit` and close; if not, set dialog error.

Also update `wouldRecurringEventsOverlap` call to pass org timezone options so past days do not block recurring adds.

- [ ] **Step 1: Implement wiring** (manual QA checklist below doubles as acceptance)

Collect conflicts:

```typescript
const conflicts = getActiveEventsOnDate(flat, isoDate, excludeId).filter((event) =>
  timeRangesOverlap(
    data.time_from!,
    data.time_to!,
    event.time_from || "0:0",
    event.time_to || "0:0"
  )
);
// with past filter via options
```

For recurring, gather unique conflicting event ids across dates returned by a small helper (extend `wouldRecurringEventsOverlap` to return ids or add `findRecurringOverlapConflicts`).

- [ ] **Step 2: Manual verification checklist**

- Add session overlapping a morning (past) slot → succeeds with no error.
- Add overlapping a future slot → sees **Fix** and **Replace**.
- Fix → new times → session added; conflict events show new times in calendar draft.
- Replace → existing merge behavior; attendance preserved on survivor after save.

- [ ] **Step 3: Commit** (only if user asked)

```bash
git add src/components/calendar/event-form.tsx
git commit -m "feat(calendar): Fix reschedule and Replace on add event overlap"
```

---

### Task 6: Wire Fix + Replace on save bar and bulk times

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/calendar/calendar.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/calendar/calendar-menu.tsx`

**Behavior:**
- Where the UI currently shows a single “Fix overlaps” button, show **Fix** (opens reschedule dialog, `primaryLabel="Apply"`) and **Replace** (existing `handleFixOverlaps` / `resolveScheduleOverlaps` `auto_global`).
- Update `SAVE_OVERLAP_ERROR` companion text from “Use Fix overlaps to resolve.” → “Use Fix or Replace to resolve.”
- On Fix Apply: update all event ids that appear in `findOverlapClusters(flat)` (future-only clusters), re-check, clear banner if clean.

- [ ] **Step 1: Implement UI + handlers**

Derive conflict ids:

```typescript
const clusters = findOverlapClusters(flatEvents, { orgTimezone, now });
const conflictIds = clusters.flat().map((e) => e.id).filter(Boolean);
```

- [ ] **Step 2: Manual verification**

- Save bar shows both actions; Fix clears overlaps without deleting events.
- Replace still merges and shows attendance-preserving toast.
- Bulk-times dialog same copy and behavior.

- [ ] **Step 3: Commit** (only if user asked)

```bash
git add src/components/calendar/calendar.tsx src/components/calendar/calendar-menu.tsx src/helpers/calendar.ts
git commit -m "feat(calendar): unified Fix and Replace on save and bulk times"
```

---

### Task 7: Data Health UI — Fix (reschedule) + Replace (merge)

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/course-insights.ts`
- Modify: `schedjuice-reimagined-fe/src/helpers/course-insights.ts`
- Modify: `schedjuice-reimagined-fe/src/components/course-insights/overlap-fix-preview-sheet.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/course-insights/course-insights-table.tsx` (entry labels if needed)

**Behavior:**
- Sheet title/description distinguishes modes.
- Actions: **Fix** opens `RescheduleConflictsDialog` (or inline times in sheet) → `POST .../reschedule-overlapping-events/apply` with all event ids from preview clusters + chosen times.
- **Replace** keeps current merge preview → `applyOverlapFix`.
- After either apply, invalidate `courseInsights` query.
- Copy: buttons labeled **Fix** / **Replace**; merge description still mentions attendance kept on survivor.

API helpers:

```typescript
export async function fetchOverlapReschedulePreview(courseId: number) { ... }
export async function applyOverlapReschedule(
  courseId: number,
  body: { event_ids: number[]; time_from: string; time_to: string }
) { ... }
```

- [ ] **Step 1: Add types + helpers**

- [ ] **Step 2: Update sheet UI** with both actions; Fix uses dialog; Replace uses existing mutation

- [ ] **Step 3: Manual verification**

- Health flag only for future overlaps (past-only duplicates disappear after Task 1).
- Fix updates times; UserEvents unchanged (spot-check attendance UI).
- Replace still merges safely.

- [ ] **Step 4: Commit** (only if user asked)

```bash
git add src/types/course-insights.ts src/helpers/course-insights.ts src/components/course-insights/overlap-fix-preview-sheet.tsx
git commit -m "feat(insights): Fix reschedule and Replace merge for overlaps"
```

---

### Task 8: Regression sweep + copy audit

**Files:**
- Grep FE/BE for old strings; update changelog entry if the project expects one under `src/content/changelog/entries.ts`

- [ ] **Step 1: Grep and fix leftover copy**

```bash
cd schedjuice-reimagined-fe
rg -n "Fix overlaps|Replace conflicting session|Use Fix overlaps" src
```

Replace with **Fix** / **Replace** / “Use Fix or Replace…”.

- [ ] **Step 2: Run full relevant test suites**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_course.tests.test_event_overlap app_course.tests.test_overlap_reschedule app_course.tests.test_overlap_fix app_course.tests.test_schedule_resolve_overlaps

cd ../schedjuice-reimagined-fe
pnpm test src/helpers/calendar-overlap.test.ts src/helpers/calendar-reschedule.test.ts src/helpers/calendar-overlap-resolve.test.ts
```

Expected: all PASS.

- [ ] **Step 3: Commit** (only if user asked)

```bash
git commit -m "chore: unify overlap Fix/Replace copy and verify regressions"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Past = `time_to < now` org TZ | 1, 3 |
| Ignore past on FE + BE validation | 1, 3 |
| Fix = shared times for all listed future conflicts | 4, 5, 6, 7 |
| Replace = existing merge | 5, 6, 7 (unchanged paths) |
| Unified Fix / Replace copy | 5, 6, 7, 8 |
| Apply & add after Fix on add form | 5 |
| Data Health Fix + Replace | 2, 7 |
| Attendance preserved | 2 (assert), 5–7 (Replace path unchanged) |
| `transaction.atomic` on persisted Fix/Replace | 2 (new); Replace already atomic |
| Conflicts payload future-only | 1 |
| Tests listed in spec | 1, 2, 3, 4, 8 |

## Self-review notes

- No TBD placeholders.
- Calendar Fix is draft-only (no new calendar API); Data Health Fix is the persisted atomic path — matches YAGNI.
- `has_overlapping_events(..., now=)` optional kwargs stay backward compatible with defaults.
`}
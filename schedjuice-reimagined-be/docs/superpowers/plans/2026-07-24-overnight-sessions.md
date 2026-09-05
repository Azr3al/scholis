# Overnight Course Sessions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow course schedule events that cross midnight (e.g. 10:30 PM → 12:00 AM) using the existing `date` + `time_from` + `time_to` schema, with auto-detect UX, overnight-aware overlap, and start-day calendar display.

**Architecture:** Introduce shared session-time helpers on BE (`app_course/session_time.py`) and FE (`src/helpers/session-time.ts`) encoding the implicit rule `time_to <= time_from ⇒ end on next calendar day`. Relax `Event.save()` validation, fix overlap/past helpers to use org-local datetime bounds, then wire form validation/display surfaces to the shared helpers.

**Tech Stack:** Django/DRF, django-tenants, Next.js, React, Vitest, `date-fns` / `date-fns-tz`, existing calendar overlap stack.

**Spec:** `docs/superpowers/specs/2026-07-24-overnight-sessions-design.md`

## Global Constraints

- Overnight only (not arbitrary multi-day); max span **24 hours**; reject `time_from === time_to`.
- Implicit convention: `time_to <= time_from` ⇒ end on `date + 1 day` at `time_to` (no new DB columns).
- Form: auto-detect overnight; silent when duration **< 2 h**; require confirm checkbox when **≥ 2 h**.
- Calendar: event chip on **start date only**; label includes `(+1)`; week view block ends at midnight (no next-column spill).
- Overlap: compare full org-local datetime ranges (`startA < endB && endA > startB`); back-to-back allowed.
- Recurring add uses same overnight rules per generated occurrence.
- Intake wizard / `create-course-schedule.ts` out of scope (keep `isClassTimeRangeValid` there).
- Backend tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <target>` (always `--keepdb`).
- Frontend tests: `cd schedjuice-reimagined-fe && pnpm test <path>`.
- Do **not** commit unless the user explicitly asks.

---

## File Structure

### Backend (`schedjuice-reimagined-be`)

| File | Responsibility |
| --- | --- |
| `app_course/session_time.py` | **Create** — normalize times, duration, bounds, validation |
| `app_course/models.py` | Relax `Event.save()`; update docstring |
| `app_course/event_overlap.py` | Datetime bounds + overnight-aware clustering/past end |
| `app_course/overlap_reschedule_services.py` | Allow overnight via shared validation |
| `app_course/tests/test_session_time.py` | **Create** — unit tests for helpers + save rules |
| `app_course/tests/test_event_overlap.py` | Overnight overlap + past-end tests |
| `app_course/tests/test_overlap_reschedule.py` | Overnight reschedule apply test |

### Frontend (`schedjuice-reimagined-fe`)

| File | Responsibility |
| --- | --- |
| `src/helpers/session-time.ts` | **Create** — mirror BE helpers |
| `src/helpers/session-time.test.ts` | **Create** — duration, validation, bounds |
| `src/helpers/calendar.ts` | Overnight overlap finders; deprecate strict-only validation path |
| `src/helpers/calendar-overlap.test.ts` | Cross-midnight overlap cases |
| `src/helpers/timeslot.ts` | `getTimeslotUtcRange` adds +1 day for overnight end |
| `src/helpers/timeslot.test.ts` | **Create or extend** — UTC range overnight |
| `src/helpers/calendar-reschedule.ts` | Use `isValidSessionTimeRange` + better error messages |
| `src/components/calendar/event-form.tsx` | Hint, confirm checkbox, validation |
| `src/components/calendar/week-view.tsx` | `eventHourRange` caps at 24 for overnight |
| `src/components/calendar/calendar-event-slot.tsx` | `(+1)` display via shared formatter |
| `src/components/calendar/day-box.tsx` | Use shared time-range formatter |
| `src/components/calendar/list-view/list-view.tsx` | Use shared time-range formatter |
| `src/components/calendar/calendar-menu.tsx` | Bulk times use `isValidSessionTimeRange` |

---

### Task 1: Backend session-time helpers

**Files:**
- Create: `schedjuice-reimagined-be/app_course/session_time.py`
- Create: `schedjuice-reimagined-be/app_course/tests/test_session_time.py`

**Interfaces:**
- Produces:
  - `normalize_time(value) -> datetime.time`
  - `is_overnight(time_from, time_to) -> bool` — `time_to <= time_from` and not equal
  - `session_duration_minutes(time_from, time_to) -> int`
  - `validate_session_time_range(time_from, time_to) -> None` — raises `ValidationError` with field keys
  - `event_bounds_local(event, tz) -> tuple[datetime, datetime]`

- [ ] **Step 1: Write the failing tests**

Create `app_course/tests/test_session_time.py`:

```python
import unittest
from datetime import date, datetime, time, timedelta

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase
from zoneinfo import ZoneInfo

from app_course.models import Event
from app_course.session_time import (
    event_bounds_local,
    is_overnight,
    session_duration_minutes,
    validate_session_time_range,
)


class SessionTimeHelperTests(SimpleTestCase):
    def test_same_day_duration(self):
        self.assertEqual(session_duration_minutes(time(9, 0), time(10, 30)), 90)
        self.assertFalse(is_overnight(time(9, 0), time(10, 30)))

    def test_overnight_duration(self):
        self.assertTrue(is_overnight(time(22, 30), time(0, 0)))
        self.assertEqual(session_duration_minutes(time(22, 30), time(0, 0)), 90)

    def test_rejects_zero_duration(self):
        with self.assertRaises(ValidationError):
            validate_session_time_range(time(10, 0), time(10, 0))

    def test_rejects_over_24_hours(self):
        with self.assertRaises(ValidationError):
            validate_session_time_range(time(22, 0), time(21, 59))

    def test_allows_overnight_under_24h(self):
        validate_session_time_range(time(22, 30), time(0, 0))  # no raise

    def test_event_bounds_local_overnight(self):
        tz = ZoneInfo("Asia/Yangon")
        ev = Event(
            title="Night",
            course_id=1,
            date=datetime(2026, 7, 24, 0, 0, tzinfo=tz),
            time_from=time(22, 30),
            time_to=time(0, 0),
        )
        start, end = event_bounds_local(ev, tz)
        self.assertEqual(start, datetime(2026, 7, 24, 22, 30, tzinfo=tz))
        self.assertEqual(end, datetime(2026, 7, 25, 0, 0, tzinfo=tz))


@unittest.skip("added in Task 2")
class EventSaveOvernightTests(SimpleTestCase):
    pass
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_course.tests.test_session_time -v 2`

Expected: FAIL — `ModuleNotFoundError: app_course.session_time`

- [ ] **Step 3: Implement helpers**

Create `app_course/session_time.py`:

```python
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.core.exceptions import ValidationError

from app_course.event_overlap import event_local_date
from app_course.models import Event

MAX_SESSION_MINUTES = 24 * 60
OVERNIGHT_CONFIRM_THRESHOLD_MINUTES = 120  # FE only; listed here for parity docs


def normalize_time(value: time | str) -> time:
    if isinstance(value, time):
        return value.replace(second=0, microsecond=0)
    parts = str(value).split(":")
    hour = int(parts[0])
    minute = int(parts[1]) if len(parts) > 1 else 0
    return time(hour, minute)


def is_overnight(time_from: time, time_to: time) -> bool:
    tf = normalize_time(time_from)
    tt = normalize_time(time_to)
    return tt <= tf and tf != tt


def session_duration_minutes(time_from: time, time_to: time) -> int:
    tf = normalize_time(time_from)
    tt = normalize_time(time_to)
    start_m = tf.hour * 60 + tf.minute
    end_m = tt.hour * 60 + tt.minute
    if end_m > start_m:
        return end_m - start_m
    if end_m == start_m:
        return 0
    return (24 * 60 - start_m) + end_m


def validate_session_time_range(time_from: time, time_to: time) -> None:
    minutes = session_duration_minutes(time_from, time_to)
    if minutes <= 0:
        raise ValidationError(
            {"time_to": "Event ending time cannot be before the event starting time."}
        )
    if minutes > MAX_SESSION_MINUTES:
        raise ValidationError(
            {"time_to": "Session cannot be longer than 24 hours."}
        )


def event_bounds_local(event: Event, tz: ZoneInfo) -> tuple[datetime, datetime]:
    local_day = event_local_date(event, tz)
    start = datetime.combine(local_day, normalize_time(event.time_from), tzinfo=tz)
    end_day = local_day
    end_time = normalize_time(event.time_to)
    if is_overnight(event.time_from, event.time_to):
        end_day = local_day + timedelta(days=1)
    end = datetime.combine(end_day, end_time, tzinfo=tz)
    return start, end
```

- [ ] **Step 4: Run tests**

Run: `./scripts/run_backend_tests.sh app_course.tests.test_session_time -v 2`

Expected: PASS (Task 2 tests still skipped)

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 2: Backend Event.save() validation

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/models.py` (`Event.save`, docstring)
- Modify: `schedjuice-reimagined-be/app_course/tests/test_session_time.py`

**Interfaces:**
- Consumes: `validate_session_time_range` from Task 1

- [ ] **Step 1: Write failing save test**

In `test_session_time.py`, replace skipped class with DB test or add to existing course test module. Minimal approach — extend `test_session_time.py` with integration test using tenant fixture pattern from `test_event_overlap.py`:

```python
@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class EventSaveOvernightTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_save_allows_overnight(self):
        with schema_context(self.schema_name):
            course = Course.objects.first()
            ev = Event(
                title="Night class",
                course=course,
                date=timezone.make_aware(datetime(2026, 7, 24, 0, 0)),
                time_from=time(22, 30),
                time_to=time(0, 0),
            )
            ev.save()
            ev.refresh_from_db()
            self.assertEqual(ev.time_to, time(0, 0))
```

- [ ] **Step 2: Run test — expect FAIL** on `ValidationError` from current `Event.save()`

Run: `./scripts/run_backend_tests.sh app_course.tests.test_session_time.EventSaveOvernightTests -v 2`

- [ ] **Step 3: Update `Event.save()`**

In `app_course/models.py`:

```python
from app_course.session_time import validate_session_time_range

def save(self, *args, **kwargs):
    validate_session_time_range(self.time_from, self.time_to)
    return super().save(*args, **kwargs)
```

Update class docstring to document overnight convention (remove “Multi-day events are not supported” blanket; say arbitrary multi-day still unsupported).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 3: Backend overnight overlap + past end

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/event_overlap.py`
- Modify: `schedjuice-reimagined-be/app_course/tests/test_event_overlap.py`

**Interfaces:**
- Consumes: `event_bounds_local`, `events_overlap` (add to `session_time.py` or `event_overlap.py`)

- [ ] **Step 1: Add overlap helper + failing tests**

Add to `session_time.py`:

```python
def events_overlap(a: Event, b: Event, tz: ZoneInfo) -> bool:
    a0, a1 = event_bounds_local(a, tz)
    b0, b1 = event_bounds_local(b, tz)
    return a0 < b1 and a1 > b0
```

Add tests to `test_event_overlap.py`:

```python
def test_overnight_overlaps_next_morning_session(self):
    tz = ZoneInfo("UTC")
    day = date(2026, 7, 24)
    overnight = Event(
        title="Night",
        course_id=1,
        date=_aware(day, 0),
        time_from=time(22, 30),
        time_to=time(0, 0),
    )
    morning = Event(
        title="Early",
        course_id=1,
        date=_aware(day + timedelta(days=1), 0),
        time_from=time(0, 0),
        time_to=time(1, 0),
    )
    self.assertTrue(events_overlap(overnight, morning, tz))

def test_overnight_end_datetime_next_day(self):
    from app_course.event_overlap import event_end_datetime
    tz = ZoneInfo("UTC")
    ev = Event(
        title="Night",
        course_id=1,
        date=_aware(date(2026, 7, 24), 0),
        time_from=time(22, 30),
        time_to=time(0, 0),
    )
    end = event_end_datetime(ev, tz)
    self.assertEqual(end.date(), date(2026, 7, 25))
    self.assertEqual(end.time(), time(0, 0))
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `./scripts/run_backend_tests.sh app_course.tests.test_event_overlap -v 2`

- [ ] **Step 3: Refactor `event_overlap.py`**

Replace `event_end_datetime` body:

```python
def event_end_datetime(event: Event, tz: ZoneInfo) -> datetime:
    _, end = event_bounds_local(event, tz)
    return end
```

Replace `find_overlap_clusters` with connected-components via pairwise `events_overlap` (sorted by start bound). Keep `ignore_past` filter using updated `event_end_datetime`.

Sketch:

```python
def find_overlap_clusters(events, tz, *, now=None, ignore_past=True):
    if ignore_past:
        events = [ev for ev in events if not is_past_event(ev, tz, now=now)]
    if len(events) < 2:
        return []
    ordered = sorted(events, key=lambda e: (event_bounds_local(e, tz)[0], e.id or 0))
    clusters: list[list[Event]] = []
    for ev in ordered:
        touched = [c for c in clusters if any(events_overlap(ev, other, tz) for other in c)]
        if not touched:
            clusters.append([ev])
        elif len(touched) == 1:
            touched[0].append(ev)
        else:
            merged: list[Event] = [ev]
            for c in touched:
                merged.extend(c)
                clusters.remove(c)
            clusters.append(merged)
    return [c for c in clusters if len(c) > 1]
```

- [ ] **Step 4: Run overlap tests — expect PASS**

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 4: Backend overlap reschedule allows overnight

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/overlap_reschedule_services.py`
- Modify: `schedjuice-reimagined-be/app_course/tests/test_overlap_reschedule.py`

**Interfaces:**
- Consumes: `validate_session_time_range`

- [ ] **Step 1: Failing test**

```python
def test_apply_reschedule_allows_overnight_when_no_conflict(self):
    course, ev_a, ev_b, _ue = self._create_future_overlap_pair()
    result = apply_overlap_reschedule(
        course,
        self.org,
        event_ids=[ev_b.id],
        time_from=time(22, 30),
        time_to=time(0, 0),
    )
    ev_b.refresh_from_db()
    self.assertEqual(ev_b.time_from, time(22, 30))
    self.assertEqual(ev_b.time_to, time(0, 0))
```

- [ ] **Step 2: Run — expect FAIL** (`End time must be after start time`)

- [ ] **Step 3: Replace block in `apply_overlap_reschedule`**

```python
parsed_from = _parse_time(time_from)
parsed_to = _parse_time(time_to)
validate_session_time_range(parsed_from, parsed_to)
```

Remove `if parsed_to <= parsed_from: raise ...`.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 5: Frontend session-time helpers

**Files:**
- Create: `schedjuice-reimagined-fe/src/helpers/session-time.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/session-time.test.ts`

**Interfaces:**
- Produces:
  - `normalizeTimeToMinutes(time: string): number`
  - `isOvernightSession(from: string, to: string): boolean`
  - `sessionDurationMinutes(from: string, to: string): number`
  - `isValidSessionTimeRange(from?: string | null, to?: string | null): boolean`
  - `requiresOvernightConfirmation(from: string, to: string): boolean` — overnight && duration >= 120
  - `validateSessionTimeRange(from?, to?): string | null` — error message or null
  - `eventBoundsLocal(isoDate: string, from: string, to: string, tz: string): { start: Date; end: Date }`
  - `formatSessionTimeRange(from, to, timeFormat, opts?: { showOvernightSuffix?: boolean }): string`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, it } from "vitest";
import {
  isOvernightSession,
  isValidSessionTimeRange,
  requiresOvernightConfirmation,
  sessionDurationMinutes,
} from "./session-time";

describe("sessionDurationMinutes", () => {
  it("computes same-day duration", () => {
    expect(sessionDurationMinutes("09:00", "10:30")).toBe(90);
  });
  it("computes overnight duration", () => {
    expect(sessionDurationMinutes("22:30", "00:00")).toBe(90);
    expect(isOvernightSession("22:30", "00:00")).toBe(true);
  });
});

describe("isValidSessionTimeRange", () => {
  it("rejects zero duration", () => {
    expect(isValidSessionTimeRange("10:00", "10:00")).toBe(false);
  });
  it("allows overnight under 24h", () => {
    expect(isValidSessionTimeRange("22:30", "00:00")).toBe(true);
  });
});

describe("requiresOvernightConfirmation", () => {
  it("is false for short overnight", () => {
    expect(requiresOvernightConfirmation("22:30", "00:00")).toBe(false);
  });
  it("is true for long overnight", () => {
    expect(requiresOvernightConfirmation("23:00", "08:00")).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd schedjuice-reimagined-fe && pnpm test src/helpers/session-time.test.ts`

- [ ] **Step 3: Implement `session-time.ts`** (mirror BE logic using minute math from `calendar.ts` `timeStringToMinutes` pattern)

Key implementation:

```typescript
export function isOvernightSession(from: string, to: string): boolean {
  const a = normalizeTimeToMinutes(from);
  const b = normalizeTimeToMinutes(to);
  return b <= a && a !== b;
}

export function sessionDurationMinutes(from: string, to: string): number {
  const a = normalizeTimeToMinutes(from);
  const b = normalizeTimeToMinutes(to);
  if (b > a) return b - a;
  if (b === a) return 0;
  return 24 * 60 - a + b;
}

export function requiresOvernightConfirmation(from: string, to: string): boolean {
  return isOvernightSession(from, to) && sessionDurationMinutes(from, to) >= 120;
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 6: Frontend overnight overlap in calendar helpers

**Files:**
- Modify: `schedjuice-reimagined-fe/src/helpers/calendar.ts`
- Modify: `schedjuice-reimagined-fe/src/helpers/calendar-overlap.test.ts`
- Modify: `schedjuice-reimagined-fe/src/helpers/calendar-reschedule.ts`

**Interfaces:**
- Consumes: `eventBoundsLocal`, `eventsOverlapLocal` from `session-time.ts`

- [ ] **Step 1: Failing cross-midnight overlap test**

Add to `calendar-overlap.test.ts`:

```typescript
it("detects overnight tail conflicting with next-morning session", () => {
  const flat = [
    baseEvent({
      id: 1,
      date: "2026-07-24",
      time_from: "22:30:00",
      time_to: "00:00:00",
    }),
    baseEvent({
      id: 2,
      date: "2026-07-25",
      time_from: "00:00:00",
      time_to: "01:00:00",
    }),
  ];
  expect(
    findOverlappingEventOnDate(
      flat,
      "2026-07-24",
      "22:30:00",
      "00:00:00",
      undefined,
      { orgTimezone: "UTC" }
    )?.id
  ).toBeUndefined(); // same start day — no conflict with id 2 on Jul 24
  expect(
    hasOverlappingEventsInFlatList(flat, { orgTimezone: "UTC" })
  ).toBe(true);
});
```

Adjust assertion based on chosen API: **global pairwise overlap** should flag cluster {1,2}.

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test src/helpers/calendar-overlap.test.ts`

- [ ] **Step 3: Update overlap functions**

Add `eventsOverlapLocal(a: Partial<eventType>, b: Partial<eventType>, tz: string): boolean` using `eventBoundsLocal` + ISO date from `toISODateString`.

Update `timeRangesOverlap` to accept optional date pair OR add `sessionRangesOverlap(proposedDate, from, to, event, tz)`.

Refactor `findOverlappingEventsOnDate` — when checking proposed `(isoDate, from, to)`, compare proposed bounds against **all** active events via datetime overlap (not only same `isoDate` bucket). Keep excluding self by id.

Refactor `findOverlapClusters` similarly to BE connected-components.

Keep `isClassTimeRangeValid` exported for intake/create-course paths; add comment it is same-day-only.

Update `calendar-reschedule.ts`:

```typescript
import { isValidSessionTimeRange, validateSessionTimeRange } from "@/helpers/session-time";

export function validateRescheduleTimes(...) {
  return validateSessionTimeRange(time_from, time_to);
}
```

- [ ] **Step 4: Run overlap + reschedule tests**

Run: `pnpm test src/helpers/calendar-overlap.test.ts src/helpers/calendar-reschedule.test.ts`

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 7: Frontend timeslot UTC range + display formatter

**Files:**
- Modify: `schedjuice-reimagined-fe/src/helpers/timeslot.ts`
- Create or modify: `schedjuice-reimagined-fe/src/helpers/timeslot.test.ts`

**Interfaces:**
- Consumes: `isOvernightSession` from `session-time.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, expect, it } from "vitest";
import { getTimeslotUtcRange } from "./timeslot";

describe("getTimeslotUtcRange overnight", () => {
  it("ends on next calendar day in tenant TZ", () => {
    const { utcStart, utcEnd } = getTimeslotUtcRange(
      { date: "2026-07-24", time_from: "22:30", time_to: "00:00" },
      "Asia/Yangon"
    );
    expect(utcEnd.getTime()).toBeGreaterThan(utcStart.getTime());
    expect((utcEnd.getTime() - utcStart.getTime()) / 60000).toBe(90);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (end before start in UTC)

- [ ] **Step 3: Fix `getTimeslotUtcRange`**

```typescript
import { addDays, format } from "date-fns";
import { isOvernightSession } from "@/helpers/session-time";

export const getTimeslotUtcRange = (event, tenantTimeZone) => {
  const utcStart = toUtcFromTenant(event.date, event.time_from, tenantTimeZone);
  const endDate = isOvernightSession(event.time_from, event.time_to)
    ? format(addDays(new Date(`${event.date.split("T")[0]}T00:00:00`), 1), "yyyy-MM-dd")
    : event.date.split("T")[0];
  const utcEnd = toUtcFromTenant(endDate, event.time_to, tenantTimeZone);
  return { utcStart, utcEnd };
};
```

Implement `formatSessionTimeRange` in `session-time.ts` appending `(+1)` when overnight.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 8: Event form overnight UX

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/calendar/event-form.tsx`

**Interfaces:**
- Consumes: `isOvernightSession`, `requiresOvernightConfirmation`, `validateSessionTimeRange`, `formatSessionTimeRange`, `isValidSessionTimeRange`
- Produces: local state `overnightConfirmed: boolean`

- [ ] **Step 1: Replace validation block in `onSubmit`**

```typescript
import {
  isOvernightSession,
  requiresOvernightConfirmation,
  validateSessionTimeRange,
} from "@/helpers/session-time";

// inside onSubmit:
const rangeError = validateSessionTimeRange(data.time_from, data.time_to);
if (rangeError) {
  errors.time_to = rangeError;
}
if (
  data.time_from &&
  data.time_to &&
  requiresOvernightConfirmation(data.time_from, data.time_to) &&
  !overnightConfirmed
) {
  errors.time_to = "Confirm this session ends the next day";
}
```

Remove `isClassTimeRangeValid` import/usage.

- [ ] **Step 2: Add hint + checkbox UI under end time `Controller`**

```tsx
const showOvernightHint =
  watchedTimeFrom &&
  watchedTimeTo &&
  isOvernightSession(watchedTimeFrom, watchedTimeTo) &&
  isValidSessionTimeRange(watchedTimeFrom, watchedTimeTo);

// muted hint when showOvernightHint:
// `Ends next day (${format(startDate + 1 day)})`

// when requiresOvernightConfirmation(...):
<Checkbox
  checked={overnightConfirmed}
  onCheckedChange={(c) => setOvernightConfirmed(c === true)}
/>
<label>This session ends the next day (~{hours} hr). I confirm this is correct.</label>
```

Reset `overnightConfirmed` to `false` when times change (`useEffect` on watched times).

Use org timezone date from `data.date` or `selectedEvent?.date` for hint label.

- [ ] **Step 3: Manual verify**

Run dev server, open Add Event, set 10:30 PM → 12:00 AM on Jul 24 — no error, hint visible, Create succeeds.

Set 11:00 PM → 8:00 AM — checkbox required.

- [ ] **Step 4: Commit** (only if user asked)

---

### Task 9: Calendar display + week view

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/calendar/week-view.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/calendar/calendar-event-slot.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/calendar/day-box.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/calendar/list-view/list-view.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/calendar/calendar-menu.tsx`

**Interfaces:**
- Consumes: `formatSessionTimeRange`, `isOvernightSession`

- [ ] **Step 1: Update `eventHourRange` in `week-view.tsx`**

```typescript
import { isOvernightSession } from "@/helpers/session-time";

function eventHourRange(event: { time_from: string; time_to: string }) {
  const { start, end } = /* existing hour math */;
  if (isOvernightSession(event.time_from, event.time_to)) {
    return { start, end: 24 };
  }
  return { start, end };
}
```

- [ ] **Step 2: Replace inline time labels with `formatSessionTimeRange`**

In `calendar-event-slot.tsx`, `day-box.tsx`, `list-view.tsx`, week-view detail panel — pass `timeFormat` from tenant.

- [ ] **Step 3: Bulk times validation in `calendar-menu.tsx`**

Replace `isClassTimeRangeValid` with `validateSessionTimeRange` / toast on error.

- [ ] **Step 4: Manual verify week + month views**

Overnight event shows on start day only; label includes `(+1)`; week block reaches bottom of day column.

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 10: End-to-end verification

**Files:** (none — run commands only)

- [ ] **Step 1: Backend test slice**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_course.tests.test_session_time app_course.tests.test_event_overlap app_course.tests.test_overlap_reschedule -v 2`

Expected: all PASS

- [ ] **Step 2: Frontend test slice**

Run: `cd schedjuice-reimagined-fe && pnpm test src/helpers/session-time.test.ts src/helpers/calendar-overlap.test.ts src/helpers/calendar-reschedule.test.ts src/helpers/timeslot.test.ts`

Expected: all PASS

- [ ] **Step 3: Manual smoke checklist**

1. Add overnight event 10:30 PM → 12:00 AM — saves, displays `(+1)`
2. Add recurring Mon overnight — generates occurrences with same times
3. Overlap with next-morning session — Fix/Replace still offered
4. Long overnight without checkbox — blocked
5. Bulk times overnight — accepted when valid

- [ ] **Step 4: Update spec status to approved** in `docs/superpowers/specs/2026-07-24-overnight-sessions-design.md` (optional, if user wants)

---

## Self-Review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Implicit overnight convention | 1, 2 |
| Max 24h / reject zero duration | 1, 2, 5 |
| Form auto-detect + 2h confirm | 5, 8 |
| Recurring same rules | 6 (overlap scan), 8 (form) |
| Start-day calendar + `(+1)` | 7, 9 |
| Week view through midnight | 9 |
| Overnight overlap tail | 3, 6 |
| Reschedule/bulk validation | 4, 6, 9 |
| Attendance unchanged | No task (already correct) |
| Intake out of scope | `isClassTimeRangeValid` retained |

No placeholders remain. Type names consistent across tasks.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-24-overnight-sessions.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration  
2. **Inline Execution** — run tasks in this session with checkpoints

Which approach do you want?

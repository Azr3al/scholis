# Event-Duration Payroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze scheduled session bounds on first teacher check-in and bill `tr_phillips` payroll / cash-flow from that exact event duration, with check-in/out duration as legacy fallback.

**Architecture:** Add nullable `event_time_from_at_calculation` / `event_time_to_at_calculation` on `UserEvent`. On first teacher check-in, copy live `Event` bounds (date + `time_from`/`time_to` in tenant TZ → UTC datetimes) write-once via `freeze_teacher_payroll_snapshots` and the live check-in POST path. `get_tr_payments_trphillips` (and thus cash-flow) uses exact snapshot duration when valid; otherwise keeps today’s half-hour–rounded check-in/out hours. Payroll response still puts the **billable** window in `checkin_time` / `checkout_time` so the FE Time Log needs no change.

**Tech Stack:** Django/DRF, django-tenants, existing `app_attendance.payroll_snapshots`, `app_hr.payroll_funcs`, `./scripts/run_backend_tests.sh` (always `--keepdb`).

**Spec:** `docs/superpowers/specs/2026-07-21-event-duration-payroll-design.md`

## Global Constraints

- Primary work in `schedjuice-reimagined-be`; FE Time Log needs **no** code change if payroll rows keep exposing billable times as `checkin_time` / `checkout_time`.
- No backfill migration of historical rows.
- No finance editor for frozen event times.
- Do not change check-in window / checkout-cap policy (still live `Event`).
- Do not change `session_based` pay math (still per-session × count); still freeze event bounds on first teacher check-in.
- Tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <dotted.target>` (script adds `--keepdb --noinput`). Prefer high-value tests (auth/edge/fallback/write-once); at most one thin success path per behavior unit.
- Do **not** commit unless the user explicitly asks (omit git commit steps until requested).
- Leave unrelated WIP in the working tree untouched.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `app_attendance/models.py` | New nullable snapshot DateTimeFields on `UserEvent` |
| `app_attendance/migrations/0016_*.py` | Schema migration (next number after `0015`) |
| `app_attendance/payroll_snapshots.py` | Freeze event bounds (even when rate freeze skipped); shared UTC combine helper |
| `app_attendance/views.py` | Live check-in POST also freezes event bounds |
| `app_attendance/self_correction.py` | Include new fields in `update_fields` on first backfill |
| `app_hr/payroll_funcs.py` | `session_billable_hours` (+ billable window); use in `get_tr_payments_trphillips` |
| `app_hr/test_payroll_funcs_trphillips.py` | Unit tests for hours helper + payroll hours source |
| `app_attendance/tests/test_event_bounds_freeze.py` | Freeze write-once, session_based, schedule-after-freeze |

**No FE file changes** (payroll page already renders `checkin_time`–`checkout_time`).

---

### Task 1: Schema — freeze fields on `UserEvent`

**Files:**
- Modify: `app_attendance/models.py` (after `per_hour_price_at_calculation`)
- Create: `app_attendance/migrations/0016_userevent_event_time_bounds_at_calculation.py` (name may vary; use `makemigrations`)

**Interfaces:**
- Consumes: existing `UserEvent` payroll snapshot fields
- Produces: `UserEvent.event_time_from_at_calculation: datetime | None`, `UserEvent.event_time_to_at_calculation: datetime | None`

- [ ] **Step 1: Add model fields**

In `app_attendance/models.py`, after `per_hour_price_at_calculation`:

```python
    event_time_from_at_calculation = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Frozen Event session start (UTC) at first teacher check-in; used for billable hours.",
    )
    event_time_to_at_calculation = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Frozen Event session end (UTC) at first teacher check-in; used for billable hours.",
    )
```

- [ ] **Step 2: Generate migration**

```bash
cd schedjuice-reimagined-be
./env/bin/python manage.py makemigrations app_attendance --name userevent_event_time_bounds_at_calculation
```

Expected: new migration under `app_attendance/migrations/` adding both nullable DateTimeFields.

- [ ] **Step 3: Sanity-check migration applies in test DB**

```bash
./scripts/run_backend_tests.sh app_attendance.tests.test_userevent_serializer
```

Expected: PASS (existing suite); confirms migration loads with `--keepdb`.

---

### Task 2: Billable hours helper + wire into `tr_phillips` payroll

**Files:**
- Modify: `app_hr/payroll_funcs.py`
- Modify: `app_hr/test_payroll_funcs_trphillips.py`

**Interfaces:**
- Consumes: `UserEvent` with optional freeze fields + `checkin_time` / `checkout_time`
- Produces:
  - `session_billable_window(ue) -> tuple[datetime, datetime] | None` — billable from/to for display and duration; `None` if neither path yields positive hours
  - `session_billable_hours(ue) -> float` — hours for aggregates (0 if no billable window)
  - `get_tr_payments_trphillips` row `checkin_time` / `checkout_time` / `hours` come from billable window (cash-flow inherits via `get_cash_flow_trphillips`)

- [ ] **Step 1: Write failing unit tests**

Extend `app_hr/test_payroll_funcs_trphillips.py`. Update `_make_ue` to default freeze fields to `None`. Add:

```python
from app_hr.payroll_funcs import (
    _effective_trphillips_hourly_rate,
    get_tr_payments_trphillips,
    session_billable_hours,
    session_billable_window,
)


def _make_ue(
    course_id,
    event_id,
    hourly,
    bonus,
    student_count,
    *,
    is_extra=False,
    checkin_time=None,
    checkout_time=None,
    event_time_from_at_calculation=None,
    event_time_to_at_calculation=None,
):
    ue = MagicMock()
    ue.event.course.id = course_id
    ue.event.id = event_id
    ue.event.date = datetime(2025, 3, 15, 10, 0, tzinfo=timezone.utc)
    ue.event.course.title = "Course"
    ue.user.name = "Teacher"
    ue.hourly_rate_at_calculation = hourly
    ue.student_bonus_rate_at_calculation = bonus
    ue.student_count_in_course_at_calculation = student_count
    ue.is_extra_class = is_extra
    ue.checkin_time = checkin_time or datetime(2025, 3, 15, 10, 0, tzinfo=timezone.utc)
    ue.checkout_time = checkout_time or datetime(2025, 3, 15, 15, 0, tzinfo=timezone.utc)
    ue.per_hour_price_at_calculation = None
    ue.event_time_from_at_calculation = event_time_from_at_calculation
    ue.event_time_to_at_calculation = event_time_to_at_calculation
    return ue


class SessionBillableHoursTests(SimpleTestCase):
    def test_uses_exact_frozen_event_duration(self):
        ue = _make_ue(
            1, 1, 1000, 0, 1,
            checkin_time=datetime(2025, 3, 15, 10, 20, tzinfo=timezone.utc),
            checkout_time=datetime(2025, 3, 15, 11, 10, tzinfo=timezone.utc),
            event_time_from_at_calculation=datetime(2025, 3, 15, 10, 0, tzinfo=timezone.utc),
            event_time_to_at_calculation=datetime(2025, 3, 15, 12, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(session_billable_hours(ue), 2.0)
        win = session_billable_window(ue)
        self.assertEqual(win[0], ue.event_time_from_at_calculation)
        self.assertEqual(win[1], ue.event_time_to_at_calculation)

    def test_fallback_half_hour_checkin_when_no_snapshot(self):
        # 10:20 → 10:30, 11:10 → 11:00 → 0.5h with existing round_to_closest_half_hour
        ue = _make_ue(
            1, 1, 1000, 0, 1,
            checkin_time=datetime(2025, 3, 15, 10, 20, tzinfo=timezone.utc),
            checkout_time=datetime(2025, 3, 15, 11, 10, tzinfo=timezone.utc),
        )
        self.assertEqual(session_billable_hours(ue), 0.5)

    def test_partial_snapshot_falls_back(self):
        ue = _make_ue(
            1, 1, 1000, 0, 1,
            event_time_from_at_calculation=datetime(2025, 3, 15, 10, 0, tzinfo=timezone.utc),
            event_time_to_at_calculation=None,
        )
        self.assertEqual(session_billable_hours(ue), 5.0)  # default 10:00–15:00 in _make_ue

    def test_invalid_snapshot_to_le_from_falls_back(self):
        ue = _make_ue(
            1, 1, 1000, 0, 1,
            checkin_time=datetime(2025, 3, 15, 10, 0, tzinfo=timezone.utc),
            checkout_time=datetime(2025, 3, 15, 12, 0, tzinfo=timezone.utc),
            event_time_from_at_calculation=datetime(2025, 3, 15, 12, 0, tzinfo=timezone.utc),
            event_time_to_at_calculation=datetime(2025, 3, 15, 10, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(session_billable_hours(ue), 2.0)


@patch("app_hr.payroll_funcs.UserEvent.objects.filter")
class GetTrPaymentsUsesBillableHoursTests(SimpleTestCase):
    def test_late_checkin_still_pays_frozen_event_hours(self, mock_filter):
        ue = _make_ue(
            1, 1, 1000, 0, 1,
            checkin_time=datetime(2025, 3, 15, 10, 30, tzinfo=timezone.utc),
            checkout_time=datetime(2025, 3, 15, 11, 0, tzinfo=timezone.utc),
            event_time_from_at_calculation=datetime(2025, 3, 15, 10, 0, tzinfo=timezone.utc),
            event_time_to_at_calculation=datetime(2025, 3, 15, 12, 0, tzinfo=timezone.utc),
        )
        mock_filter.return_value.order_by.return_value.prefetch_related.return_value.all.return_value = [
            ue
        ]
        teacher = MagicMock()
        teacher.id = 42
        result = get_tr_payments_trphillips(teacher, 3, 2025, "UTC", course_id=None)
        self.assertEqual(result["data"][0]["hours"], 2.0)
        self.assertEqual(
            result["data"][0]["checkin_time"],
            ue.event_time_from_at_calculation,
        )
        self.assertEqual(
            result["data"][0]["checkout_time"],
            ue.event_time_to_at_calculation,
        )
        # reg=2, <=16 → 2 * 1000
        self.assertAlmostEqual(result["aggregate"]["total_earnings"], 2000.0, places=5)
```

Keep existing weighted-rate tests; they mock `get_diff_in_hours` — after this task, either:

- remove the `@patch("app_hr.payroll_funcs.get_diff_in_hours", return_value=5.0)` and set freeze fields to a 5h window on `_make_ue` defaults used by those tests, **or**
- keep default check-in/out at 10:00–15:00 (5h) with no freeze so fallback still yields 5.0 without mocking `get_diff_in_hours`.

Prefer dropping the `get_diff_in_hours` patch so hours go through the real helper.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
./scripts/run_backend_tests.sh app_hr.test_payroll_funcs_trphillips
```

Expected: FAIL — `session_billable_hours` / `session_billable_window` not defined (or ImportError).

- [ ] **Step 3: Implement helpers and wire payroll loop**

In `app_hr/payroll_funcs.py`:

```python
def session_billable_window(ue: UserEvent) -> Optional[tuple[datetime, datetime]]:
    """
    Billable from/to for a qualifying UserEvent.
    Prefer frozen event bounds (exact); else rounded check-in/out.
    Returns None if duration would be <= 0.
    """
    frozen_from = getattr(ue, "event_time_from_at_calculation", None)
    frozen_to = getattr(ue, "event_time_to_at_calculation", None)
    if frozen_from is not None and frozen_to is not None and frozen_to > frozen_from:
        return frozen_from, frozen_to

    cin = round_to_closest_half_hour(ue.checkin_time)
    cout = round_to_closest_half_hour(ue.checkout_time)
    if not cin or not cout:
        return None
    if cout <= cin:
        return None
    return cin, cout


def session_billable_hours(ue: UserEvent) -> float:
    window = session_billable_window(ue)
    if window is None:
        return 0.0
    return get_diff_in_hours(window[0], window[1])
```

Replace the loop body in `get_tr_payments_trphillips` (currently rounds check-in/out then `get_diff_in_hours`):

```python
    for ue in user_events:
        window = session_billable_window(ue)
        if window is None:
            continue
        cin, cout = window
        hours = get_diff_in_hours(cin, cout)
        if hours <= 0:
            continue
        # ... rest unchanged; row still uses checkin_time=cin, checkout_time=cout, hours=hours
```

Update the docstring on `get_cash_flow_trphillips` that says “after half-hour rounding” to mention frozen event duration when present.

- [ ] **Step 4: Run tests — expect PASS**

```bash
./scripts/run_backend_tests.sh app_hr.test_payroll_funcs_trphillips
```

Expected: PASS (including late-check-in pays 2h; fallback 0.5h; weighted-rate tests still green).

---

### Task 3: Freeze event bounds in `freeze_teacher_payroll_snapshots`

**Files:**
- Modify: `app_attendance/payroll_snapshots.py`
- Create: `app_attendance/tests/test_event_bounds_freeze.py`

**Interfaces:**
- Consumes: `user_event.event` (`date`, `time_from`, `time_to`), `tenant.timezone`
- Produces: `freeze_teacher_payroll_snapshots(...)` may return  
  `event_time_from_at_calculation` / `event_time_to_at_calculation` **even when** rate freeze is skipped (`session_based` or missing rate without `require_rate`)
- Write-once: if both freeze fields already set, do not include them in updates

**UTC combine (match check-in policy):** `Event.time_from` / `time_to` are `TimeField`s. Combine with local calendar date via `event_local_date(event, tz)` and tenant `ZoneInfo`, then convert to UTC. Reuse patterns from `app_attendance/checkin_policy.py` (`_event_start_utc`) and `views._get_event_end_utc` (including overnight if `time_to <= time_from`). Prefer implementing a private `_event_bounds_utc(event, tenant) -> tuple[datetime, datetime]` **inside** `payroll_snapshots.py` (or exporting helpers from `checkin_policy` without importing `views`) to avoid circular imports (`views` → serializers → `payroll_snapshots`).

- [ ] **Step 1: Write failing tests**

Create `app_attendance/tests/test_event_bounds_freeze.py`. Mirror tenant/`schema_context` setup from `app_attendance/tests/test_userevent_serializer.py` (same org schema, `load-data` patterns).

```python
# High-value cases only:
# 1) freeze_teacher_payroll_snapshots returns event bounds for teacher on first freeze
# 2) second call with fields already set returns no event-bound keys (write-once)
# 3) session_based: rate keys absent, but event bounds still present
# 4) missing hourly rate + require_rate=False: still returns event bounds (empty rate keys OK)
```

Concrete assertions for (1): given event `time_from=09:00`, `time_to=10:30` and tenant timezone, returned datetimes equal `_event_bounds_utc` / known UTC instants; duration hours = 1.5.

- [ ] **Step 2: Run — expect FAIL**

```bash
./scripts/run_backend_tests.sh app_attendance.tests.test_event_bounds_freeze
```

Expected: FAIL — freeze helper does not return event bound fields.

- [ ] **Step 3: Implement freeze**

Restructure `freeze_teacher_payroll_snapshots` roughly as:

```python
def _event_bounds_utc(event, tenant) -> tuple[datetime, datetime]:
    # same combine logic as checkin_policy start + views end (tenant TZ → UTC)
    ...


def freeze_teacher_payroll_snapshots(user_event, tenant, *, require_rate: bool = False) -> dict:
    if not user_event.user.is_teacher():
        return {}

    updates: dict = {}

    # Event bounds: write-once, independent of payroll strategy / rate
    if (
        user_event.event_time_from_at_calculation is None
        or user_event.event_time_to_at_calculation is None
    ):
        start_utc, end_utc = _event_bounds_utc(user_event.event, tenant)
        updates["event_time_from_at_calculation"] = start_utc
        updates["event_time_to_at_calculation"] = end_utc

    if is_session_based_payroll(tenant):
        return updates

    # existing rate / bonus / student_count / per_hour_price logic...
    # if rate is None: require_rate → raise; else return updates (may already include event bounds)
```

Do **not** overwrite non-null freeze fields.

- [ ] **Step 4: Run — expect PASS**

```bash
./scripts/run_backend_tests.sh app_attendance.tests.test_event_bounds_freeze
```

Expected: PASS.

---

### Task 4: Wire live check-in POST + self-correction `update_fields`

**Files:**
- Modify: `app_attendance/views.py` (teacher check-in POST ~708–739)
- Modify: `app_attendance/self_correction.py` (`update_fields` list when `first_backfill`)
- Modify: `app_attendance/tests/test_event_bounds_freeze.py` (or `test_checkin_post.py`) — one POST integration case

**Interfaces:**
- Consumes: `freeze_teacher_payroll_snapshots` / `_event_bounds_utc`
- Produces: after successful teacher check-in POST (and first self-correction backfill), `UserEvent` has event freeze fields set; admin time-only PATCH does not change them (already true if serializer only freezes on first check-in)

- [ ] **Step 1: Write failing integration test**

In `test_event_bounds_freeze.py` (or extend `test_checkin_post.py`):

1. Teacher POST check-in for a session → `event_time_from_at_calculation` / `event_time_to_at_calculation` set.
2. Change live `Event.time_from` / `time_to` → freeze fields unchanged.
3. Admin PUT checkout / time edit → freeze fields unchanged.

(Reuse existing check-in POST URL/`HTTP_X_DTS_SCHEMA` patterns from `test_checkin_post.py`.)

- [ ] **Step 2: Run — expect FAIL** on POST not freezing event bounds.

- [ ] **Step 3: Wire POST**

In the teacher check-in POST block in `views.py`, after existing rate freeze (or even when `is_session_based_payroll` skips rates), set event freeze if null:

Preferred minimal approach — call shared helper so logic is not duplicated:

```python
from app_attendance.payroll_snapshots import freeze_teacher_payroll_snapshots

# After resolving user_event / tenant, before or as part of save:
snapshot_updates = freeze_teacher_payroll_snapshots(
    user_event, tenant, require_rate=not is_session_based_payroll(tenant)
)
for key, value in snapshot_updates.items():
    setattr(user_event, key, value)
```

**Important:** Today POST **inlines** rate freeze and returns 400 if rate missing for `tr_phillips`. Keep that 400 behavior. Options:

- **A (recommended):** Keep existing inline rate + 400 logic; **additionally** set event bounds via `_event_bounds_utc` when fields are null (teachers only), for both `tr_phillips` and `session_based`.
- **B:** Refactor POST to use `freeze_teacher_payroll_snapshots(..., require_rate=True)` for `tr_phillips` and drop duplication — only if you can preserve identical error responses.

Use **A** unless a clean refactor is obvious in the same edit.

For `self_correction.py`, when `first_backfill`, extend `update_fields` with:

```python
"event_time_from_at_calculation",
"event_time_to_at_calculation",
```

(`freeze_teacher_payroll_snapshots` already runs on first backfill — fields must be listed or they won’t persist with `update_fields`.)

Serializer path already calls `freeze_teacher_payroll_snapshots` on first check-in — no change beyond Task 3’s helper, except confirm `session_based` first check-in via serializer still persists event bounds (add assertion to existing `test_first_checkin_skips_hourly_rate_freeze_for_session_based_payroll` in `test_userevent_serializer.py`).

- [ ] **Step 4: Run tests**

```bash
./scripts/run_backend_tests.sh app_attendance.tests.test_event_bounds_freeze app_attendance.tests.test_userevent_serializer app_attendance.tests.test_checkin_post
```

Expected: PASS.

---

### Task 5: End-to-end payroll regression + cash-flow inheritance check

**Files:**
- Modify: `app_hr/test_payroll_funcs_trphillips.py` (if any gap remains)
- Optional: small cash-flow unit test only if you need an explicit assertion that income hours follow freeze (cash-flow calls `get_tr_payments_trphillips` — Task 2 already covers the hours source)

**Interfaces:**
- Consumes: Task 2 helpers
- Produces: documented confidence that cash-flow income uses frozen hours without a separate hours implementation

- [ ] **Step 1: Add one cash-flow assertion (high-value)**

In `app_hr/test_payroll_funcs_trphillips.py` (or a tiny new `SimpleTestCase` in the same file), patch `UserEvent.objects.filter` / `Course.objects.filter` as needed and call `get_cash_flow_trphillips` with a UE that has:

- frozen event duration 2.0h
- late actual check-in/out that would be 0.5h under fallback
- `per_hour_price_at_calculation = Decimal("10")`, `student_count = 2`

Assert row `hours == 2.0` and income == `10 * 2 * 2 = 40.00`.

- [ ] **Step 2: Run**

```bash
./scripts/run_backend_tests.sh app_hr.test_payroll_funcs_trphillips
```

Expected: PASS.

- [ ] **Step 3: Manual FE sanity (no code)**

Hit payroll UI for a teacher with a newly checked-in session: Time Log should show frozen session from–to (same as billed hours), not late arrival. Skip if no local env — Task 2 already locks API shape.

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Nullable freeze fields on `UserEvent` | 1 |
| Freeze at first teacher check-in (write-once) | 3, 4 |
| Freeze even when rate freeze skipped | 3, 4 |
| Exact event duration for payroll hours | 2 |
| Cash-flow same hours source | 2, 5 |
| Legacy fallback (no / partial / invalid snapshot) | 2 |
| Late in / early out still full frozen duration | 2 |
| Schedule edit after freeze does not change pay | 4 |
| No backfill | (non-goal; no task) |
| No finance editor for frozen times | (non-goal; no task) |
| Time Log shows billable window | 2 (API fields); FE unchanged |
| Check-in policy unchanged | (no task; do not edit policy math) |
| High-value tests | 2–5 |

## Self-review notes

- No TBD/placeholder steps; helper names consistent (`session_billable_hours` / `session_billable_window` / `_event_bounds_utc`).
- `Event` stores `TimeField` bounds — plan explicitly combines to UTC datetimes (spec’s DateTimeFields).
- Cash-flow has no separate hours math; Task 5 only proves inheritance.

# Event-duration payroll from frozen session bounds

**Status:** agreed (2026-07-21)  
**Repos:** `schedjuice-reimagined-be` (primary), `schedjuice-reimagined-fe` (payroll display)  
**Area:** Teacher session check-in + `tr_phillips` payroll / cash-flow

## Context

Teacher session attendance lives on `UserEvent` (`checkin_time`, `checkout_time`). Scheduled session bounds live on `Event` (`time_from`, `time_to`).

Today, `tr_phillips` payroll and cash-flow income compute hours from **rounded check-in → checkout** duration (`round_to_closest_half_hour`), not from the scheduled event length. Checkout is also capped at live event end for attendance recording. Rate and related fields are already frozen on first teacher check-in via `freeze_teacher_payroll_snapshots`; event bounds are not.

Finance and ops want wall-clock check-in/out retained for attendance, while **billable hours** follow the session’s scheduled duration captured at check-in.

## Goals

1. Record **actual** check-in and check-out times as today (attendance / audit).
2. On first teacher check-in, **freeze** the linked event’s `time_from` / `time_to` on the `UserEvent`.
3. For `tr_phillips` payroll **and** cash-flow income: when both frozen event times exist, billable hours = **exact** `(event_time_to − event_time_from)` — no half-hour rounding.
4. Late check-in / early checkout does **not** reduce pay when both check-in and check-out are present; eligibility still requires both times.
5. Rows **without** a freeze keep today’s check-in/out duration math (fallback; no backfill).

## Non-goals

- Finance UI to edit frozen event times.
- Backfill migration of historical `UserEvent` rows.
- Changing `session_based` pay (still `per_session_rate × session_count`).
- Campus check-in (`BuildingCheckin`) or Microsoft/`UserAttendance` payroll paths.
- Changing check-in window / checkout-cap policy (still driven by **live** `Event` times for attendance only).
- New org toggle / feature flag for this behavior.

## Decisions

| # | Decision |
| --- | --- |
| 1 | **Approach:** Nullable snapshot fields on `UserEvent`, written once at first teacher check-in (same family as `hourly_rate_at_calculation`) |
| 2 | **Pay basis when snapshotted:** Full frozen event duration; actual arrival/departure ignored for hours |
| 3 | **Rounding:** Exact duration when snapshot present; existing half-hour rounding only on fallback path |
| 4 | **Cash-flow:** Same hours source as payroll (`tr_phillips` income path) |
| 5 | **Legacy rows:** No backfill; missing/partial/invalid snapshot → fallback to check-in/out hours |
| 6 | **Schedule edits after check-in:** Do not overwrite frozen fields; pay stays on freeze |
| 7 | **Freeze even when rate freeze is skipped:** Still copy event bounds on first teacher check-in if snapshot fields are null (`session_based` or missing rate) |
| 8 | **Payroll Time Log UI:** Show billable window (frozen event times when present, else rounded check-in/out used for fallback) |

---

## Data model

Add to `UserEvent` (`app_attendance/models.py` + migration):

| Field | Type | Notes |
| --- | --- | --- |
| `event_time_from_at_calculation` | `DateTimeField(null=True, blank=True)` | Frozen `Event.time_from` |
| `event_time_to_at_calculation` | `DateTimeField(null=True, blank=True)` | Frozen `Event.time_to` |

Naming matches existing `*_at_calculation` payroll snapshots.

---

## Write path (freeze)

**When:** First teacher check-in for that `UserEvent`, when either new field is still null (write both together).

**Where:** Extend `freeze_teacher_payroll_snapshots` and ensure the live check-in POST path that freezes rates today also persists these fields. Event-bound freeze must run even if the function returns early for `session_based` rate logic or missing hourly rate — extract or structure so event times are not skipped by the rate early-return.

**Source:** `user_event.event.time_from` / `user_event.event.time_to` at freeze time.

**Never overwrite** after set:

- Finance/admin `UserEvent` PATCH (check-in/out / student count edits)
- Teacher self-correction
- Bulk attendance updates
- Schedule reschedule / overlap-fix that updates live `Event` times

---

## Calculation

**Eligibility (unchanged):** both `checkin_time` and `checkout_time` set, plus existing rate / course rules for `tr_phillips`.

**Hours helper (shared by payroll + cash-flow):**

```
if event_time_from_at_calculation and event_time_to_at_calculation:
    if to > from:
        hours = (to − from).total_seconds() / 3600  # exact decimal; no half-hour rounding
    else:
        # corrupt / invalid — do not use event path
        hours = fallback_checkin_checkout_hours(...)
else:
    # missing or partial snapshot
    hours = fallback_checkin_checkout_hours(...)  # round_to_closest_half_hour(cin/cout), subtract
```

All downstream formulas (hourly rate, student bonus, per-hour price × students, reg/extra buckets) stay the same; only the hours input changes when a valid snapshot exists.

---

## Check-in policy

Unchanged. Grace period, check-in close, and checkout ceiling still use **live** `Event` times. That shapes stored attendance only; it does not define billable hours when a snapshot exists.

---

## UI

| Surface | Behavior |
| --- | --- |
| Course / finance check-in histories | Keep **Session** = live `Event` times; **Check-in / Check-out** = actual. No required display of frozen billable bounds in v1. |
| Payroll / cash-flow results | **Time Log** (or equivalent) shows the **billable** window: frozen event from/to when present, else the rounded check-in/out used in fallback. |

No new editor for frozen event times in v1.

---

## Error handling & edge cases

| Case | Behavior |
| --- | --- |
| Check-in without checkout | Not billable (unchanged) |
| Late in / early out, both times set, snapshot present | Full frozen event duration |
| No / partial snapshot | Fallback check-in/out hours |
| `to <= from` on snapshot | Fallback check-in/out hours |
| Schedule changed after freeze | Live session display may change; pay uses freeze |
| `session_based` org | Event bounds still frozen; pay still per-session (ignores hours) |

---

## Testing (high-value)

- First teacher check-in freezes event from/to; subsequent check-in/out edits and self-correction do not overwrite.
- After freeze, changing live `Event.time_from` / `time_to` does not change frozen fields or paid hours.
- Payroll + cash-flow: valid snapshot → exact event duration; no snapshot → half-hour check-in/out fallback.
- Late check-in / early checkout still pays full frozen duration when both attendance times exist.
- Partial or `to <= from` snapshot → fallback.
- Rate-freeze skip paths (`session_based` / missing rate) still freeze event bounds when fields are null.

---

## Rollout

1. Ship nullable columns (no data backfill).
2. New teacher check-ins populate snapshots.
3. Recalculating payroll/cash-flow for a month mixes paths: snapshotted sessions use event duration; older sessions use fallback until they have a freeze (only new check-ins create freezes).

## Touchpoints

| Area | Files (indicative) |
| --- | --- |
| Schema | `app_attendance/models.py`, migration |
| Freeze | `app_attendance/payroll_snapshots.py`, check-in POST in `views.py`, serializer freeze hooks |
| Calc | `app_hr/payroll_funcs.py` (+ cash-flow helpers that reuse hours) |
| FE display | `finances/payroll/page.tsx` (and cash-flow consumer of time log if separate) |
| Tests | `app_attendance` freeze/check-in tests; `app_hr/test_payroll_funcs_trphillips.py` (+ cash-flow coverage) |

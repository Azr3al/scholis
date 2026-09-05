# Cancel check-in for no-show students — Design Spec

**Date:** 2026-09-02  
**Status:** Approved  
**Surface:** BE `app_attendance`; teacher **mobile**; org toggle in **web FE** settings only  
**Related:** `UserCheckinView` (live check-in/out), `apply_self_checkin_correction` (post-hoc edits), `AttendanceChangeEvent` (audit trail)

## Summary

Teachers who checked in for a session but the student never showed up can **cancel** their open check-in from the mobile app. Cancelling writes an audit record and **resets** the teacher's `UserEvent` row so the session is not billable and the teacher can check in again if the student arrives late. Student rows are untouched.

## Confirmed decisions

| Topic | Decision |
|-------|----------|
| Record shape | Audit in `AttendanceChangeEvent`; reset `UserEvent` (clear check-in, image, payroll snapshots) |
| Student rows | Untouched |
| When allowed | Open session only (`checkin_time` set, `checkout_time` null) |
| Reason | Preset required (`student_no_show`, `checked_in_by_mistake`, `other`); note required for `other` |
| Re-check-in | Allowed within normal check-in window after cancel |
| Payroll | No pay — cleared row has no check-in/checkout pair |
| Org gate | `allow_teacher_checkin_cancellation`, **default off** |
| Admin UI | Backend audit only in v1; toggle exposed in org settings |

## Backend

### Org setting

`Organization.allow_teacher_checkin_cancellation` (BooleanField, default=False).

### Audit

- `AttendanceChangeEvent.EventType.CHECKIN_CANCELLED = "checkin_cancelled"`
- `AttendanceChangeEvent.Source.MOBILE_SESSION_CHECKIN = "mobile_session_checkin"`

### Domain

`app_attendance/cancel_checkin.py` — `CancelReason` choices and `cancel_open_checkin()`:

1. Require org flag, teacher actor, own row, open session.
2. Validate reason; note required for `other` (max 500 chars).
3. Record change event with reason and field diffs.
4. Reset check-in fields and payroll snapshots.

### API

`POST /api/v1/attendances/user-checkin/<course_id>/cancel`  
Body: `{ "reason_code": "...", "note": "..." }`  
Permission: `attendance.mark` (same as check-in).

## Mobile

- Org flag on tenant payload.
- `CancelCheckinSheet` with reason picker and confirm.
- Entry from check-out sheet when status is checked-in.
- Mutation invalidates same query keys as checkout.

## Web (minimal)

Register `allow_teacher_checkin_cancellation` in org types and settings registry so admins can enable the feature.

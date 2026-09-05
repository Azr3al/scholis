# Atomic transactions for high-risk multi-write request paths

**Status:** implemented  
**Date:** 2026-07-21  
**Repos:** `schedjuice-reimagined-be`  
**Surfaces:** Roster bulk manage, payment screenshot CSV verify, course event edit, join-request approval, enrollment discount apply, receiver-side screenshot match

## Context

`ATOMIC_REQUESTS` is off. Atomicity is opt-in via `transaction.atomic` / `@transaction.atomic`, with `transaction.on_commit` (or `delay_on_commit`) for Celery/push after commit. Many complex flows already follow this (payment groups, roster_writes DB sections, CRM lead moves, user merge, intake generate).

Audits found high-risk multi-write paths that either lack an enclosing transaction or wrap writes incorrectly—most notably `UserCourseManagementView`, which returns HTTP 400 **inside** `with transaction.atomic()` after deletes/updates have already run. In Django, exiting the `atomic` block without an exception **commits**, so the client sees an error while roster changes persist.

## Goals

1. **DB all-or-nothing** on the in-scope multi-write paths: if any step fails, none of the related inserts/updates/deletes remain.
2. **No early-return commits** — never `return Response(...)` from inside an atomic block after writes; validate first or raise to abort.
3. **Service-owned transactions** — extract (or decorate) domain entrypoints with `@transaction.atomic`, matching `payment_group.py`, `overlap_fix_services.py`, `user_merge_services.py`.
4. **External I/O outside the DB transaction** — MS Graph, email, Celery stay best-effort / post-commit; no compensating Graph rollback in this pass.
5. **Targeted regression tests** proving mid-failure leaves no partial rows.

## Non-goals

- Frontend multi-call loops (intake add-classes, program-level create, bulk PATCH pages).
- Medium/low-risk paths (auth registration, chat DM thread create, announcements attachments, attendance bulk, AI usage rollups).
- Enabling `ATOMIC_REQUESTS`.
- End-to-end consistency with Microsoft Graph / email (compensation, saga).
- Broad CONTRIBUTING rewrite (conventions live in this spec; optional one-pager later).

## Decisions

| # | Decision |
| --- | --- |
| 1 | **Scope:** high-risk backend only (six paths below) |
| 2 | **Success criteria:** full DB rollback + harden return-inside-atomic patterns |
| 3 | **Approach:** extract domain services with `@transaction.atomic` (not wrap-only, not hybrid) |
| 4 | **Testing:** targeted regression tests per touched path; no shared failure-injection framework |
| 5 | **Keep `ATOMIC_REQUESTS` off** |
| 6 | **Nested atomics OK** — e.g. `mark_receiver_side_screenshots_matched` inside payment create uses savepoints |
| 7 | **API contracts unchanged** — same status codes and response envelopes |

## Principles

1. **Service owns the transaction** — `@transaction.atomic` on the service entrypoint; views authenticate/authorize and map exceptions to HTTP.
2. **Validate before writes** — serializers, MS-link checks, overlap simulation, check-in delete guards run before the atomic block (or raise inside so the block aborts).
3. **Raise to roll back** — services raise `ValidationError` or existing domain errors; no HTTP returns inside atomic.
4. **External I/O outside DB tx** — Graph / mail / Celery after successful commit (`on_commit` preferred for async).
5. **Follow existing good examples** — `app_finance/payment_group.py`, `app_course/roster_writes.py`, `app_course/overlap_fix_services.py`, `app_auth/user_merge_services.py`.

---

## In-scope paths

### 1. Roster bulk manage

**Today:** `UserCourseManagementView.post` in `app_course/views.py`  
**Problem:** Inside `transaction.atomic()`, deletes/updates/membership events run, then validation can `return` 400 (serializer invalid or missing Microsoft IDs) — **commits anyway**.

**Design:**
- New module `app_course/roster_management.py` with `@transaction.atomic def apply_user_course_management(...)`.
- **View:** auth, course write checks, split removed vs entities, run create-serializer + Teams-link validation **before** calling the service.
- **Service (atomic):** REMOVED membership events → `Task` bulk_create for MS remove → delete UserCourses → bulk_update → create + JOINED events.
- **After commit (view):** Graph `add_member` for creates; `refresh_course_member_counts_now`.

### 2. Screenshot CSV verify

**Today:** `VerifyScreenshotsView.post` in `app_finance/views.py`  
**Problem:** `ReceiverSideScreenshot.bulk_create` then `UserPayment.bulk_update` with no enclosing transaction.

**Design:**
- New helper `app_finance/payment_verify.py` → `@transaction.atomic def verify_screenshots_from_rows(...)`.
- View validates serializer, builds rows, calls service.
- Atomic: RSS bulk_create + payment bulk_update together.

### 3. Course event edit

**Today:** `CourseEventEditView.post` in `app_course/views.py`  
**Problem:** Course save, event create, overlap merges, deletes, bulk_update with no single transaction. Check-in delete guard runs **after** creates/merges, so a late 400 can leave partial schedule state. MS meeting creation mid-flow can also 400 after DB writes.

**Design:**
- New apply service `app_course/event_edit_services.py` → `@transaction.atomic def apply_course_event_edit(...)`.
- **View (before writes):** parse payload, serializer `is_valid`, `validate_simulated_course_event_edit`, **check-in delete guard for non-merge deletes** (moved up from mid-flow).
- **Service (atomic):** course partial update → create events + teacher UserEvents → overlap merges (UE merge, daily notes, delete sources) → delete remaining → bulk_update edits.
- **After success (view):** `create_course_meeting_if_needed` (MS). If MS fails, return error without rolling back DB (accepted under external-I/O principle; same class of divergence as roster Graph adds).

### 4. Join-request approval

**Today:** `app_course/join_request_approval.py`  
**Problem:** User activate → `UserCourse.get_or_create` → membership event → join-request status save are separate autocommits. `approve_all_pending_join_requests_for_user` loops without an outer transaction. Email via `async_task` is fine outside.

**Design:**
- `@transaction.atomic` on `approve_course_join_request` for DB writes.
- `approve_all_pending_join_requests_for_user`: **one outer** `@transaction.atomic` wrapping activation + loop (nested savepoints OK).
- Prefer `transaction.on_commit` for activation email so workers only see committed state.
- `CourseJoinRequestSerializer.update`: when status is APPROVED, call `approve_course_join_request` (which sets status) and **return that instance** without a second `super().update` that re-writes status. Other status transitions keep `super().update`.

### 5. Enrollment discount apply

**Today:** `apply_enrollment_discount` in `app_finance/discount_engine.py`  
**Problem:** `deactivate_enrollment_discount` (save) then `EnrollmentDiscount.objects.create` without atomic.

**Design:**
- Decorate `apply_enrollment_discount` with `@transaction.atomic`.
- Callers (`EnrollmentDiscountView`, `payment_discount_apply`) unchanged.

### 6. Receiver-side screenshot match

**Today:** `mark_receiver_side_screenshots_matched` in `app_finance/services.py`  
**Problem:** RSS save + `UserPayment` status save without atomic; called from upload, OCR, payment-group paths.

**Design:**
- Decorate with `@transaction.atomic`.
- Safe when nested inside an outer payment atomic (savepoint).

---

## Error handling

| Layer | Behavior |
| --- | --- |
| Service | Raise `ValidationError` / `ValueError` / existing domain errors; never return HTTP |
| View | Catch and map to existing `send_response` / status codes |
| Atomic exit | Exception → rollback; clean return → commit |

## Testing

Run via `./scripts/run_backend_tests.sh` (always `--keepdb`).

| Path | Assertion |
| --- | --- |
| Roster manage | Remove + invalid create (e.g. missing MS id when Teams sync on) → 400; removed UserCourses **still exist** |
| Screenshot verify | Failure after RSS create (mock `bulk_update`) → **zero** new RSS; payment statuses unchanged |
| Course event edit | Create + delete with check-in on delete target → guard fails **before** writes; no new events; course unchanged |
| Join approve | Forced failure after UserCourse create → join request stays PENDING; no orphan membership / activate rolled back with enroll |
| Enrollment discount | Forced failure on create after deactivate → prior active discount still active |
| RSS match | Forced failure on payment save → RSS remains unmatched |

Prefer service-level tests where extraction allows; use API tests for roster view wiring (return-commits bug).

## Rollout

- Backend-only change set (single PR or stacked commits per path).
- No migrations; no frontend changes; no API shape changes.
- Smoke: roster bulk save, payment CSV verify, course schedule edit with overlap merge, join-request approve, apply discount.

## Out of scope (deferred)

- FE intake / program-structure multi-POST loops
- Auth registration, chat `get_or_create_dm_thread`, announcement multipart attachments
- Graph/email compensation
- Project-wide transaction style guide (optional follow-up)

## Reference patterns (do not regress)

- `app_finance/payment_group.py` — `@transaction.atomic` multi-part create  
- `app_course/roster_writes.py` — external Graph first / outside, then atomic DB  
- `app_course/overlap_fix_services.py` — merge/delete in one transaction  
- `app_auth/user_merge_services.py` — large multi-table `@transaction.atomic`  
- `transaction.on_commit` / `delay_on_commit` for push and Teams sync  

## Success criteria

- [ ] All six paths have a single DB transaction boundary around related writes  
- [ ] No HTTP early-return after writes inside `atomic` on those paths  
- [ ] Targeted tests pass for each path’s partial-failure scenario  
- [ ] Existing happy-path behavior and API envelopes unchanged  

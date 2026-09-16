# Atomic Transactions for High-Risk Multi-Write Paths — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make six high-risk backend multi-write paths all-or-nothing at the DB layer, and eliminate early HTTP `return` inside `transaction.atomic()` after writes have run.

**Architecture:** Extract (or decorate) domain service entrypoints with `@transaction.atomic`. Views authenticate, authorize, and validate **before** calling services; services raise on failure; external I/O (MS Graph, email, Celery) stays outside the DB transaction / uses `on_commit`. Nested atomics (savepoints) are OK.

**Tech Stack:** Django, DRF, `django.db.transaction`, django-tenants (`schema_context`), existing RBAC views, `./scripts/run_backend_tests.sh` (always `--keepdb`).

**Spec:** `docs/superpowers/specs/2026-07-21-atomic-transactions-multi-write-design.md`

## Global Constraints

- Backend only — no frontend changes, no migrations, no API envelope changes.
- Do **not** enable `ATOMIC_REQUESTS`.
- Never `return Response(...)` / `send_response(...)` from inside an atomic block after writes; validate first or raise.
- External I/O (MS Graph, mail, Celery) outside DB tx; prefer `transaction.on_commit` for async after commit.
- Tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <dotted.target>` (script adds `--keepdb --noinput`).
- Do **not** commit unless the user explicitly asks (omit git commit steps until requested).
- Leave unrelated WIP in the working tree untouched (e.g. overlap-reschedule files).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `app_finance/services.py` | Decorate `mark_receiver_side_screenshots_matched` with `@transaction.atomic` |
| `app_finance/discount_engine.py` | Decorate `apply_enrollment_discount` with `@transaction.atomic` |
| `app_finance/payment_verify.py` | **Create** — `verify_screenshots_from_rows` atomic CSV verify apply |
| `app_finance/views.py` | `VerifyScreenshotsView` calls payment_verify service |
| `app_course/join_request_approval.py` | Atomic approve + outer atomic for approve-all; email via `on_commit` |
| `app_course/serializers.py` | `CourseJoinRequestSerializer.update` — APPROVED path returns approve result, no second status write |
| `app_course/roster_management.py` | **Create** — `apply_user_course_management` atomic roster apply |
| `app_course/views.py` | Thin `UserCourseManagementView` + `CourseEventEditView` orchestration |
| `app_course/event_edit_services.py` | **Create** — `apply_course_event_edit` atomic schedule apply |
| `app_finance/tests/test_receiver_side_match_atomic.py` | **Create** — RSS match rollback |
| `app_finance/tests/test_discount_engine.py` | Add replace-rollback test |
| `app_finance/tests/test_verify_screenshots_atomic.py` | **Create** — CSV verify rollback |
| `app_course/tests/test_join_request_approval_atomic.py` | **Create** — approve rollback |
| `app_course/tests/test_roster_management_atomic.py` | **Create** — return-commits regression |
| `app_course/tests/test_event_edit_atomic.py` | **Create** — check-in guard before writes |

---

### Task 1: Atomic `mark_receiver_side_screenshots_matched`

**Files:**
- Modify: `app_finance/services.py`
- Create: `app_finance/tests/test_receiver_side_match_atomic.py`

**Interfaces:**
- Consumes: existing `mark_receiver_side_screenshots_matched(transaction_id: str, user_payment: UserPayment) -> None`
- Produces: same signature, now `@transaction.atomic`

- [ ] **Step 1: Write the failing test**

Create `app_finance/tests/test_receiver_side_match_atomic.py`. Mirror tenant setup from `app_finance/tests/test_discount_engine.py` (same schema `xschedjuice`, `ensure_public_schema`, `migrate_schemas`, `load-data`, `schema_context`). Minimal fixtures: one `User`, one `Course`, one `UserPayment` (status `PENDING_VERIFICATION`), one unmatched `ReceiverSideScreenshot` with matching `transaction_id`.

```python
from unittest.mock import patch

from django.db import IntegrityError
from tenant_schemas.utils import schema_context

from app_finance.models import ReceiverSideScreenshot, UserPayment
from app_finance.services import mark_receiver_side_screenshots_matched


class MarkReceiverSideMatchAtomicTests(TestCase):
    # ... setUpTestData like test_discount_engine (org, course, user, payment, rss) ...

    def test_payment_save_failure_leaves_rss_unmatched(self):
        with schema_context(self.schema_name):
            payment = UserPayment.objects.get(id=self.payment_id)
            original_status = payment.status
            with patch.object(
                UserPayment,
                "save",
                side_effect=IntegrityError("forced"),
            ):
                with self.assertRaises(IntegrityError):
                    mark_receiver_side_screenshots_matched(
                        self.transaction_id, payment
                    )
            rss = ReceiverSideScreenshot.objects.get(id=self.rss_id)
            payment.refresh_from_db()
            self.assertFalse(rss.is_matched)
            self.assertIsNone(rss.user_payment_id)
            self.assertEqual(payment.status, original_status)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_receiver_side_match_atomic.MarkReceiverSideMatchAtomicTests.test_payment_save_failure_leaves_rss_unmatched`

Expected: FAIL — RSS already matched / linked because writes autocommit before payment `save` raises.

- [ ] **Step 3: Implement**

In `app_finance/services.py`, ensure `from django.db import transaction` (add if missing) and decorate:

```python
@transaction.atomic
def mark_receiver_side_screenshots_matched(
    transaction_id: str, user_payment: UserPayment
):
    # existing body unchanged
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_receiver_side_match_atomic`

Expected: PASS

---

### Task 2: Atomic `apply_enrollment_discount`

**Files:**
- Modify: `app_finance/discount_engine.py`
- Modify: `app_finance/tests/test_discount_engine.py`

**Interfaces:**
- Consumes: existing `apply_enrollment_discount(*, user_course, discount, applied_by, org, reason="", as_of=None) -> EnrollmentDiscount`
- Produces: same signature, `@transaction.atomic`

- [ ] **Step 1: Write the failing test**

Append to `app_finance/tests/test_discount_engine.py` inside the existing test class (reuse `self.enrollment`, `self.admin`, `self.org`):

```python
def test_create_failure_after_deactivate_restores_prior_active(self):
    from unittest.mock import patch
    from django.db import IntegrityError
    from app_finance.models import EnrollmentDiscount

    with schema_context(self.schema_name):
        d1 = Discount.objects.create(
            name=f"d1-{uuid4().hex[:6]}",
            discount_type=Discount.DiscountType.PERCENT,
            percent_value=Decimal("10"),
            scope=Discount.Scope.FIRST_PERIOD,
        )
        d2 = Discount.objects.create(
            name=f"d2-{uuid4().hex[:6]}",
            discount_type=Discount.DiscountType.PERCENT,
            percent_value=Decimal("20"),
            scope=Discount.Scope.FIRST_PERIOD,
        )
        apply_enrollment_discount(
            user_course=self.enrollment,
            discount=d1,
            applied_by=self.admin,
            org=self.org,
        )
        first = get_active_enrollment_discount(self.enrollment)
        self.assertIsNotNone(first)
        with patch.object(
            EnrollmentDiscount.objects,
            "create",
            side_effect=IntegrityError("forced"),
        ):
            with self.assertRaises(IntegrityError):
                apply_enrollment_discount(
                    user_course=self.enrollment,
                    discount=d2,
                    applied_by=self.admin,
                    org=self.org,
                )
        active = get_active_enrollment_discount(self.enrollment)
        self.assertIsNotNone(active)
        self.assertEqual(active.id, first.id)
        self.assertTrue(active.is_active)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine.DiscountEngineTests.test_create_failure_after_deactivate_restores_prior_active`

Expected: FAIL — prior discount stays deactivated (`is_active=False`) after create raises.

- [ ] **Step 3: Implement**

In `app_finance/discount_engine.py`:

```python
from django.db import transaction

@transaction.atomic
def apply_enrollment_discount(
    *,
    user_course: UserCourse,
    discount: Discount,
    applied_by: User,
    org: Organization,
    reason: str = "",
    as_of: date | None = None,
) -> EnrollmentDiscount:
    # existing body unchanged
```

(Keep `from datetime import date` import inside or move to module top consistently with file style.)

- [ ] **Step 4: Run tests**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine`

Expected: PASS (including existing replace/apply tests)

---

### Task 3: Atomic join-request approval + serializer fix

**Files:**
- Modify: `app_course/join_request_approval.py`
- Modify: `app_course/serializers.py` (`CourseJoinRequestSerializer.update`)
- Create: `app_course/tests/test_join_request_approval_atomic.py`

**Interfaces:**
- Consumes: `approve_course_join_request(join_request, *, actor, tenant, send_activation_email=True, activate_user=True) -> CourseJoinRequest`
- Produces: same; DB writes atomic; email scheduled with `transaction.on_commit`
- Consumes: `approve_all_pending_join_requests_for_user(user, *, actor, tenant, send_activation_email=True) -> None`
- Produces: outer `@transaction.atomic` wrapping activation + loop

- [ ] **Step 1: Write the failing test**

Create `app_course/tests/test_join_request_approval_atomic.py` using the same tenant harness as `test_student_join_request.py`. Fixtures: inactive student (`is_active=False`, `is_waiting_for_activation=True`), course, pending `CourseJoinRequest`, admin actor.

```python
from unittest.mock import patch

from django.db import IntegrityError
from tenant_schemas.utils import schema_context

from app_course.join_request_approval import approve_course_join_request
from app_course.models import CourseJoinRequest, UserCourse


class JoinRequestApprovalAtomicTests(TestCase):
    # setUpTestData: pending join_request, inactive student, course, admin

    def test_membership_event_failure_rolls_back_enrollment_and_activation(self):
        with schema_context(self.schema_name):
            jr = CourseJoinRequest.objects.get(id=self.join_request_id)
            student = jr.user
            with patch(
                "app_course.join_request_approval.record_membership_event",
                side_effect=IntegrityError("forced"),
            ):
                with self.assertRaises(IntegrityError):
                    approve_course_join_request(
                        jr,
                        actor=self.admin,
                        tenant=self.org,
                        send_activation_email=False,
                    )
            jr.refresh_from_db()
            student.refresh_from_db()
            self.assertEqual(jr.status, CourseJoinRequest.Status.PENDING)
            self.assertFalse(
                UserCourse.objects.filter(
                    user_id=student.id, course_id=jr.course_id
                ).exists()
            )
            self.assertFalse(student.is_active)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_course.tests.test_join_request_approval_atomic.JoinRequestApprovalAtomicTests.test_membership_event_failure_rolls_back_enrollment_and_activation`

Expected: FAIL — UserCourse exists and/or user activated while join request still PENDING.

- [ ] **Step 3: Implement `join_request_approval.py`**

```python
from django.db import transaction
from django_q.tasks import async_task

# ...

def _send_activation_email(user: User, tenant) -> None:
    async_task(
        "app_microsoft.mail.send_generic_mail",
        user.email,
        "Your account has been activated",
        (
            "This is to inform you that your account has been activated. "
            "You can now log in using your credentials. "
            f"<br> https://{tenant.domain_url}<br>"
        ),
        tenant,
        user.name,
    )


@transaction.atomic
def approve_course_join_request(
    join_request: CourseJoinRequest,
    *,
    actor: User,
    tenant,
    send_activation_email: bool = True,
    activate_user: bool = True,
) -> CourseJoinRequest:
    requested_user = User.objects.filter(id=join_request.user_id).first()
    if requested_user is None:
        return join_request

    if activate_user:
        _ensure_user_activated(requested_user)

    _, created = UserCourse.objects.get_or_create(
        user_id=join_request.user_id,
        course_id=join_request.course_id,
        defaults={"assigned_as": UserCourse.AssignedAs.STUDENT},
    )
    if created:
        record_membership_event(
            course_id=join_request.course_id,
            user_id=join_request.user_id,
            event_type=CourseMembershipEvent.EventType.JOINED,
            actor_id=actor.id,
            source=CourseMembershipEvent.Source.API,
        )
        refresh_course_member_counts_now([join_request.course_id])

    join_request.status = CourseJoinRequest.Status.APPROVED
    join_request.save(update_fields=["status"])

    if send_activation_email:
        transaction.on_commit(
            lambda: _send_activation_email(requested_user, tenant)
        )

    return join_request


@transaction.atomic
def approve_all_pending_join_requests_for_user(
    user: User,
    *,
    actor: User,
    tenant,
    send_activation_email: bool = True,
) -> None:
    pending_join_requests = list(
        CourseJoinRequest.objects.filter(
            user_id=user.id,
            status=CourseJoinRequest.Status.PENDING,
        )
    )
    if user.is_active and not pending_join_requests:
        return

    _ensure_user_activated(user)
    for join_request in pending_join_requests:
        approve_course_join_request(
            join_request,
            actor=actor,
            tenant=tenant,
            send_activation_email=False,
            activate_user=False,
        )

    if send_activation_email:
        transaction.on_commit(lambda: _send_activation_email(user, tenant))
```

Note: nested `@transaction.atomic` on `approve_course_join_request` when called from `approve_all_*` creates a savepoint — that is intended.

- [ ] **Step 4: Fix serializer double status write**

In `app_course/serializers.py` `CourseJoinRequestSerializer.update`:

```python
def update(self, instance, validated_data):
    user = User.objects.get(email=self.context["request"].user.id)
    if user.is_student():
        raise ValidationError(
            {
                "non_field_errors": [
                    "Students are not allowed to update join requests."
                ]
            }
        )
    if validated_data.get("status") == models.CourseJoinRequest.Status.APPROVED:
        from app_course.join_request_approval import approve_course_join_request

        return approve_course_join_request(
            instance,
            actor=user,
            tenant=self.context.get("request").tenant,
            send_activation_email=True,
        )
    return super().update(instance, validated_data)
```

- [ ] **Step 5: Run tests**

Run: `./scripts/run_backend_tests.sh app_course.tests.test_join_request_approval_atomic app_course.tests.test_student_join_request`

Expected: PASS

---

### Task 4: Atomic screenshot CSV verify

**Files:**
- Create: `app_finance/payment_verify.py`
- Modify: `app_finance/views.py` (`VerifyScreenshotsView.post`)
- Create: `app_finance/tests/test_verify_screenshots_atomic.py`

**Interfaces:**
- Produces: `verify_screenshots_from_rows(*, data_list: list[dict]) -> None` decorated `@transaction.atomic`
- Consumes: `VerifyScreenshotSerializer` validated rows with `transaction_id`, `amount`

- [ ] **Step 1: Write the failing test**

```python
from unittest.mock import patch

from django.db import IntegrityError
from djmoney.money import Money
from tenant_schemas.utils import schema_context

from app_finance.models import ReceiverSideScreenshot, UserPayment
from app_finance.payment_verify import verify_screenshots_from_rows


class VerifyScreenshotsAtomicTests(TestCase):
    # fixtures: payment PENDING_VERIFICATION with transaction_id + parsed_amount

    def test_bulk_update_failure_creates_no_receiver_rows(self):
        with schema_context(self.schema_name):
            before = ReceiverSideScreenshot.objects.count()
            rows = [
                {
                    "transaction_id": self.transaction_id,
                    "amount": self.parsed_amount,
                }
            ]
            with patch.object(
                UserPayment.objects,
                "bulk_update",
                side_effect=IntegrityError("forced"),
            ):
                with self.assertRaises(IntegrityError):
                    verify_screenshots_from_rows(data_list=rows)
            self.assertEqual(ReceiverSideScreenshot.objects.count(), before)
            payment = UserPayment.objects.get(id=self.payment_id)
            self.assertEqual(
                payment.status, UserPayment.Status.PENDING_VERIFICATION
            )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_verify_screenshots_atomic`

Expected: FAIL — module missing, or RSS rows remain after forced failure if logic is inlined without atomic first.

(Write the test against `payment_verify.verify_screenshots_from_rows` — it will fail on import until Step 3.)

- [ ] **Step 3: Implement `app_finance/payment_verify.py`**

Move the apply body from `VerifyScreenshotsView.post` (from building `receiver_side_screenshots` through `bulk_update`) into:

```python
from __future__ import annotations

from django.db import transaction
from django.utils import timezone
from djmoney.money import Money

from app_finance import models


@transaction.atomic
def verify_screenshots_from_rows(*, data_list: list[dict]) -> None:
    unique_tids = {row["transaction_id"] for row in data_list}
    objs = list(
        models.UserPayment.objects.filter(
            transaction_id__in=unique_tids,
            status__in=[
                models.UserPayment.Status.PENDING_VERIFICATION,
                models.UserPayment.Status.AMOUNT_MISMATCH,
            ],
        )
    )
    tid_to_user_payment = {i.transaction_id: i for i in objs}
    tid_to_row = {row["transaction_id"]: row for row in data_list}
    assigned_user_payment_ids: set[int] = set()
    receiver_side_screenshots = []
    for row in data_list:
        tid = row["transaction_id"]
        user_payment = tid_to_user_payment.get(tid)
        if user_payment and user_payment.id in assigned_user_payment_ids:
            user_payment = None
        elif user_payment:
            assigned_user_payment_ids.add(user_payment.id)
        receiver_side_screenshots.append(
            models.ReceiverSideScreenshot(
                transaction_id=tid,
                is_matched=user_payment is not None,
                user_payment=user_payment,
            )
        )
    models.ReceiverSideScreenshot.objects.bulk_create(receiver_side_screenshots)
    to_be_updated = []
    now = timezone.now()
    for i in objs:
        row = tid_to_row.get(i.transaction_id)
        if row is not None:
            i.actual_amount = Money(amount=row["amount"], currency="USD")
            if i.parsed_amount.amount == i.actual_amount.amount:
                i.status = models.UserPayment.Status.VERIFIED
                if i.verified_at is None:
                    i.verified_at = now
            else:
                i.status = models.UserPayment.Status.AMOUNT_MISMATCH
            to_be_updated.append(i)
    if to_be_updated:
        models.UserPayment.objects.bulk_update(
            to_be_updated, ["actual_amount", "status", "verified_at"]
        )
```

- [ ] **Step 4: Wire the view**

In `VerifyScreenshotsView.post`, after serializer validation:

```python
from app_finance.payment_verify import verify_screenshots_from_rows

data_list = list(serialized.data)
verify_screenshots_from_rows(data_list=data_list)
return self.send_response(False, "verification completed", {}, status=201)
```

Delete the inlined bulk_create/bulk_update block from the view.

- [ ] **Step 5: Run tests**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_verify_screenshots_atomic app_finance.tests.test_rbac_finance.FinanceRbacTests.test_teacher_cannot_verify_payments`

Expected: PASS

---

### Task 5: Atomic roster bulk manage (return-commits fix)

**Files:**
- Create: `app_course/roster_management.py`
- Modify: `app_course/views.py` (`UserCourseManagementView.post`)
- Create: `app_course/tests/test_roster_management_atomic.py`

**Interfaces:**
- Produces: `@transaction.atomic def apply_user_course_management(*, actor: User, tenant, to_be_removed: list[dict], entities: list[dict], created_serializer_data: list[dict]) -> list[dict] | None`
  - Returns `graph_sync_rows` (created membership dicts for Graph) or `None`
- View validates create serializer + MS link checks **before** calling apply

- [ ] **Step 1: Write the failing regression test**

Scenario: existing student enrollment A on course; payload removes A and adds student B who has **no** `microsoft_id` while tenant has Teams sync on (`is_microsoft_on=True`, `is_teams_creation_enabled=True`, course has `microsoft_group_id`). Today: 400 but A is deleted. Desired: 400 and A still enrolled.

Reuse patterns from `app_course/tests/test_course_student_teams_gate.py` + `test_membership_history.py` management POST.

```python
def test_invalid_create_after_remove_does_not_commit_removals(self):
    with schema_context(get_public_schema_name()):
        Organization.objects.filter(schema_name=self.schema_name).update(
            is_microsoft_on=True,
            is_teams_creation_enabled=True,
        )
    with schema_context(self.schema_name):
        # course.microsoft_group_id set; student_a enrolled; student_b.microsoft_id = None
        pass
    client = self._client(self.admin)
    res = client.post(
        "/api/v1/user-courses/management",
        [
            {
                "user": self.student_a.id,
                "course": self.course.id,
                "assigned_as": UserCourse.AssignedAs.STUDENT,
                "isRemoved": True,
            },
            {
                "user": self.student_b.id,
                "course": self.course.id,
                "assigned_as": UserCourse.AssignedAs.STUDENT,
            },
        ],
        format="json",
    )
    self.assertEqual(res.status_code, 400)
    with schema_context(self.schema_name):
        self.assertTrue(
            UserCourse.objects.filter(
                user_id=self.student_a.id, course_id=self.course.id
            ).exists()
        )
        self.assertFalse(
            UserCourse.objects.filter(
                user_id=self.student_b.id, course_id=self.course.id
            ).exists()
        )
```

Also add a happy-path smoke: remove+add both valid → 200, A gone, B present (Teams sync mocked).

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_course.tests.test_roster_management_atomic.RosterManagementAtomicTests.test_invalid_create_after_remove_does_not_commit_removals`

Expected: FAIL — `student_a` enrollment missing after 400.

- [ ] **Step 3: Implement `app_course/roster_management.py`**

Extract the DB write sequence currently inside `UserCourseManagementView.post`'s `with transaction.atomic():` block (membership events, Task bulk_create, delete, bulk_update, serializer.save, joined events). Signature sketch:

```python
from __future__ import annotations

from django.db import transaction

from app_auth.models import User
from app_course import models
from app_course.membership_history import (
    MembershipEventInput,
    record_membership_events_bulk,
)
from app_course.serializers import UserCourseSerializer
from app_tasks.models import Task
from app_microsoft.team_provisioning_helpers import tenant_syncs_course_team_roster


@transaction.atomic
def apply_user_course_management(
    *,
    actor: User,
    tenant,
    to_be_removed: list[dict],
    entities: list[dict],
) -> list[dict] | None:
    """Apply roster removals/updates/creates. Caller must pre-validate creates + MS links.

    Returns created row dicts for Graph sync, or None.
    """
    # Move body from UserCourseManagementView.post atomic block here.
    # Use UserCourseSerializer(data=to_be_created, many=True); assume already validated
    # by caller — call is_valid() again and raise ValidationError if invalid (belt/suspenders).
    ...
    return graph_sync_rows
```

Imports: `Task` from `app_tasks.models`, `tenant_syncs_course_team_roster` from `app_microsoft.team_provisioning_helpers`, plus `MembershipEventInput` / `record_membership_events_bulk` as in the view. Do not perform Graph calls or `refresh_course_member_counts_now` inside this function.

- [ ] **Step 4: Refactor the view**

`UserCourseManagementView.post` structure:

1. Auth + `check_course_write` (unchanged).
2. Split `to_be_removed` / `entities`.
3. Compute `to_be_created` / `to_be_updated` candidates **without writing** (read-only existence checks), OR keep existence checks inside service but **move MS + serializer validation before any write**:
   - Preferred: validate `to_be_created` with `UserCourseSerializer(data=..., many=True).is_valid()` and MS microsoft_id / microsoft_group_id checks **before** `apply_user_course_management`.
   - On invalid: `return send_response(..., 400)` with **zero** DB writes.
4. Call `apply_user_course_management(...)`.
5. After return: Graph `add_member` loop (existing try/except); `refresh_course_member_counts_now`.

Critical: delete the old `with transaction.atomic():` block that contained `return self.send_response(...)`.

- [ ] **Step 5: Run tests**

Run: `./scripts/run_backend_tests.sh app_course.tests.test_roster_management_atomic app_course.tests.test_course_student_teams_gate app_course.tests.test_membership_history`

Expected: PASS

---

### Task 6: Atomic course event edit

**Files:**
- Create: `app_course/event_edit_services.py`
- Modify: `app_course/views.py` (`CourseEventEditView.post`)
- Create: `app_course/tests/test_event_edit_atomic.py`

**Interfaces:**
- Produces: `@transaction.atomic def apply_course_event_edit(*, course, course_serializer, serialized_events_to_be_created, create_draft_ids, overlap_merges, events_to_be_deleted, merge_source_ids, events_to_be_updated) -> tuple[list, list]`
  - Returns `(created_serializer_data, updated_events_data)` for the response
- View runs validation + check-in delete guard **before** calling apply; MS meeting after

- [ ] **Step 1: Write the failing test**

Create course with two events: E_keep (will create sibling) and E_del with a `UserEvent` that has `checkin_time` set. Payload: create one new event + mark E_del deleted. Expect 400 and **no** new Event rows / course fields unchanged.

```python
def test_checkin_guard_blocks_before_any_writes(self):
    with schema_context(self.schema_name):
        event_count_before = Event.objects.filter(course=self.course).count()
        title_before = self.course.title
    client = self._client(self.admin)
    res = client.post(
        f"/api/v1/courses/{self.course.id}/edit-events",
        {
            "course": {"title": "ShouldNotPersist"},
            "events": [
                {
                    "id": "new-1",
                    "date": "2026-08-01",
                    "time_from": "09:00:00",
                    "time_to": "10:00:00",
                    # include required EventSerializer fields from existing edit-events tests
                },
                {"id": self.event_with_checkin.id, "is_deleted": True},
            ],
            "overlap_merges": [],
        },
        format="json",
    )
    self.assertEqual(res.status_code, 400)
    with schema_context(self.schema_name):
        self.course.refresh_from_db()
        self.assertEqual(self.course.title, title_before)
        self.assertEqual(
            Event.objects.filter(course=self.course).count(), event_count_before
        )
```

Find the real URL name/path via `app_course/urls.py` (`edit-events` or similar) and required event fields from any existing schedule-edit test. If no existing test, inspect `EventSerializer` fields and use valid values.

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_course.tests.test_event_edit_atomic`

Expected: FAIL — course title changed and/or new event created despite 400 (today’s mid-flow guard).

- [ ] **Step 3: Implement `app_course/event_edit_services.py`**

```python
from __future__ import annotations

from django.db import transaction

from app_course import models
from app_course.serializers import EventSerializer
# imports for ensure_teacher_userevents_for_events, overlap_fix helpers


@transaction.atomic
def apply_course_event_edit(
    *,
    course,
    course_serializer,
    serialized_events_to_be_created,
    create_draft_ids: list,
    overlap_merges: list,
    events_to_be_deleted: list,
    merge_source_ids: set[int],
    events_to_be_updated: list[dict],
) -> tuple[list, list]:
    course_serializer.save()
    merged_deleted_ids: set[int] = set()
    created_instances = []
    if serialized_events_to_be_created.validated_data:
        created_instances = serialized_events_to_be_created.save()
        if created_instances:
            ensure_teacher_userevents_for_events(
                course_id=course.id,
                event_ids=[obj.id for obj in created_instances],
            )
    # overlap merge loop (same as view today)
    # remaining deletes (guard already passed in view)
    # bulk_update edits
    # return (created data list, updated data list)
```

Move the check-in guard **out** of the service into the view, **before** `apply_course_event_edit`, using `events_to_be_deleted` and `merge_source_ids` (merged_deleted_ids is empty before apply — for non-merge deletes, guard on `events_to_be_deleted` minus `merge_source_ids` only). That matches the spec: fail before any writes.

Important: for deletes that are only merge sources, do not block on their check-ins here (merge path handles attendance). Guard only IDs that would be hard-deleted outside merges — same filter as today’s `delete_ids_for_guard` but evaluated pre-write with `merged_deleted_ids = empty` and excluding `merge_source_ids`.

- [ ] **Step 4: Refactor `CourseEventEditView.post`**

Order:
1. Auth / course load (unchanged)
2. Parse events lists
3. Serializer validate create/update/course
4. `validate_simulated_course_event_edit`
5. Check-in delete guard → 400 if blocked
6. `apply_course_event_edit(...)`
7. MS `create_course_meeting_if_needed` (outside atomic; on ValidationError return bad_request — DB already committed)
8. Success response

- [ ] **Step 5: Run tests**

Run: `./scripts/run_backend_tests.sh app_course.tests.test_event_edit_atomic app_course.tests.test_overlap_fix app_course.tests.test_event_overlap`

Expected: PASS

---

### Task 7: Spec status + final verification

**Files:**
- Modify: `docs/superpowers/specs/2026-07-21-atomic-transactions-multi-write-design.md` (status line only)

- [ ] **Step 1: Run full touched suite**

```bash
./scripts/run_backend_tests.sh \
  app_finance.tests.test_receiver_side_match_atomic \
  app_finance.tests.test_discount_engine \
  app_finance.tests.test_verify_screenshots_atomic \
  app_course.tests.test_join_request_approval_atomic \
  app_course.tests.test_student_join_request \
  app_course.tests.test_roster_management_atomic \
  app_course.tests.test_course_student_teams_gate \
  app_course.tests.test_event_edit_atomic \
  app_course.tests.test_overlap_fix
```

Expected: all PASS

- [ ] **Step 2: Mark spec implemented**

Change status line to: `**Status:** implemented`

- [ ] **Step 3: Manual smoke (optional checklist)**

- Roster bulk save (valid)
- Roster remove+invalid add with Teams on → error, removals not applied
- Verify screenshots CSV happy path
- Approve join request
- Apply enrollment discount replace
- Course schedule edit with delete blocked by check-in

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| RSS match atomic | Task 1 |
| Enrollment discount deactivate+create atomic | Task 2 |
| Join approve atomic + approve-all outer + on_commit email | Task 3 |
| Serializer APPROVED no double status write | Task 3 |
| VerifyScreenshots RSS+payment atomic | Task 4 |
| Roster manage validate-before-write + service atomic | Task 5 |
| Course event edit atomic + guard before writes + MS after | Task 6 |
| Targeted rollback tests | Tasks 1–6 |
| No ATOMIC_REQUESTS / no FE / no API shape change | Global Constraints |

## Plan self-review notes

- Import paths locked: `app_tasks.models.Task`, `app_microsoft.team_provisioning_helpers.tenant_syncs_course_team_roster`, edit-events URL `/api/v1/courses/<id>/edit-events`.
- Nested atomic on join approve-all is intentional.
- Unrelated overlap-reschedule WIP must not be bundled into these changes.
- Task 6 event payload fields: copy required keys from a successful `edit-events` call or `EventSerializer` — do not invent optional-only fields.

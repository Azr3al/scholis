# Fee Lifecycle Sankey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a currency-weighted fee-lifecycle Sankey to `/finances`, between the stat cards and the existing charts, backed by `POST finance/fee-lifecycle`.

**Architecture:** A new `app_finance/fee_lifecycle_services.py` builds a node/link graph from coverage-scoped `UserPayment` rows (not `verified_at`). The view is a separate `RBACView` with a stricter permission set than the homepage. The FE fetches it independently via react-query, gated on `payment.view_all` OR `analytics.view`, and renders through a finance-agnostic `SankeyDiagram` that uses `d3-sankey` for layout only.

**Tech Stack:** Django REST (`RBACView`), django-money, `d3-sankey`, React Query, Vitest, Django `TestCase`.

**Spec:** `schedjuice-reimagined-be/docs/superpowers/specs/2026-09-13-fee-lifecycle-sankey-design.md`

## Global Constraints

- Band widths use `invoiced_amount` (fall back: `base_amount` None → treat as `invoiced_amount`; `discount_amount` None → `0`). Never `actual_amount`.
- Period: union of `month_visibility_q` over every calendar month in `resolve_period_bounds`. Coverage rows win; `issued_at` is fallback.
- Course scope is **program/intake only** — do **not** call `scope_courses_for_user`. This endpoint is school-wide.
- Permission: `payment.view_all` OR `analytics.view`. Teachers (`payment.record` only) get 403.
- Breakdown fans out from **Retained**, never Collected (Collected already flows to Retained + Refunded).
- Refunds: `PaymentAdjustment.Kind.REFUND` only, and only when the parent payment is `verified`. Clamp per payment: `min(refund, invoiced_amount)`. Set `meta.refund_clamped` when any clamp fires.
- `re_transfer` never reduces Retained.
- Estimated / unattributed bands are hatched. Zero-value nodes and links are omitted.
- Click-through is **out of scope**.
- Do not change homepage aggregations or the `verified_at` basis of the stat cards. Relabel the card only.
- BE tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <target>` (always `--keepdb`).
- FE tests: `cd schedjuice-reimagined-fe && pnpm test:unit <path>`.
- High-value tests only — RBAC denials, coverage vs issued_at, balance invariant, clamp, estimate billing types. No happy-path smoke.
- BE and FE are **separate git repos**. Run BE commands and commits from `schedjuice-reimagined-be/` (paths like `app_finance/...`). Run FE commands and commits from `schedjuice-reimagined-fe/` (paths like `src/...`).

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `schedjuice-reimagined-be/app_finance/fee_lifecycle_services.py` | Create | Coverage queryset, buckets, estimate, refunds, payload |
| `schedjuice-reimagined-be/app_finance/views.py` | Modify | `FeeLifecycleView` |
| `schedjuice-reimagined-be/app_finance/urls.py` | Modify | Register `finance/fee-lifecycle` |
| `schedjuice-reimagined-be/app_finance/tests/test_fee_lifecycle.py` | Create | RBAC, invariants, coverage, estimate, refunds |
| `schedjuice-reimagined-fe/src/types/finance/fee-lifecycle.ts` | Create | Request/response types |
| `schedjuice-reimagined-fe/src/hooks/finances/use-fee-lifecycle.ts` | Create | react-query hook |
| `schedjuice-reimagined-fe/src/hooks/finances/use-fee-lifecycle.test.ts` | Create | Request builder + enabled-when-permitted |
| `schedjuice-reimagined-fe/package.json` | Modify | Add `d3-sankey` |
| `schedjuice-reimagined-fe/src/components/charts/sankey-diagram.tsx` | Create | Generic SVG Sankey |
| `schedjuice-reimagined-fe/src/components/charts/sankey-diagram.test.tsx` | Create | Hatch, empty state, distinct fills |
| `schedjuice-reimagined-fe/src/components/finances/fee-lifecycle-section.tsx` | Create | Finance wrapper, toggle, permission gate |
| `schedjuice-reimagined-fe/src/components/finances/fee-lifecycle-section.test.tsx` | Create | Gate, empty, breakdown source |
| `schedjuice-reimagined-fe/src/components/finances/finance-homepage-content.tsx` | Modify | Insert section after stat cards |
| `schedjuice-reimagined-fe/src/components/finances/finance-homepage-stat-cards.tsx` | Modify | One-row grid; relabel Collected |

## Node / link keys (locked)

Use these string keys everywhere (BE payload, FE color map, tests):

```
expected, not_yet_billed, billed, discounts_given, net_invoiced,
collected, in_verification, awaiting_payment, stuck, refunded, retained
```

Breakdown nodes: `method:<id>` or `bank:<code>` (plus `method:none` / `bank:unknown`).

Settlement status map (exhaustive over `UserPayment.Status`):

```python
SETTLEMENT_BAND_BY_STATUS = {
    UserPayment.Status.VERIFIED: "collected",
    UserPayment.Status.PENDING_VERIFICATION: "in_verification",
    UserPayment.Status.AWAITING_EXTRACTION: "in_verification",
    UserPayment.Status.AWAITING_METADATA_EXTRACTION: "in_verification",
    UserPayment.Status.PENDING_PAYMENT: "awaiting_payment",
    UserPayment.Status.AMOUNT_MISMATCH: "stuck",
    UserPayment.Status.DUPLICATED: "stuck",
    UserPayment.Status.CANNOT_EXTRACT: "stuck",
}
```

A test must fail if a new status is added without a mapping.

---

### Task 1: Coverage queryset + billed / settlement buckets

**Files:**
- Create: `schedjuice-reimagined-be/app_finance/fee_lifecycle_services.py`
- Create: `schedjuice-reimagined-be/app_finance/tests/test_fee_lifecycle.py`

**Interfaces:**
- Consumes: `homepage_services.resolve_period_bounds`, `payment_coverage.month_visibility_q`, `payment_coverage.calendar_months_between_dates`
- Produces:
  ```python
  VALID_BREAKDOWNS: frozenset[str]  # {"none", "payment_method", "bank"}

  def resolve_lifecycle_course_ids(*, program_id: int, intake_id: int | None) -> list[int]: ...
  def payments_covering_period(qs, months: list[tuple[int, int]]): ...
  def money_of(value) -> Decimal: ...
  def aggregate_recorded_buckets(payments) -> dict: ...
  ```

- [ ] **Step 1: Write the failing tests**

Create `test_fee_lifecycle.py` using the same fixture mixin pattern as `test_finance_homepage.py` (`schema_name = "xschedjuice"`, `seed_rbac()`, `_create_program_courses`, `_client`). Copy `_database_reachable` and the mixin structure; give users unique emails via `uuid4().hex[:6]`.

```python
import unittest
from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from djmoney.money import Money
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_finance.models import PaymentPlan, UserPayment, UserPaymentCoveredMonth, PaymentAdjustment
from app_finance.tests.telegram_mixin import TelegramSignalTestMixin
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class FeeLifecycleFixtureMixin:
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _create_program_courses(self, suffix: str):
        with schema_context(self.schema_name):
            seed_rbac()
            self.manager = User.objects.create_user(
                email=f"fl-mgr-{suffix}@example.com",
                password="x", name="Manager", phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.MANAGER],
            )
            self.teacher = User.objects.create_user(
                email=f"fl-tch-{suffix}@example.com",
                password="x", name="Teacher", phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"fl-stu-{suffix}@example.com",
                password="x", name="Student", phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.finance = User.objects.create_user(
                email=f"fl-fin-{suffix}@example.com",
                password="x", name="Finance", phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            self.hr = User.objects.create_user(
                email=f"fl-hr-{suffix}@example.com",
                password="x", name="HR", phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.HR],
            )
            cat = Category.objects.create(name=f"Cat {suffix}")
            self.program = Program.objects.create(
                name=f"Prog {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.plan = PaymentPlan.objects.create(
                name=f"Plan {suffix}",
                price=Money(100000, "USD"),
                billing_type=PaymentPlan.BillingType.PER_PERIOD,
            )
            self.course_a = Course.objects.create(
                title=f"Course A {suffix}",
                category=cat, program=self.program,
                start_date=date(2026, 1, 1), end_date=date(2026, 12, 31),
                payment_plan=self.plan, is_payment_enabled=True,
            )
            UserCourse.objects.create(
                user=self.student, course=self.course_a,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            from app_organization.models import Organization
            self.org = Organization.objects.get(schema_name=self.schema_name)

    def _aware(self, year, month, day=1):
        return timezone.make_aware(datetime(year, month, day, 12, 0, 0))

    def _pay(self, **kwargs):
        defaults = dict(
            user=self.student, course=self.course_a,
            status=UserPayment.Status.PENDING_PAYMENT,
            base_amount=Money(100000, "USD"),
            discount_amount=Money(0, "USD"),
            invoiced_amount=Money(100000, "USD"),
            issued_at=self._aware(2026, 3, 1),
        )
        defaults.update(kwargs)
        return UserPayment.objects.create(**defaults)


@override_settings(RBAC_ENFORCE="enforce")
class FeeLifecycleCoverageTests(TelegramSignalTestMixin, FeeLifecycleFixtureMixin, TestCase):
    def setUp(self):
        self._create_program_courses(uuid4().hex[:6])

    def test_coverage_rows_win_over_issued_at(self):
        from app_finance.fee_lifecycle_services import payments_covering_period
        from app_finance.models import UserPayment
        with schema_context(self.schema_name):
            pay = self._pay(issued_at=self._aware(2026, 4, 1))
            UserPaymentCoveredMonth.objects.create(
                user_payment=pay, year=2026, month_index=3,
            )
            qs = payments_covering_period(
                UserPayment.objects.filter(course=self.course_a),
                [(2026, 3)],
            )
            self.assertEqual(list(qs.values_list("id", flat=True)), [pay.id])
            qs_apr = payments_covering_period(
                UserPayment.objects.filter(course=self.course_a),
                [(2026, 4)],
            )
            self.assertEqual(list(qs_apr), [])

    def test_null_issued_at_without_coverage_is_excluded_from_period(self):
        from app_finance.fee_lifecycle_services import payments_covering_period
        from app_finance.models import UserPayment
        with schema_context(self.schema_name):
            self._pay(issued_at=None)
            qs = payments_covering_period(
                UserPayment.objects.filter(course=self.course_a),
                [(2026, 3)],
            )
            self.assertEqual(list(qs), [])

    def test_every_status_maps_to_exactly_one_settlement_band(self):
        from app_finance.fee_lifecycle_services import SETTLEMENT_BAND_BY_STATUS
        from app_finance.models import UserPayment
        mapped = set(SETTLEMENT_BAND_BY_STATUS)
        self.assertEqual(mapped, set(UserPayment.Status.values))
        self.assertEqual(len(SETTLEMENT_BAND_BY_STATUS), len(UserPayment.Status.values))

    def test_billed_split_balances(self):
        from app_finance.fee_lifecycle_services import aggregate_recorded_buckets
        with schema_context(self.schema_name):
            self._pay(
                status=UserPayment.Status.VERIFIED,
                base_amount=Money(100000, "USD"),
                discount_amount=Money(20000, "USD"),
                invoiced_amount=Money(80000, "USD"),
                actual_amount=Money(85000, "USD"),
            )
            self._pay(
                status=UserPayment.Status.PENDING_PAYMENT,
                base_amount=Money(50000, "USD"),
                discount_amount=Money(0, "USD"),
                invoiced_amount=Money(50000, "USD"),
            )
            buckets = aggregate_recorded_buckets(
                UserPayment.objects.filter(course=self.course_a)
            )
            billed = buckets["billed"]
            self.assertEqual(billed["base"], Decimal("150000"))
            self.assertEqual(billed["discount"], Decimal("20000"))
            self.assertEqual(billed["invoiced"], Decimal("130000"))
            self.assertEqual(
                billed["discount"] + billed["invoiced"], billed["base"]
            )
            self.assertEqual(buckets["settlement"]["collected"], Decimal("80000"))
            self.assertEqual(buckets["settlement"]["awaiting_payment"], Decimal("50000"))
            self.assertEqual(
                sum(buckets["settlement"].values()), billed["invoiced"]
            )
            # overpayment must not inflate collected
            self.assertEqual(buckets["cash_received"], Decimal("85000"))
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_fee_lifecycle.FeeLifecycleCoverageTests
```

Expected: FAIL — `ModuleNotFoundError: app_finance.fee_lifecycle_services`.

- [ ] **Step 3: Minimal implementation**

`fee_lifecycle_services.py`:

```python
"""Fee-lifecycle Sankey aggregates (coverage-scoped, not verified_at)."""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from functools import reduce
from operator import or_

from django.db.models import Exists, OuterRef, Q, QuerySet

from app_course.models import Course
from app_finance.models import UserPayment, UserPaymentCoveredMonth, PaymentAdjustment
from app_finance.payment_coverage import calendar_months_between_dates, month_visibility_q

VALID_BREAKDOWNS = frozenset({"none", "payment_method", "bank"})

SETTLEMENT_BAND_BY_STATUS = {
    UserPayment.Status.VERIFIED: "collected",
    UserPayment.Status.PENDING_VERIFICATION: "in_verification",
    UserPayment.Status.AWAITING_EXTRACTION: "in_verification",
    UserPayment.Status.AWAITING_METADATA_EXTRACTION: "in_verification",
    UserPayment.Status.PENDING_PAYMENT: "awaiting_payment",
    UserPayment.Status.AMOUNT_MISMATCH: "stuck",
    UserPayment.Status.DUPLICATED: "stuck",
    UserPayment.Status.CANNOT_EXTRACT: "stuck",
}


def _money_str(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def money_of(value) -> Decimal:
    if value is None:
        return Decimal("0")
    if hasattr(value, "amount"):
        return Decimal(str(value.amount))
    return Decimal(str(value))


def resolve_lifecycle_course_ids(*, program_id: int, intake_id: int | None) -> list[int]:
    qs = Course.objects.filter(program_id=program_id)
    if intake_id is not None:
        qs = qs.filter(intake_id=intake_id)
    return list(qs.values_list("id", flat=True))


def payments_covering_period(qs: QuerySet, months: list[tuple[int, int]]) -> QuerySet:
    if not months:
        return qs.none()
    q = reduce(or_, (month_visibility_q(y, m) for y, m in months))
    return qs.filter(q).distinct()


def aggregate_recorded_buckets(payments: QuerySet) -> dict:
    billed_base = billed_discount = billed_invoiced = Decimal("0")
    cash_received = Decimal("0")
    settlement = {
        "collected": Decimal("0"),
        "in_verification": Decimal("0"),
        "awaiting_payment": Decimal("0"),
        "stuck": Decimal("0"),
    }
    counts = {k: {"payments": 0, "students": set()} for k in settlement}
    billed_students: set = set()
    billed_payments = 0
    rows = payments.values(
        "id", "user_id", "status",
        "base_amount", "discount_amount", "invoiced_amount",
        "actual_amount", "parsed_amount",
    )
    payment_ids = []
    for row in rows:
        payment_ids.append(row["id"])
        invoiced = money_of(row["invoiced_amount"])
        base = money_of(row["base_amount"]) if row["base_amount"] is not None else invoiced
        discount = money_of(row["discount_amount"])
        billed_base += base
        billed_discount += discount
        billed_invoiced += invoiced
        billed_payments += 1
        if row["user_id"] is not None:
            billed_students.add(row["user_id"])
        band = SETTLEMENT_BAND_BY_STATUS[row["status"]]
        settlement[band] += invoiced
        counts[band]["payments"] += 1
        if row["user_id"] is not None:
            counts[band]["students"].add(row["user_id"])
        if row["status"] == UserPayment.Status.VERIFIED:
            cash = money_of(row["actual_amount"])
            if cash == 0:
                cash = money_of(row["parsed_amount"])
            cash_received += cash
    return {
        "billed": {
            "base": billed_base,
            "discount": billed_discount,
            "invoiced": billed_invoiced,
            "payment_count": billed_payments,
            "student_count": len(billed_students),
        },
        "settlement": settlement,
        "counts": {k: {"payment_count": v["payments"], "student_count": len(v["students"])} for k, v in counts.items()},
        "cash_received": cash_received,
        "payment_ids": payment_ids,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_fee_lifecycle.FeeLifecycleCoverageTests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app_finance/fee_lifecycle_services.py \
        app_finance/tests/test_fee_lifecycle.py
git commit -m "feat(finance): coverage-scoped fee-lifecycle buckets"
```

---

### Task 2: Refunds + unattributed

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/fee_lifecycle_services.py`
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_fee_lifecycle.py`

**Interfaces:**
- Consumes: `aggregate_recorded_buckets` (returns `payment_ids`)
- Produces:
  ```python
  def aggregate_refunds(payment_ids: list[int], collected: Decimal) -> dict:
      # {refunded: Decimal, retained: Decimal, refund_clamped: bool, per_payment_retained: dict[int, Decimal]}
  def aggregate_unattributed(*, course_ids: list[int]) -> dict:
      # {amount: Decimal, payment_count: int}
  ```

- [ ] **Step 1: Write the failing tests** (add class `FeeLifecycleRefundTests` in the same file)

```python
@override_settings(RBAC_ENFORCE="enforce")
class FeeLifecycleRefundTests(TelegramSignalTestMixin, FeeLifecycleFixtureMixin, TestCase):
    def setUp(self):
        self._create_program_courses(uuid4().hex[:6])

    def test_re_transfer_does_not_reduce_retained(self):
        from app_finance.fee_lifecycle_services import aggregate_refunds
        with schema_context(self.schema_name):
            pay = self._pay(status=UserPayment.Status.VERIFIED)
            PaymentAdjustment.objects.create(
                user_payment=pay, kind=PaymentAdjustment.Kind.RE_TRANSFER,
                amount=Money(10000, "USD"), occurred_at=self._aware(2026, 3, 15),
            )
            result = aggregate_refunds([pay.id], Decimal("100000"))
            self.assertEqual(result["refunded"], Decimal("0"))
            self.assertEqual(result["retained"], Decimal("100000"))
            self.assertFalse(result["refund_clamped"])

    def test_refund_on_non_verified_is_ignored(self):
        from app_finance.fee_lifecycle_services import aggregate_refunds
        with schema_context(self.schema_name):
            pay = self._pay(status=UserPayment.Status.PENDING_PAYMENT)
            PaymentAdjustment.objects.create(
                user_payment=pay, kind=PaymentAdjustment.Kind.REFUND,
                amount=Money(10000, "USD"), occurred_at=self._aware(2026, 3, 15),
            )
            result = aggregate_refunds([pay.id], Decimal("0"))
            self.assertEqual(result["refunded"], Decimal("0"))

    def test_over_refund_is_clamped_to_invoiced(self):
        from app_finance.fee_lifecycle_services import aggregate_refunds
        with schema_context(self.schema_name):
            pay = self._pay(
                status=UserPayment.Status.VERIFIED,
                invoiced_amount=Money(100000, "USD"),
            )
            PaymentAdjustment.objects.create(
                user_payment=pay, kind=PaymentAdjustment.Kind.REFUND,
                amount=Money(250000, "USD"), occurred_at=self._aware(2026, 3, 15),
            )
            result = aggregate_refunds([pay.id], Decimal("100000"))
            self.assertEqual(result["refunded"], Decimal("100000"))
            self.assertEqual(result["retained"], Decimal("0"))
            self.assertTrue(result["refund_clamped"])

    def test_unattributed_includes_null_issued_at_without_coverage(self):
        from app_finance.fee_lifecycle_services import aggregate_unattributed
        with schema_context(self.schema_name):
            self._pay(
                issued_at=None,
                invoiced_amount=Money(4200, "USD"),
                base_amount=Money(4200, "USD"),
            )
            # period-attributed control row must not appear
            self._pay(issued_at=self._aware(2026, 3, 1))
            result = aggregate_unattributed(course_ids=[self.course_a.id])
            self.assertEqual(result["amount"], Decimal("4200"))
            self.assertEqual(result["payment_count"], 1)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_fee_lifecycle.FeeLifecycleRefundTests
```

Expected: FAIL — `aggregate_refunds` / `aggregate_unattributed` not defined.

- [ ] **Step 3: Minimal implementation**

```python
def aggregate_refunds(payment_ids: list[int], collected: Decimal) -> dict:
    per_payment_retained: dict[int, Decimal] = {}
    if not payment_ids:
        return {
            "refunded": Decimal("0"),
            "retained": collected,
            "refund_clamped": False,
            "per_payment_retained": per_payment_retained,
        }
    verified_ids = set(
        UserPayment.objects.filter(
            id__in=payment_ids, status=UserPayment.Status.VERIFIED
        ).values_list("id", flat=True)
    )
    invoiced_by_id = {
        row["id"]: money_of(row["invoiced_amount"])
        for row in UserPayment.objects.filter(id__in=verified_ids).values(
            "id", "invoiced_amount"
        )
    }
    raw_refunds: dict[int, Decimal] = {pid: Decimal("0") for pid in verified_ids}
    for row in PaymentAdjustment.objects.filter(
        user_payment_id__in=verified_ids,
        kind=PaymentAdjustment.Kind.REFUND,
    ).values("user_payment_id", "amount"):
        raw_refunds[row["user_payment_id"]] += money_of(row["amount"])

    refunded = Decimal("0")
    refund_clamped = False
    for pid, invoiced in invoiced_by_id.items():
        raw = raw_refunds.get(pid, Decimal("0"))
        clamped = min(raw, invoiced)
        if clamped < raw:
            refund_clamped = True
        refunded += clamped
        per_payment_retained[pid] = invoiced - clamped
    return {
        "refunded": refunded,
        "retained": collected - refunded,
        "refund_clamped": refund_clamped,
        "per_payment_retained": per_payment_retained,
    }


def aggregate_unattributed(*, course_ids: list[int]) -> dict:
    if not course_ids:
        return {"amount": Decimal("0"), "payment_count": 0}
    has_coverage = Exists(
        UserPaymentCoveredMonth.objects.filter(user_payment_id=OuterRef("pk"))
    )
    qs = UserPayment.objects.filter(
        course_id__in=course_ids, issued_at__isnull=True,
    ).filter(~has_coverage)
    amount = Decimal("0")
    count = 0
    for row in qs.values("invoiced_amount"):
        amount += money_of(row["invoiced_amount"])
        count += 1
    return {"amount": amount, "payment_count": count}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_fee_lifecycle.FeeLifecycleRefundTests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app_finance/fee_lifecycle_services.py \
        app_finance/tests/test_fee_lifecycle.py
git commit -m "feat(finance): fee-lifecycle refunds and unattributed band"
```

---

### Task 3: Not-yet-billed estimate

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/fee_lifecycle_services.py`
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_fee_lifecycle.py`

**Interfaces:**
- Consumes: `enrollment_applies_to_report_month`, `payments_covering_period`, `PaymentPlan.billing_type`, `Course.is_payment_enabled`
- Produces:
  ```python
  def aggregate_not_yet_billed(
      *, course_ids: list[int], months: list[tuple[int, int]]
  ) -> dict:  # {amount: Decimal, student_count: int}
  ```

Semantics (from spec):
- Only `assigned_as=student` enrollments on courses with `is_payment_enabled=True` and a non-null `payment_plan`.
- A (user, course, month) is estimated iff no covering `UserPayment` exists for that pair in that month AND `enrollment_applies_to_report_month` is True.
- `per_period`: add `plan.price` once per unpaid month in the window.
- `whole_term`: add `plan.price` **once** if any month in the window is unpaid (do not multiply).
- Ignore `per_hour_price`. Do not apply `EnrollmentDiscount`.

- [ ] **Step 1: Write the failing tests**

```python
@override_settings(RBAC_ENFORCE="enforce")
class FeeLifecycleEstimateTests(TelegramSignalTestMixin, FeeLifecycleFixtureMixin, TestCase):
    def setUp(self):
        self._create_program_courses(uuid4().hex[:6])

    def test_per_period_multiplies_unpaid_months(self):
        from app_finance.fee_lifecycle_services import aggregate_not_yet_billed
        with schema_context(self.schema_name):
            # one covering payment in March, April+May unpaid → 2 * 100000
            self._pay(issued_at=self._aware(2026, 3, 1))
            result = aggregate_not_yet_billed(
                course_ids=[self.course_a.id],
                months=[(2026, 3), (2026, 4), (2026, 5)],
            )
            self.assertEqual(result["amount"], Decimal("200000"))
            self.assertEqual(result["student_count"], 1)

    def test_whole_term_is_not_multiplied(self):
        from app_finance.fee_lifecycle_services import aggregate_not_yet_billed
        with schema_context(self.schema_name):
            self.plan.billing_type = PaymentPlan.BillingType.WHOLE_TERM
            self.plan.save(update_fields=["billing_type"])
            result = aggregate_not_yet_billed(
                course_ids=[self.course_a.id],
                months=[(2026, 3), (2026, 4), (2026, 5)],
            )
            self.assertEqual(result["amount"], Decimal("100000"))

    def test_payment_disabled_course_contributes_nothing(self):
        from app_finance.fee_lifecycle_services import aggregate_not_yet_billed
        with schema_context(self.schema_name):
            self.course_a.is_payment_enabled = False
            self.course_a.save(update_fields=["is_payment_enabled"])
            result = aggregate_not_yet_billed(
                course_ids=[self.course_a.id],
                months=[(2026, 3)],
            )
            self.assertEqual(result["amount"], Decimal("0"))

    def test_late_joiner_skipped_before_anchor(self):
        from app_course.models import UserCourse
        from app_finance.fee_lifecycle_services import aggregate_not_yet_billed
        with schema_context(self.schema_name):
            uc = UserCourse.objects.get(user=self.student, course=self.course_a)
            uc.billing_cycle_anchor_date = date(2026, 5, 1)
            uc.save(update_fields=["billing_cycle_anchor_date"])
            result = aggregate_not_yet_billed(
                course_ids=[self.course_a.id],
                months=[(2026, 3), (2026, 4)],
            )
            self.assertEqual(result["amount"], Decimal("0"))
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_fee_lifecycle.FeeLifecycleEstimateTests
```

Expected: FAIL — `aggregate_not_yet_billed` not defined.

- [ ] **Step 3: Minimal implementation**

Prefetch enrollments and covering payments in bulk (no N+1). One query for enrollments+plans, one for covering payments across the window.

```python
from app_course.models import UserCourse
from app_finance.enrollment_anchor import enrollment_applies_to_report_month
from app_finance.payment_coverage import month_tuples_from_payment

def aggregate_not_yet_billed(*, course_ids: list[int], months: list[tuple[int, int]]) -> dict:
    if not course_ids or not months:
        return {"amount": Decimal("0"), "student_count": 0}
    enrollments = list(
        UserCourse.objects.filter(
            course_id__in=course_ids,
            assigned_as=UserCourse.AssignedAs.STUDENT,
            course__is_payment_enabled=True,
            course__payment_plan__isnull=False,
        ).select_related("course", "course__payment_plan")
    )
    covering = payments_covering_period(
        UserPayment.objects.filter(course_id__in=course_ids),
        months,
    ).prefetch_related("covered_months")
    paid: set[tuple[int, int, int, int]] = set()  # (course_id, user_id, year, month)
    for pay in covering:
        for y, m in month_tuples_from_payment(pay):
            paid.add((pay.course_id, pay.user_id, y, m))
    amount = Decimal("0")
    students: set[int] = set()
    for uc in enrollments:
        plan = uc.course.payment_plan
        price = money_of(plan.price)
        unpaid_months = []
        for y, m in months:
            if not enrollment_applies_to_report_month(
                billing_cycle_anchor_date=uc.billing_cycle_anchor_date,
                report_year=y, report_month=m,
            ):
                continue
            if (uc.course_id, uc.user_id, y, m) in paid:
                continue
            unpaid_months.append((y, m))
        if not unpaid_months:
            continue
        if plan.billing_type == PaymentPlan.BillingType.WHOLE_TERM:
            amount += price
        else:
            amount += price * len(unpaid_months)
        students.add(uc.user_id)
    return {"amount": amount, "student_count": len(students)}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_fee_lifecycle.FeeLifecycleEstimateTests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app_finance/fee_lifecycle_services.py \
        app_finance/tests/test_fee_lifecycle.py
git commit -m "feat(finance): not-yet-billed estimate for fee-lifecycle Sankey"
```

---

### Task 4: Payload orchestrator + Retained breakdown

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/fee_lifecycle_services.py`
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_fee_lifecycle.py`

**Interfaces:**
- Consumes: all aggregators from Tasks 1–3, `resolve_period_bounds`, `calendar_months_between_dates`
- Produces:
  ```python
  def build_fee_lifecycle_payload(
      *, program_id: int, intake_id: int | None,
      period: str, date_from, date_to,
      breakdown: str, org,
  ) -> dict: ...
  ```

Payload shape (locked, matches spec):

```python
{
  "nodes": [{"key": str, "label": str, "amount": str, "is_estimated": bool}],
  "links": [{"source": str, "target": str, "amount": str,
             "payment_count": int, "student_count": int, "is_estimated": bool}],
  "unattributed": {"amount": str, "payment_count": int},
  "meta": {
      "period_label": str, "date_from": str, "date_to": str,
      "cash_received": str, "refund_clamped": bool,
  },
}
```

Omit any node/link whose amount is 0. Unattributed is always present (amount `"0.00"` / count `0` is fine — the FE hides a zero band).

Node labels:

```python
NODE_LABELS = {
    "expected": "Expected revenue",
    "not_yet_billed": "Not yet billed",
    "billed": "Billed",
    "discounts_given": "Discounts given",
    "net_invoiced": "Net invoiced",
    "collected": "Collected",
    "in_verification": "In verification",
    "awaiting_payment": "Awaiting payment",
    "stuck": "Stuck",
    "refunded": "Refunded",
    "retained": "Retained",
}
```

- [ ] **Step 1: Write the failing tests**

```python
@override_settings(RBAC_ENFORCE="enforce")
class FeeLifecyclePayloadTests(TelegramSignalTestMixin, FeeLifecycleFixtureMixin, TestCase):
    def setUp(self):
        self._create_program_courses(uuid4().hex[:6])

    def test_empty_program_returns_zero_payload_without_error(self):
        from app_finance.fee_lifecycle_services import build_fee_lifecycle_payload
        with schema_context(self.schema_name):
            other = Program.objects.create(
                name="Empty",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            payload = build_fee_lifecycle_payload(
                program_id=other.id, intake_id=None,
                period="single_month", date_from=date(2026, 3, 1), date_to=None,
                breakdown="none", org=self.org,
            )
            self.assertEqual(payload["nodes"], [])
            self.assertEqual(payload["links"], [])
            self.assertEqual(payload["unattributed"]["payment_count"], 0)

    def test_missing_program_raises_valueerror(self):
        from app_finance.fee_lifecycle_services import build_fee_lifecycle_payload
        with schema_context(self.schema_name):
            with self.assertRaises(ValueError):
                build_fee_lifecycle_payload(
                    program_id=999999, intake_id=None,
                    period="single_month", date_from=date(2026, 3, 1), date_to=None,
                    breakdown="none", org=self.org,
                )

    def test_payload_links_balance_at_billed_and_net(self):
        from app_finance.fee_lifecycle_services import build_fee_lifecycle_payload
        with schema_context(self.schema_name):
            self._pay(
                status=UserPayment.Status.VERIFIED,
                base_amount=Money(100000, "USD"),
                discount_amount=Money(20000, "USD"),
                invoiced_amount=Money(80000, "USD"),
                actual_amount=Money(80000, "USD"),
            )
            payload = build_fee_lifecycle_payload(
                program_id=self.program.id, intake_id=None,
                period="single_month", date_from=date(2026, 3, 1), date_to=None,
                breakdown="none", org=self.org,
            )
            by_key = {n["key"]: Decimal(n["amount"]) for n in payload["nodes"]}
            outgoing = {}
            for link in payload["links"]:
                outgoing.setdefault(link["source"], Decimal("0"))
                outgoing[link["source"]] += Decimal(link["amount"])
            self.assertEqual(outgoing["billed"], by_key["billed"])
            self.assertEqual(outgoing["net_invoiced"], by_key["net_invoiced"])

    def test_breakdown_fans_from_retained_only(self):
        from app_finance.fee_lifecycle_services import build_fee_lifecycle_payload
        from app_finance.models import PaymentMethod, PaymentBank
        with schema_context(self.schema_name):
            method = PaymentMethod.objects.create(
                name="KBZ", payment_bank=PaymentBank.KBZ,
            )
            self._pay(
                status=UserPayment.Status.VERIFIED,
                payment_method=method,
                actual_amount=Money(100000, "USD"),
            )
            payload = build_fee_lifecycle_payload(
                program_id=self.program.id, intake_id=None,
                period="single_month", date_from=date(2026, 3, 1), date_to=None,
                breakdown="payment_method", org=self.org,
            )
            sources = {l["source"] for l in payload["links"] if l["target"].startswith("method:")}
            self.assertEqual(sources, {"retained"})
            collected_targets = {l["target"] for l in payload["links"] if l["source"] == "collected"}
            self.assertTrue(collected_targets.isdisjoint(
                {l["target"] for l in payload["links"] if l["target"].startswith("method:")}
            ))
```

Check `PaymentBank` enum members before writing `PaymentBank.KBZ` — if the member is named differently (e.g. `KBZPAY`), use whatever exists in `app_finance/models.py` `class PaymentBank`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_fee_lifecycle.FeeLifecyclePayloadTests
```

Expected: FAIL — `build_fee_lifecycle_payload` not defined.

- [ ] **Step 3: Minimal implementation**

Orchestrator outline:

1. Load `Program`; raise `ValueError("Program not found")` if missing. Same for intake (`"Intake not found for program"`).
2. `course_ids = resolve_lifecycle_course_ids(...)`. If empty, return `_empty_payload(period_label="No courses")`.
3. `bounds = resolve_period_bounds(period=period, date_from=date_from, date_to=date_to, intake=intake, org=org, course_ids=course_ids)`.
4. `months = calendar_months_between_dates(bounds.date_from, bounds.date_to)`.
5. `payments = payments_covering_period(UserPayment.objects.filter(course_id__in=course_ids), months)`.
6. `buckets = aggregate_recorded_buckets(payments)`.
7. `refunds = aggregate_refunds(buckets["payment_ids"], buckets["settlement"]["collected"])`.
8. `estimate = aggregate_not_yet_billed(course_ids=course_ids, months=months)`.
9. `unattr = aggregate_unattributed(course_ids=course_ids)`.
10. Assemble nodes/links. `expected = billed.base + estimate.amount`.
11. If `breakdown != "none"`, group `per_payment_retained` by `payment_method__name` or `payment_method__payment_bank` (join via a `values()` on verified ids). Skip zero retained shares.

Link helper:

```python
def _link(source, target, amount, *, payment_count=0, student_count=0, is_estimated=False):
    if amount <= 0:
        return None
    return {
        "source": source, "target": target,
        "amount": _money_str(amount),
        "payment_count": payment_count,
        "student_count": student_count,
        "is_estimated": is_estimated,
    }
```

Drop None links. Node set = every key that appears as a source or target.

For `cash_received` on verified rows with null `actual_amount` and null `parsed_amount`, contribute `0` (do not fall back to invoiced — that would hide variance).

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_fee_lifecycle.FeeLifecyclePayloadTests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app_finance/fee_lifecycle_services.py \
        app_finance/tests/test_fee_lifecycle.py
git commit -m "feat(finance): assemble fee-lifecycle Sankey payload"
```

---

### Task 5: View, URL, RBAC

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/views.py` (append near `FinanceHomepageView`, around line 3556)
- Modify: `schedjuice-reimagined-be/app_finance/urls.py` (add next to `finance/homepage`)
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_fee_lifecycle.py`

**Interfaces:**
- Consumes: `build_fee_lifecycle_payload`, `VALID_PERIODS` from `homepage_services`, `VALID_BREAKDOWNS` from `fee_lifecycle_services`, `_parse_finance_homepage_date` already in `views.py`
- Produces: `POST /api/v1/finance/fee-lifecycle`

- [ ] **Step 1: Write the failing tests**

```python
URL = "/api/v1/finance/fee-lifecycle"

@override_settings(RBAC_ENFORCE="enforce")
class FeeLifecycleViewTests(TelegramSignalTestMixin, FeeLifecycleFixtureMixin, TestCase):
    def setUp(self):
        self._create_program_courses(uuid4().hex[:6])

    def _body(self, **overrides):
        body = {
            "program_id": self.program.id,
            "period": "single_month",
            "date_from": "2026-03-01",
            "breakdown": "none",
        }
        body.update(overrides)
        return body

    def test_forbidden_for_teacher(self):
        resp = self._client(self.teacher).post(URL, self._body(), format="json")
        self.assertEqual(resp.status_code, 403)

    def test_forbidden_for_student(self):
        resp = self._client(self.student).post(URL, self._body(), format="json")
        self.assertEqual(resp.status_code, 403)

    def test_hr_with_analytics_view_is_allowed(self):
        resp = self._client(self.hr).post(URL, self._body(), format="json")
        self.assertEqual(resp.status_code, 200)

    def test_missing_program_id_is_400(self):
        resp = self._client(self.manager).post(
            URL, self._body(program_id=""), format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("program_id", str(resp.json()))

    def test_invalid_period_is_400(self):
        resp = self._client(self.manager).post(
            URL, self._body(period="last_week"), format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("period", str(resp.json()))

    def test_invalid_breakdown_is_400(self):
        resp = self._client(self.manager).post(
            URL, self._body(breakdown="course"), format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("breakdown", str(resp.json()))
```

Reuse `_client` from the mixin (add it if Task 1 omitted it):

```python
    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_fee_lifecycle.FeeLifecycleViewTests
```

Expected: FAIL — 404 (route missing).

- [ ] **Step 3: Minimal implementation**

`urls.py` — add after the homepage path:

```python
    path(
        "finance/fee-lifecycle",
        views.FeeLifecycleView.as_view(),
        name="finance-fee-lifecycle",
    ),
```

`views.py` — import `build_fee_lifecycle_payload, VALID_BREAKDOWNS` from `app_finance.fee_lifecycle_services`. Append:

```python
_FEE_LIFECYCLE_PERMS = frozenset({"payment.view_all", "analytics.view"})


class FeeLifecycleView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]

    def check_permissions(self, request):
        user = acting_user(request)
        if user is None:
            raise PermissionDenied("Authentication credentials were not provided.")
        held = set(effective_permissions(user))
        if not held.intersection(_FEE_LIFECYCLE_PERMS):
            raise PermissionDenied("You don't have permission to perform this action.")

    def post(self, request: Request):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        del user  # school-wide; not used for scoping

        program_id = request.data.get("program_id")
        if program_id in (None, ""):
            return self.send_response(
                True, "validation_error",
                {"details": "program_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        period = request.data.get("period") or "single_month"
        if period not in VALID_PERIODS:
            return self.send_response(
                True, "validation_error",
                {"details": f"period must be one of: {', '.join(sorted(VALID_PERIODS))}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        breakdown = request.data.get("breakdown") or "none"
        if breakdown not in VALID_BREAKDOWNS:
            return self.send_response(
                True, "validation_error",
                {"details": f"breakdown must be one of: {', '.join(sorted(VALID_BREAKDOWNS))}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        intake_raw = request.data.get("intake_id")
        intake_id = int(intake_raw) if intake_raw not in (None, "") else None
        date_from = _parse_finance_homepage_date(request.data.get("date_from"))
        date_to = _parse_finance_homepage_date(request.data.get("date_to"))

        try:
            payload = build_fee_lifecycle_payload(
                program_id=int(program_id),
                intake_id=intake_id,
                period=period,
                date_from=date_from,
                date_to=date_to,
                breakdown=breakdown,
                org=request.tenant,
            )
        except ValueError as exc:
            msg = str(exc)
            status_code = (
                status.HTTP_404_NOT_FOUND
                if "not found" in msg.lower()
                else status.HTTP_400_BAD_REQUEST
            )
            return self.send_response(
                True,
                "validation_error" if status_code == 400 else "not_found",
                {"details": msg},
                status=status_code,
            )
        return self.send_response(False, "success", {"data": payload})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_fee_lifecycle
```

Expected: all classes PASS.

- [ ] **Step 5: Commit**

```bash
git add app_finance/views.py \
        app_finance/urls.py \
        app_finance/tests/test_fee_lifecycle.py
git commit -m "feat(finance): POST finance/fee-lifecycle endpoint"
```

---

### Task 6: FE types + request builder + hook

**Files:**
- Create: `schedjuice-reimagined-fe/src/types/finance/fee-lifecycle.ts`
- Create: `schedjuice-reimagined-fe/src/hooks/finances/use-fee-lifecycle.ts`
- Create: `schedjuice-reimagined-fe/src/hooks/finances/use-fee-lifecycle.test.ts`

**Interfaces:**
- Consumes: `FinanceHomepagePeriod` from `@/types/finance/homepage`, `makePostRequest`, `useQuery`
- Produces: `buildFeeLifecycleRequest`, `useFeeLifecycle`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { buildFeeLifecycleRequest } from "./use-fee-lifecycle";

describe("buildFeeLifecycleRequest", () => {
  it("returns null when program is missing", () => {
    expect(
      buildFeeLifecycleRequest({
        programId: "",
        intakeId: "",
        period: "single_month",
        dateFrom: null,
        dateTo: null,
        breakdown: "none",
      }),
    ).toBeNull();
  });

  it("returns null for custom period without both dates", () => {
    expect(
      buildFeeLifecycleRequest({
        programId: "12",
        intakeId: "",
        period: "custom",
        dateFrom: new Date("2026-08-01"),
        dateTo: null,
        breakdown: "none",
      }),
    ).toBeNull();
  });

  it("maps program, period, and breakdown", () => {
    expect(
      buildFeeLifecycleRequest({
        programId: "12",
        intakeId: "",
        period: "last_3_months",
        dateFrom: new Date("2026-08-01"),
        dateTo: null,
        breakdown: "payment_method",
      }),
    ).toEqual({
      program_id: 12,
      period: "last_3_months",
      date_from: "2026-08-01",
      breakdown: "payment_method",
    });
  });

  it("includes intake_id when set", () => {
    expect(
      buildFeeLifecycleRequest({
        programId: "3",
        intakeId: "9",
        period: "intake_range",
        dateFrom: null,
        dateTo: null,
        breakdown: "none",
      }),
    ).toEqual({
      program_id: 3,
      intake_id: 9,
      period: "intake_range",
      breakdown: "none",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-fe
pnpm test:unit src/hooks/finances/use-fee-lifecycle.test.ts
```

Expected: FAIL — cannot find module `./use-fee-lifecycle`.

- [ ] **Step 3: Minimal implementation**

`src/types/finance/fee-lifecycle.ts`:

```ts
import type { FinanceHomepagePeriod } from "@/types/finance/homepage";

export type FeeLifecycleBreakdown = "none" | "payment_method" | "bank";

export type FeeLifecycleRequest = {
  program_id: number;
  intake_id?: number | null;
  period: FinanceHomepagePeriod;
  date_from?: string;
  date_to?: string;
  breakdown: FeeLifecycleBreakdown;
};

export type FeeLifecycleNode = {
  key: string;
  label: string;
  amount: string;
  is_estimated: boolean;
};

export type FeeLifecycleLink = {
  source: string;
  target: string;
  amount: string;
  payment_count: number;
  student_count: number;
  is_estimated: boolean;
};

export type FeeLifecycleResponse = {
  nodes: FeeLifecycleNode[];
  links: FeeLifecycleLink[];
  unattributed: { amount: string; payment_count: number };
  meta: {
    period_label: string;
    date_from: string | null;
    date_to: string | null;
    cash_received: string;
    refund_clamped: boolean;
  };
};

export type FeeLifecycleFilterState = {
  programId: string;
  intakeId: string;
  period: FinanceHomepagePeriod;
  dateFrom: Date | null;
  dateTo: Date | null;
  breakdown: FeeLifecycleBreakdown;
};
```

`src/hooks/finances/use-fee-lifecycle.ts` — copy `buildFinanceHomepageRequest` from `use-finance-homepage.ts` and replace `pie_group_by` with `breakdown`. Endpoint: `"finance/fee-lifecycle"`. Query key: `["finance-fee-lifecycle", body]`. Accept `enabled: boolean` as a second argument so the section can gate the fetch:

```ts
export function useFeeLifecycle(
  state: FeeLifecycleFilterState,
  options?: { enabled?: boolean },
) {
  const body = buildFeeLifecycleRequest(state);
  const permitted = options?.enabled ?? true;
  return useQuery({
    queryKey: ["finance-fee-lifecycle", body],
    queryFn: async () => {
      const res = await makePostRequest("finance/fee-lifecycle", body!);
      return (res?.data?.data ?? res?.data) as FeeLifecycleResponse;
    },
    enabled: body != null && permitted,
    keepPreviousData: true,
  });
}
```

Date formatting: same `format(date, "yyyy-MM-dd")` as homepage. Custom period without both dates → `null`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-fe
pnpm test:unit src/hooks/finances/use-fee-lifecycle.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/finance/fee-lifecycle.ts \
        src/hooks/finances/use-fee-lifecycle.ts \
        src/hooks/finances/use-fee-lifecycle.test.ts
git commit -m "feat(finance): fee-lifecycle request types and hook"
```

---

### Task 7: Generic Sankey diagram

**Files:**
- Modify: `schedjuice-reimagined-fe/package.json` (via `pnpm add`)
- Create: `schedjuice-reimagined-fe/src/components/charts/sankey-diagram.tsx`
- Create: `schedjuice-reimagined-fe/src/components/charts/sankey-diagram.test.tsx`

**Interfaces:**
- Consumes: `d3-sankey` (`sankey`, `sankeyLinkHorizontal`). Do **not** wrap in `ChartContainer` — that requires Recharts children.
- Produces: `SankeyDiagram` React component

```ts
export type SankeyNodeInput = {
  key: string;
  label: string;
  amount: string;
  isEstimated?: boolean;
};
export type SankeyLinkInput = {
  source: string;
  target: string;
  amount: string;
  isEstimated?: boolean;
};
export type SankeyDiagramProps = {
  nodes: SankeyNodeInput[];
  links: SankeyLinkInput[];
  formatAmount: (amount: string) => string;
  nodeColor: (node: SankeyNodeInput) => string;
  emptyMessage?: string;
  tooltipContent?: (args: {
    kind: "node" | "link";
    node?: SankeyNodeInput;
    link?: SankeyLinkInput;
  }) => React.ReactNode;
};
```

- [ ] **Step 1: Install the dependency**

```bash
cd schedjuice-reimagined-fe
pnpm add d3-sankey
pnpm add -D @types/d3-sankey
```

- [ ] **Step 2: Write the failing tests**

```tsx
import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SankeyDiagram } from "./sankey-diagram";

const nodes = [
  { key: "collected", label: "Collected", amount: "100" },
  { key: "stuck", label: "Stuck", amount: "40" },
  { key: "not_yet_billed", label: "Not yet billed", amount: "20", isEstimated: true },
];
const links = [
  { source: "collected", target: "stuck", amount: "40" },
];

describe("SankeyDiagram", () => {
  it("renders the empty state when there are no links", () => {
    cleanup();
    render(
      <SankeyDiagram
        nodes={[]}
        links={[]}
        formatAmount={(a) => a}
        nodeColor={() => "red"}
        emptyMessage="No billed fees for this period."
      />,
    );
    expect(screen.getByText("No billed fees for this period.")).toBeTruthy();
    expect(document.querySelector("svg")).toBeNull();
  });

  it("marks estimated nodes with a hatch pattern and accessible name", () => {
    cleanup();
    render(
      <SankeyDiagram
        nodes={nodes}
        links={[
          { source: "collected", target: "not_yet_billed", amount: "20", isEstimated: true },
        ]}
        formatAmount={(a) => a}
        nodeColor={(n) => (n.key === "stuck" ? "rgb(220, 38, 38)" : "rgb(5, 150, 105)")}
      />,
    );
    expect(document.querySelector("pattern#sankey-hatch")).toBeTruthy();
    const estimated = screen.getByLabelText(/not yet billed/i);
    expect(estimated.getAttribute("aria-label")).toMatch(/estimated/i);
  });

  it("does not give collected and stuck the same fill", () => {
    cleanup();
    const fills: Record<string, string> = {
      collected: "rgb(5, 150, 105)",
      stuck: "rgb(220, 38, 38)",
      not_yet_billed: "rgb(120, 113, 108)",
    };
    render(
      <SankeyDiagram
        nodes={nodes}
        links={links}
        formatAmount={(a) => a}
        nodeColor={(n) => fills[n.key]}
      />,
    );
    const collected = document.querySelector('[data-node-key="collected"]');
    const stuck = document.querySelector('[data-node-key="stuck"]');
    expect(collected).toBeTruthy();
    expect(stuck).toBeTruthy();
    expect(collected?.getAttribute("fill")).not.toBe(stuck?.getAttribute("fill"));
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-fe
pnpm test:unit src/components/charts/sankey-diagram.test.tsx
```

Expected: FAIL — cannot find module `./sankey-diagram`.

- [ ] **Step 4: Minimal implementation**

Layout: `sankey().nodeId(d => d.key).nodeWidth(12).nodePadding(16)`. Size from a `ResizeObserver` on the wrapper (default 720×320 until measured). Horizontal scroll wrapper: `overflow-x-auto` + `min-w-[640px]` on the SVG so it is not squeezed below `lg`.

Hatch: SVG `<pattern id="sankey-hatch">` with rotated lines. Estimated node rects use `fill={color}` plus a second rect with `fill="url(#sankey-hatch)"` and `opacity="0.45"`.

Each node `<g data-node-key={key} fill={color}>` with `<title>` or `aria-label={`${label}${isEstimated ? " (estimated)" : ""}`}`.

Links: `<path d={sankeyLinkHorizontal()(link)} fill={source color} fillOpacity={0.35}>`. Estimated links also overlay the hatch.

Tooltip: simple absolutely-positioned div shown on pointer enter of a node or link, using `tooltipContent` if provided, otherwise `{label}: {formatAmount(amount)}`.

Empty: dashed-border placeholder matching `GenericPieChart`'s empty block (`min-h-[280px] ... border-dashed`).

Do not import Recharts.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-fe
pnpm test:unit src/components/charts/sankey-diagram.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json \
        pnpm-lock.yaml \
        src/components/charts/sankey-diagram.tsx \
        src/components/charts/sankey-diagram.test.tsx
git commit -m "feat(charts): generic d3-sankey diagram"
```

---

### Task 8: Finance section + homepage wiring + stat-card relabel

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/finances/fee-lifecycle-section.tsx`
- Create: `schedjuice-reimagined-fe/src/components/finances/fee-lifecycle-section.test.tsx`
- Create: `schedjuice-reimagined-fe/src/components/finances/finance-homepage-stat-cards.test.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/finances/finance-homepage-content.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/finances/finance-homepage-stat-cards.tsx`

**Interfaces:**
- Consumes: `useFeeLifecycle`, `usePermissions().canAny`, `SankeyDiagram`, `formatDecimalString`, `Select`
- Produces: section that renders `null` without permission; homepage inserts it between the stat-card shell and the chart grid

Color map (finance-specific, passed into `nodeColor`):

```ts
export const FEE_LIFECYCLE_NODE_COLORS: Record<string, string> = {
  expected: "var(--muted-foreground)",
  not_yet_billed: "var(--muted-foreground)",
  billed: "var(--foreground)",
  discounts_given: "#d97706",          // amber-600
  net_invoiced: "var(--foreground)",
  collected: "#059669",                // emerald-600, matches ChangeBadge
  in_verification: "#2563eb",          // blue-600
  awaiting_payment: "var(--muted-foreground)",
  stuck: "#dc2626",                    // red-600, matches ChangeBadge
  refunded: "#dc2626",
  retained: "#059669",
};
// breakdown nodes and unknown keys: var(--muted-foreground)
```

- [ ] **Step 1: Write the failing tests**

`finance-homepage-stat-cards.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FinanceHomepageStatCards } from "./finance-homepage-stat-cards";

describe("FinanceHomepageStatCards labels", () => {
  it("labels the cash-basis card Cash received, not Collected", () => {
    cleanup();
    render(
      <FinanceHomepageStatCards
        summary={{
          collected_amount: "1",
          collected_count: 1,
          unpaid_amount: "1",
          unpaid_count: 1,
          comparison: null,
        }}
        currencySymbol="Ks"
      />,
    );
    expect(screen.getByText("Cash received")).toBeTruthy();
    expect(screen.queryByText("Collected")).toBeNull();
  });
});
```

`fee-lifecycle-section.test.tsx`:

```tsx
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FeeLifecycleSection } from "./fee-lifecycle-section";
import { makePostRequest } from "@/app/client-api/utils";

vi.mock("@/app/client-api/utils", () => ({
  makePostRequest: vi.fn(),
}));

const usePermissionsMock = vi.fn();
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => usePermissionsMock(),
}));

vi.mock("@/hooks/useTenantCurrencySymbol", () => ({
  useTenantCurrencySymbol: () => "Ks",
}));

function renderSection(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const filterState = {
  programId: "3",
  intakeId: "",
  period: "single_month" as const,
  dateFrom: new Date("2026-03-01"),
  dateTo: null,
};

describe("FeeLifecycleSection", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(makePostRequest).mockReset();
  });

  it("renders nothing and does not fetch when permission is missing", () => {
    usePermissionsMock.mockReturnValue({
      canAny: () => false,
    });
    renderSection(<FeeLifecycleSection filterState={filterState} />);
    expect(screen.queryByText(/fee lifecycle/i)).toBeNull();
    expect(makePostRequest).not.toHaveBeenCalled();
  });

  it("shows the empty state for an all-zero payload", async () => {
    usePermissionsMock.mockReturnValue({
      canAny: (codes: string[]) => codes.includes("payment.view_all"),
    });
    vi.mocked(makePostRequest).mockResolvedValue({
      data: {
        data: {
          nodes: [],
          links: [],
          unattributed: { amount: "0.00", payment_count: 0 },
          meta: {
            period_label: "Mar 2026",
            date_from: "2026-03-01",
            date_to: "2026-03-31",
            cash_received: "0.00",
            refund_clamped: false,
          },
        },
      },
    });
    renderSection(<FeeLifecycleSection filterState={filterState} />);
    expect(await screen.findByText(/no billed fees for this period/i)).toBeTruthy();
  });

  it("keeps method breakdown nodes sourced from retained", async () => {
    usePermissionsMock.mockReturnValue({
      canAny: () => true,
    });
    vi.mocked(makePostRequest).mockImplementation(async (_url, body) => {
      const breakdown = (body as { breakdown: string }).breakdown;
      const methodNodes =
        breakdown === "payment_method"
          ? [{ key: "method:1", label: "KBZ", amount: "80.00", is_estimated: false }]
          : [];
      const methodLinks =
        breakdown === "payment_method"
          ? [{
              source: "retained",
              target: "method:1",
              amount: "80.00",
              payment_count: 1,
              student_count: 1,
              is_estimated: false,
            }]
          : [];
      return {
        data: {
          data: {
            nodes: [
              { key: "collected", label: "Collected", amount: "100.00", is_estimated: false },
              { key: "retained", label: "Retained", amount: "80.00", is_estimated: false },
              ...methodNodes,
            ],
            links: [
              {
                source: "collected",
                target: "retained",
                amount: "80.00",
                payment_count: 1,
                student_count: 1,
                is_estimated: false,
              },
              ...methodLinks,
            ],
            unattributed: { amount: "0.00", payment_count: 0 },
            meta: {
              period_label: "Mar 2026",
              date_from: "2026-03-01",
              date_to: "2026-03-31",
              cash_received: "100.00",
              refund_clamped: false,
            },
          },
        },
      };
    });
    renderSection(<FeeLifecycleSection filterState={filterState} />);
    await screen.findByText(/fee lifecycle/i);
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByText("Payment method"));
    expect(makePostRequest).toHaveBeenCalledWith(
      "finance/fee-lifecycle",
      expect.objectContaining({ breakdown: "payment_method" }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-fe
pnpm test:unit src/components/finances/finance-homepage-stat-cards.test.tsx src/components/finances/fee-lifecycle-section.test.tsx
```

Expected: FAIL — Collected still present; `FeeLifecycleSection` missing.

- [ ] **Step 3: Minimal implementation**

**Stat cards:** change the first card title from `"Collected"` to `"Cash received"`. Change the grid class from `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4` to `grid-cols-2 lg:grid-cols-4`.

**Section:**

```tsx
export function FeeLifecycleSection({
  filterState,
}: {
  filterState: Omit<FeeLifecycleFilterState, "breakdown">;
}) {
  const { canAny } = usePermissions();
  const allowed = canAny(["payment.view_all", "analytics.view"]);
  const [breakdown, setBreakdown] = useState<FeeLifecycleBreakdown>("none");
  const currencySymbol = useTenantCurrencySymbol();
  const query = useFeeLifecycle(
    { ...filterState, breakdown },
    { enabled: allowed },
  );
  if (!allowed) return null;
  // title: "Fee lifecycle — fees billed for this period"
  // subtitle: query.data?.meta.period_label, plus a one-line basis:
  //   "Amounts follow billing coverage, not cash-received dates."
  // Select items: None / Payment method / Bank
  // Unattributed: if payment_count > 0, render a warning row under the chart
  //   with amount + count. Not part of the SVG.
  // Tooltip includes cash_received vs collected when hovering Collected,
  //   and refund_clamped note when hovering Refunded.
}
```

**Homepage content:** after the stat-card `FinanceHomepageRefreshingShell` (currently just before the `lg:grid-cols-2` chart grid), insert:

```tsx
      <FinanceHomepageRefreshingShell
        isRefreshing={lifecycleRefreshing}
        className="rounded-lg border bg-card p-4"
      >
        <FeeLifecycleSection
          filterState={{
            programId,
            intakeId,
            period,
            dateFrom,
            dateTo,
          }}
        />
      </FinanceHomepageRefreshingShell>
```

The section owns its own query, so `lifecycleRefreshing` is not needed from the parent — drop `isRefreshing` wrapping if it would spin the sankey on homepage refetches. Use a plain `<div className="rounded-lg border bg-card p-4">` instead, so the Sankey's loading state is independent.

Pass the same filter values the homepage already holds (`programId`, `intakeId`, `period`, `dateFrom`, `dateTo`). Do not pass `pieGroupBy`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-fe
pnpm test:unit src/components/finances/finance-homepage-stat-cards.test.tsx src/components/finances/fee-lifecycle-section.test.tsx src/components/charts/sankey-diagram.test.tsx src/hooks/finances/use-fee-lifecycle.test.ts
```

Expected: PASS.

Also re-run BE:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_fee_lifecycle
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/finances/fee-lifecycle-section.tsx \
        src/components/finances/fee-lifecycle-section.test.tsx \
        src/components/finances/finance-homepage-stat-cards.tsx \
        src/components/finances/finance-homepage-stat-cards.test.tsx \
        src/components/finances/finance-homepage-content.tsx
git commit -m "feat(finance): fee-lifecycle Sankey on the finances overview"
```

---

## Self-review

### Spec coverage

| Spec requirement | Task |
| --- | --- |
| Coverage-scoped period (`month_visibility_q` union) | 1 |
| Status exhaustiveness / billed+net balance / invoiced_amount widths / cash_received variance | 1 |
| Refunds (`refund` only, skip `re_transfer`, skip non-verified, per-payment clamp, `refund_clamped`) | 2 |
| Unattributed band (null `issued_at` + no coverage, period-independent) | 2 |
| Not-yet-billed estimate (`per_period` × months, `whole_term` once, skip disabled, late-joiner anchor) | 3 |
| Payload node/link graph, omit zeros, empty program | 4 |
| Breakdown fans from **Retained** | 4 |
| Course scope program/intake only (no `scope_courses_for_user`) | 4 (via `resolve_lifecycle_course_ids`) |
| `POST finance/fee-lifecycle`, 403 teacher/student, 400 validation, HR `analytics.view` allowed | 5 |
| FE types + hook + enabled gate | 6 |
| Generic `d3-sankey` SVG, hatch, distinct fills, empty state, no Recharts | 7 |
| Section permission gate, independent fetch, breakdown toggle | 8 |
| Insert between stat cards and charts | 8 |
| Relabel Collected → Cash received; `grid-cols-2 lg:grid-cols-4` | 8 |
| Semantic colors (not `--chart-1..5`) | 8 |
| Click-through | Out of scope (no task) — correct |
| Homepage `verified_at` aggregations unchanged | No task touches `homepage_services.py` — correct |

### Placeholder scan

No TBD / TODO / "implement later" / "similar to Task N". PaymentBank member for the breakdown test is `PaymentBank.KBZ` (`app_finance/models.py:27`).

### Type consistency

- Node keys locked in the header; BE payload, FE color map, and tests share them.
- `breakdown`: `"none" | "payment_method" | "bank"` on both sides.
- Amounts are decimal strings (`_money_str` / `UsdDecimalString` convention).
- `useFeeLifecycle(state, { enabled })` is what the section calls.
- `FeeLifecycleFilterState.breakdown` lives in the section as local state, not homepage `nuqs`.

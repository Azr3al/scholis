# Coverage-Driven Payment Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Price a payment from the months it covers and the plan's `billing_type`, so whole-term plans stop having their discounts divided by period count and multi-month transactions stop storing a single month's figures.

**Architecture:** `discount_engine` gains `course_months` and `resolve_term_fee`, and `compute_invoiced_amount` prices a span of course-relative period indices instead of one index. Per-period plans sum month by month (preserving `FIRST_PERIOD` scope and decrementing fixed credit as they go); whole-term plans apply discounts once at full value against the term fee, then apportion by `covered ÷ course months`. Payment create/update resolve coverage before pricing, admins can override the final figure, and an audit/backfill pair reprices historical rows.

**Tech Stack:** Django 4 + `django-tenant-schemas`, `djmoney` `Money`, DRF serializers, Django management commands, React + `@react-pdf/renderer` on the frontend, Vitest for FE tests.

**Spec:** `schedjuice-reimagined-be/docs/superpowers/specs/2026-07-26-coverage-driven-payment-pricing-design.md`

## Global Constraints

- Always run backend tests via `./scripts/run_backend_tests.sh <label>` from `schedjuice-reimagined-be`. The script exports the Docker test DB URL and appends `--keepdb --noinput` itself. Never run `manage.py test` directly, and never point tests at the Railway/dev `DATABASE_URL`.
- Never inspect, query, or mutate the dev database during this work.
- Money maths uses `djmoney.money.Money` and `_money_round` (`Decimal("0.01")`, `ROUND_HALF_UP`). Never use floats.
- `invoiced_amount` stays the authoritative effective value on `UserPayment`. Do not repurpose it.
- The backfill may only rewrite `base_amount`, `discount_amount`, `invoiced_amount`, `computed_invoiced_amount`. It must never touch `parsed_amount` or `actual_amount`.
- Any recompute path skips payments where `is_amount_overridden` is `True`.
- The course term total is stable: it must read identically on a student's first and last receipt, so it never derives from a payment's `discount_amount` or from `remaining_credit`.
- Across any split of an enrollment's transactions, the invoiced amounts sum to the course term total.
- Tests follow `.cursor/rules/high-value-tests.mdc`: assert behaviour (status **and** error shape / state change / invariant), at most one thin success path per behaviour unit.
- New migrations must be created after `0073_merge_20260722_1154`. Check `ls app_finance/migrations/` before naming; if another leaf appeared, generate a merge rather than renumbering.
- `schedjuice-reimagined-be` and `schedjuice-reimagined-fe` are **separate git repositories**, both on branch `dev`. The workspace root above them is not a repository. Tasks 1-12 and 14 commit in the backend repo; Task 13 commits in the frontend repo.
- Both repos carry unrelated uncommitted work from an in-flight "student payments out-of-range month" feature, which also touches `app_finance/views.py`. Stage only the files each task lists — never `git add .` or `git add -A`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `app_finance/discount_engine.py` (modify) | Course calendar, term fee, coverage-driven pricing, credit consumption |
| `app_finance/payment_discount_apply.py` (modify) | Resolve coverage → price → return payment field kwargs |
| `app_finance/models.py` (modify) | Three override fields on `UserPayment` |
| `app_finance/migrations/0074_userpayment_amount_override.py` (create) | Schema for the override fields |
| `app_finance/serializers.py` (modify) | Coverage-before-pricing ordering, override capture, reprice on edit, receipt read fields |
| `app_finance/payment_context.py` (create) | Per-`(user, course)` ordinal, term total, paid-to-date attached in bulk |
| `app_finance/views.py` (modify) | Admin report uses `resolve_term_fee`; attaches payment context |
| `app_tasks/management/commands/generate_invoices.py` (modify) | One invoice per whole-term enrollment |
| `app_finance/payment_repricing_audit.py` (create) | Read-only diff of stored vs recomputed amounts |
| `app_finance/payment_repricing_backfill.py` (create) | Apply the recompute |
| `app_finance/management/commands/audit_payment_repricing.py` (create) | Audit CLI, CSV out |
| `app_finance/management/commands/backfill_payment_repricing.py` (create) | Backfill CLI with `--dry-run` |
| `app_finance/migrations/0075_backfill_payment_repricing.py` (create) | Runs the backfill |
| `app_finance/tests/test_discount_engine_billing_type.py` (create) | Term fee, whole-term, per-period span pricing |
| `app_finance/tests/test_payment_repricing.py` (create) | Audit + backfill safety and idempotency |
| `.cursor/rules/finance-pricing-invariants.mdc` (create) | Invariants auto-loaded for `app_finance/` work |
| `schedjuice-reimagined-fe/src/helpers/payment-receipt.ts` (modify) | Ordinal, month count, term progress, adjusted marker |
| `schedjuice-reimagined-fe/src/components/finances/payment-receipt-pdf.tsx` (modify) | Render the new rows |

---

# Phase 1 — Engine core

### Task 1: Course calendar and term fee helpers

**Files:**
- Modify: `app_finance/discount_engine.py:50-64` (replace `estimate_billing_period_count`)
- Modify: `app_finance/views.py:659-666`
- Test: `app_finance/tests/test_discount_engine_billing_type.py`

**Interfaces:**
- Produces: `course_months(course: Course) -> list[tuple[int, int]]`; `estimate_billing_period_count(*, course: Course, org: Organization | None = None) -> int`; `resolve_term_fee(*, plan: PaymentPlan, course: Course) -> Money`

- [ ] **Step 1: Write the failing test**

Create `app_finance/tests/test_discount_engine_billing_type.py`. Copy the `setUp` scaffolding from `app_finance/tests/test_discount_engine.py:41-93` verbatim (schema context, org lookup, plan, category, program, course, student, enrollment) so this module stands alone, then add:

```python
    def test_resolve_term_fee_whole_term_ignores_month_count(self):
        with schema_context(self.schema_name):
            self.plan.billing_type = PaymentPlan.BillingType.WHOLE_TERM
            self.plan.price = Money(410000, "USD")
            self.plan.save(update_fields=["billing_type", "price", "updated_at"])
            fee = resolve_term_fee(plan=self.plan, course=self.course)
        self.assertEqual(fee, Money(410000, "USD"))

    def test_resolve_term_fee_per_period_multiplies_by_course_months(self):
        with schema_context(self.schema_name):
            self.plan.billing_type = PaymentPlan.BillingType.PER_PERIOD
            self.plan.price = Money(100, "USD")
            self.plan.save(update_fields=["billing_type", "price", "updated_at"])
            fee = resolve_term_fee(plan=self.plan, course=self.course)
        # setUp course runs 2026-01-01 .. 2026-06-30 => 6 calendar months.
        self.assertEqual(fee, Money(600, "USD"))

    def test_course_without_dates_counts_as_one_period(self):
        with schema_context(self.schema_name):
            self.course.start_date = None
            self.course.end_date = None
            self.course.save(update_fields=["start_date", "end_date"])
            self.assertEqual(course_months(self.course), [])
            self.assertEqual(estimate_billing_period_count(course=self.course), 1)
```

Import at the top of the new module:

```python
from app_finance.discount_engine import (
    course_months,
    estimate_billing_period_count,
    resolve_term_fee,
)
from app_finance.models import Discount, EnrollmentDiscount, PaymentPlan
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine_billing_type`
Expected: FAIL with `ImportError: cannot import name 'course_months'`.

- [ ] **Step 3: Write the implementation**

In `app_finance/discount_engine.py`, add the import near the existing model imports:

```python
from app_finance.payment_coverage import calendar_months_for_course
```

Replace the whole body of `estimate_billing_period_count` (currently lines 51-64) with:

```python
def course_months(course: Course) -> list[tuple[int, int]]:
    """
    Inclusive (year, month) tuples spanned by the course, chronologically.

    Returns [] when the course has no start_date — callers must treat that as
    "unknown calendar" and fall back to a single period.
    """
    return calendar_months_for_course(course)


def estimate_billing_period_count(*, course: Course, org: Organization | None = None) -> int:
    """Number of billing periods in the course. Always >= 1."""
    del org  # reserved for interval-based strategies
    return max(len(course_months(course)), 1)


def resolve_term_fee(*, plan: PaymentPlan, course: Course) -> Money:
    """
    Total fee for the whole course term.

    whole_term: `plan.price` already covers the term, so it is returned as-is.
    per_period: `plan.price` is one period, so it is multiplied by the course's
    calendar month count.

    Example: a 410,000 whole_term plan on a 5-month course returns 410,000.
    A 100,000 per_period plan on the same course returns 500,000.
    """
    if plan.billing_type == PaymentPlan.BillingType.WHOLE_TERM:
        return plan.price
    return plan.price * estimate_billing_period_count(course=course)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine_billing_type`
Expected: PASS (3 tests).

- [ ] **Step 5: Point the admin report at the shared helper**

In `app_finance/views.py`, replace lines 659-666:

```python
            price = Decimal(str(plan.price.amount))
            if plan.billing_type == models.PaymentPlan.BillingType.WHOLE_TERM:
                term_fee = price
            else:
                period_count = (
                    estimate_billing_period_count(course=course) if course else 1
                )
                term_fee = price * Decimal(str(period_count))
```

with:

```python
            term_fee = Decimal(
                str(resolve_term_fee(plan=plan, course=course).amount)
            )
```

Update that module's import of `estimate_billing_period_count` to import `resolve_term_fee` instead if `estimate_billing_period_count` has no other use in the file; otherwise import both.

- [ ] **Step 6: Run the admin report regression suite**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_admin_report_remaining_amount app_finance.tests.test_discount_engine`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add app_finance/discount_engine.py app_finance/views.py app_finance/tests/test_discount_engine_billing_type.py
git commit -m "feat(finance): add course_months and resolve_term_fee helpers"
```

---

### Task 2: Price a span of periods for per-period plans

**Files:**
- Modify: `app_finance/discount_engine.py:91-117` (`_line_discount_for_ed`), `:147-183` (`compute_invoiced_amount`)
- Test: `app_finance/tests/test_discount_engine_billing_type.py`

**Interfaces:**
- Consumes: `course_months`, `estimate_billing_period_count` from Task 1
- Produces: `compute_invoiced_amount(*, user_course, payment_plan, org, user_active_course_count, covered_months: list[tuple[int, int]] | None = None, billing_period_index: int | None = None) -> InvoicedAmountResult`; `resolve_period_indices(*, course, covered_months, billing_period_index) -> list[int]`; `_line_discount_for_ed(ed, base, billing_period_index, remaining)` now takes an explicit `remaining`

- [ ] **Step 1: Write the failing test**

Append to `app_finance/tests/test_discount_engine_billing_type.py`:

```python
    def _fixed_whole_enrollment(self, amount: str):
        """Active fixed whole-enrollment discount on the setUp enrollment."""
        with schema_context(self.schema_name):
            discount = Discount.objects.create(
                name=f"fixed-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.FIXED_AMOUNT,
                fixed_amount=Money(Decimal(amount), "USD"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            return apply_enrollment_discount(
                user_course=self.enrollment,
                discount=discount,
                applied_by=self.admin,
                org=self.org,
            )

    def test_per_period_span_sums_each_covered_month(self):
        with schema_context(self.schema_name):
            self.plan.billing_type = PaymentPlan.BillingType.PER_PERIOD
            self.plan.price = Money(100000, "USD")
            self.plan.save(update_fields=["billing_type", "price", "updated_at"])
            self._fixed_whole_enrollment("180000")  # 6 months => 30,000/month
            result = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                covered_months=[(2026, 1), (2026, 2), (2026, 3)],
                org=self.org,
                user_active_course_count=1,
            )
        self.assertEqual(result.base_amount, Money(300000, "USD"))
        self.assertEqual(result.discount_amount, Money(90000, "USD"))
        self.assertEqual(result.invoiced_amount, Money(210000, "USD"))

    def test_per_period_span_does_not_exceed_fixed_credit(self):
        """A 3-month span must not draw 3x the share when only 1 share remains."""
        with schema_context(self.schema_name):
            self.plan.billing_type = PaymentPlan.BillingType.PER_PERIOD
            self.plan.price = Money(100000, "USD")
            self.plan.save(update_fields=["billing_type", "price", "updated_at"])
            ed = self._fixed_whole_enrollment("180000")
            ed.remaining_credit = Money(30000, "USD")
            ed.save(update_fields=["remaining_credit", "updated_at"])
            result = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                covered_months=[(2026, 1), (2026, 2), (2026, 3)],
                org=self.org,
                user_active_course_count=1,
            )
        self.assertEqual(result.discount_amount, Money(30000, "USD"))
        self.assertEqual(result.invoiced_amount, Money(270000, "USD"))

    def test_first_period_scope_applies_only_at_course_index_zero(self):
        with schema_context(self.schema_name):
            self.plan.billing_type = PaymentPlan.BillingType.PER_PERIOD
            self.plan.price = Money(100000, "USD")
            self.plan.save(update_fields=["billing_type", "price", "updated_at"])
            discount = Discount.objects.create(
                name=f"fp-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("10"),
                scope=Discount.Scope.FIRST_PERIOD,
            )
            apply_enrollment_discount(
                user_course=self.enrollment,
                discount=discount,
                applied_by=self.admin,
                org=self.org,
            )
            with_first = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                covered_months=[(2026, 1), (2026, 2)],
                org=self.org,
                user_active_course_count=1,
            )
            without_first = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                covered_months=[(2026, 2), (2026, 3)],
                org=self.org,
                user_active_course_count=1,
            )
        self.assertEqual(with_first.discount_amount, Money(10000, "USD"))
        self.assertEqual(without_first.discount_amount, Money(0, "USD"))

    def test_covered_month_outside_course_is_rejected(self):
        with schema_context(self.schema_name):
            with self.assertRaises(ValueError) as ctx:
                compute_invoiced_amount(
                    user_course=self.enrollment,
                    payment_plan=self.plan,
                    covered_months=[(2030, 11)],
                    org=self.org,
                    user_active_course_count=1,
                )
        self.assertEqual(str(ctx.exception), "covered_month_outside_course")
```

Extend the module imports:

```python
from decimal import Decimal
from uuid import uuid4

from djmoney.money import Money
from tenant_schemas.utils import schema_context

from app_finance.discount_engine import (
    apply_enrollment_discount,
    compute_invoiced_amount,
    course_months,
    estimate_billing_period_count,
    resolve_term_fee,
)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine_billing_type`
Expected: FAIL with `TypeError: compute_invoiced_amount() got an unexpected keyword argument 'covered_months'`.

- [ ] **Step 3: Give `_line_discount_for_ed` an explicit remaining credit**

Replace `_line_discount_for_ed` (lines 91-117) with:

```python
def _line_discount_for_ed(
    ed: EnrollmentDiscount,
    base: Money,
    billing_period_index: int,
    remaining: Money | None,
) -> Money:
    """
    One period's reduction for one enrollment discount, vs `base`.

    `remaining` is the credit still available at this point in the span. It is
    passed in rather than read off `ed` so a multi-month span can decrement it
    between months without touching the database. None means "no ceiling" —
    it is NOT zero.
    """
    zero = Money(0, base.currency)
    if ed.snapshot_discount_type == Discount.DiscountType.PERCENT:
        applies = (
            ed.snapshot_scope == Discount.Scope.WHOLE_ENROLLMENT
            or billing_period_index == 0
        )
        if not applies:
            return zero
        pct = ed.snapshot_percent_value or Decimal("0")
        return _money_round(base * (pct / Decimal("100")))

    if ed.snapshot_discount_type == Discount.DiscountType.FIXED_AMOUNT:
        if ed.snapshot_scope == Discount.Scope.FIRST_PERIOD:
            if billing_period_index != 0:
                return zero
            fixed = ed.snapshot_fixed_amount or zero
            return _money_round(min(fixed, base))
        share = ed.per_period_share or zero
        cap = remaining if remaining is not None else base
        return _money_round(min(share, cap, base))

    return zero
```

- [ ] **Step 4: Add period-index resolution**

Insert above `compute_invoiced_amount`:

```python
def resolve_period_indices(
    *,
    course: Course,
    covered_months: list[tuple[int, int]] | None,
    billing_period_index: int | None,
) -> list[int]:
    """
    Course-relative period indices this payment bills.

    Explicit coverage wins. A bare billing_period_index (cron, legacy callers)
    means a single period. Courses without dates have no calendar, so they
    collapse to one period.

    Raises ValueError("covered_month_outside_course") when a covered month is
    not part of the course calendar — guessing an index would silently mis-price.
    """
    months = course_months(course)
    if not months:
        return [billing_period_index if billing_period_index is not None else 0]
    if covered_months:
        index_by_month = {m: i for i, m in enumerate(months)}
        indices = []
        for month in sorted(covered_months):
            if month not in index_by_month:
                raise ValueError("covered_month_outside_course")
            indices.append(index_by_month[month])
        return indices
    if billing_period_index is not None:
        return [billing_period_index]
    return [0]
```

- [ ] **Step 5: Rewrite `compute_invoiced_amount` for per-period spans**

Replace `compute_invoiced_amount` (lines 147-183) with:

```python
def compute_invoiced_amount(
    *,
    user_course: UserCourse,
    payment_plan: PaymentPlan,
    org: Organization | None,
    user_active_course_count: int,
    covered_months: list[tuple[int, int]] | None = None,
    billing_period_index: int | None = None,
) -> InvoicedAmountResult:
    """
    Price the span of months this payment covers.

    Pass `covered_months` for real payments. `billing_period_index` remains for
    single-period callers (the invoice cron and preview) and means "one period
    at this course-relative index".

    Invariant: base_amount - discount_amount == invoiced_amount, and
    sum(lines) == discount_amount, for both billing types.
    """
    del org
    course = user_course.course
    indices = resolve_period_indices(
        course=course,
        covered_months=covered_months,
        billing_period_index=billing_period_index,
    )
    base = resolve_base_price(
        user_course=user_course,
        payment_plan=payment_plan,
        user_active_course_count=user_active_course_count,
    )
    eds = get_active_enrollment_discounts(user_course)
    if not eds:
        span_base = _money_round(base * len(indices))
        return InvoicedAmountResult(span_base, Money(0, base.currency), span_base, ())

    currency = base.currency
    base_total = Money(0, currency)
    totals: dict[int | None, Money] = {ed.id: Money(0, currency) for ed in eds}
    labels: dict[int | None, str] = {ed.id: _ed_label(ed) for ed in eds}
    remaining: dict[int | None, Money | None] = {
        ed.id: ed.remaining_credit for ed in eds
    }

    for index in indices:
        raw_lines = [
            DiscountLineResult(
                enrollment_discount_id=ed.id,
                label=labels[ed.id],
                amount=_line_discount_for_ed(ed, base, index, remaining[ed.id]),
            )
            for ed in eds
        ]
        for line in _scale_lines_to_base(raw_lines, base):
            key = line.enrollment_discount_id
            totals[key] += line.amount
            if remaining[key] is not None:
                remaining[key] -= line.amount
        base_total += base

    lines = tuple(
        DiscountLineResult(ed.id, labels[ed.id], totals[ed.id])
        for ed in eds
        if totals[ed.id].amount > 0
    )
    discount_amt = _money_round(sum((ln.amount for ln in lines), Money(0, currency)))
    base_total = _money_round(base_total)
    invoiced = _money_round(base_total - discount_amt)
    if invoiced.amount < 0:
        invoiced = Money(0, currency)
        discount_amt = base_total
    return InvoicedAmountResult(base_total, discount_amt, invoiced, lines)
```

- [ ] **Step 6: Fix the remaining `_line_discount_for_ed` caller**

`preview_invoiced_amounts` calls `compute_invoiced_amount` with `billing_period_index=index`, which still works. No change needed there yet — Task 9 handles its whole-term behaviour.

- [ ] **Step 7: Run the tests**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine_billing_type app_finance.tests.test_discount_engine`
Expected: PASS. The existing `test_discount_engine` suite passes unchanged because single-index calls still resolve to one period.

- [ ] **Step 8: Commit**

```bash
git add app_finance/discount_engine.py app_finance/tests/test_discount_engine_billing_type.py
git commit -m "feat(finance): price a span of covered months for per-period plans"
```

---

### Task 3: Whole-term pricing branch

**Files:**
- Modify: `app_finance/discount_engine.py` (add `_compute_whole_term`; branch inside `compute_invoiced_amount`)
- Test: `app_finance/tests/test_discount_engine_billing_type.py`

**Interfaces:**
- Consumes: `resolve_term_fee`, `resolve_period_indices`, `_scale_lines_to_base`, `_money_round`
- Produces: whole-term behaviour inside the existing `compute_invoiced_amount` signature — no new public function

**Known gap closed by Task 4:** whole-term pricing reads `remaining_credit`, which today is
only populated for fixed whole-enrollment discounts. Until Task 4 sets it for every discount
type, a whole-term **percent** discount prices as zero. That is expected at this task
boundary; do not work around it here.

- [ ] **Step 1: Write the failing test**

Append to `app_finance/tests/test_discount_engine_billing_type.py`. The first test is the regression anchor for the production bug:

```python
    def _whole_term_acca_setup(self):
        """Receipt #172: 410,000 whole-term fee, Early Bird 180k + Loyalty 40k."""
        self.plan.billing_type = PaymentPlan.BillingType.WHOLE_TERM
        self.plan.price = Money(410000, "USD")
        self.plan.save(update_fields=["billing_type", "price", "updated_at"])
        # 5 calendar months: 2026-01 .. 2026-05
        self.course.start_date = date(2026, 1, 1)
        self.course.end_date = date(2026, 5, 31)
        self.course.save(update_fields=["start_date", "end_date"])
        for name, amount in (("eb", "180000"), ("loyalty", "40000")):
            discount = Discount.objects.create(
                name=f"{name}-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.FIXED_AMOUNT,
                fixed_amount=Money(Decimal(amount), "USD"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            apply_enrollment_discount(
                user_course=self.enrollment,
                discount=discount,
                applied_by=self.admin,
                org=self.org,
            )

    def test_whole_term_discounts_are_not_divided_by_period(self):
        """
        Regression: receipt #172 invoiced 366,000 because a 180,000 Early Bird
        was applied as 180,000/5 against the full 410,000 term fee. Whole-term
        discounts apply once, at full value.

        Spec: docs/superpowers/specs/2026-07-26-coverage-driven-payment-pricing-design.md
        """
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            result = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                covered_months=[(2026, m) for m in range(1, 6)],
                org=self.org,
                user_active_course_count=1,
            )
        self.assertEqual(result.base_amount, Money(410000, "USD"))
        self.assertEqual(result.discount_amount, Money(220000, "USD"))
        self.assertEqual(result.invoiced_amount, Money(190000, "USD"))

    def test_whole_term_partial_coverage_prorates_base_but_not_discount(self):
        """Base follows month count; the discount lands in full on transaction 1."""
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            result = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                covered_months=[(2026, 1), (2026, 2), (2026, 3)],
                org=self.org,
                user_active_course_count=1,
            )
        self.assertEqual(result.base_amount, Money(246000, "USD"))
        self.assertEqual(result.discount_amount, Money(220000, "USD"))
        self.assertEqual(result.invoiced_amount, Money(26000, "USD"))

    def test_whole_term_lines_sum_to_discount_amount(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            result = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                covered_months=[(2026, 1), (2026, 2), (2026, 3)],
                org=self.org,
                user_active_course_count=1,
            )
            line_sum = sum((ln.amount for ln in result.lines), Money(0, "USD"))
        self.assertEqual(line_sum, result.discount_amount)

    def test_whole_term_discount_is_clamped_to_an_undersized_first_payment(self):
        """1 month of base (82,000) cannot absorb 220,000 of discount."""
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            result = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                covered_months=[(2026, 1)],
                org=self.org,
                user_active_course_count=1,
            )
        self.assertEqual(result.base_amount, Money(82000, "USD"))
        self.assertEqual(result.discount_amount, Money(82000, "USD"))
        self.assertEqual(result.invoiced_amount, Money(0, "USD"))
```

Add `from datetime import date` to the module imports.

The split-across-transactions behaviour depends on credit consumption, which Task 4
implements; its test lives there.

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine_billing_type`
Expected: FAIL — `test_whole_term_discounts_are_not_divided_by_period` reports base 2,050,000 (per-period path multiplying the term fee by 5 months).

- [ ] **Step 3: (no separate helpers needed)**

Earlier drafts of this design added `_whole_term_lines` and `_apportion_lines`. Neither is
required: `remaining_credit` already holds each discount's full value from apply time
(Task 4), and the existing `_scale_lines_to_base` already provides clamp-and-carry when a
transaction's base cannot absorb the whole discount. Do not add an apportionment helper.

Skip to Step 4.

- [ ] **Step 4: Branch inside `compute_invoiced_amount`**

Immediately after the `indices = resolve_period_indices(...)` block added in Task 2, insert the whole-term short-circuit:

```python
    if payment_plan.billing_type == PaymentPlan.BillingType.WHOLE_TERM:
        return _compute_whole_term(
            user_course=user_course,
            payment_plan=payment_plan,
            covered_count=len(indices),
        )
```

and add the function above `compute_invoiced_amount`:

```python
def _compute_whole_term(
    *,
    user_course: UserCourse,
    payment_plan: PaymentPlan,
    covered_count: int,
) -> InvoicedAmountResult:
    """
    Whole-term pricing.

    Only the BASE is apportioned by month count. The discount is NOT: it lands
    in full on the first transaction, drawn from remaining_credit, and later
    transactions find that credit spent.

    When the first transaction is too small to absorb the whole discount,
    _scale_lines_to_base clamps the lines to base_amount (invoiced 0) and
    consumption leaves the remainder on remaining_credit for the next one.
    Across any split of transactions the invoiced amounts sum to the term total.
    """
    course = user_course.course
    term_base = resolve_term_fee(plan=payment_plan, course=course)
    currency = term_base.currency
    total_months = len(course_months(course))
    eds = get_active_enrollment_discounts(user_course)

    if total_months:
        ratio = min(Decimal(covered_count) / Decimal(total_months), Decimal("1"))
    else:
        ratio = Decimal("1")

    base_amount = _money_round(Money(term_base.amount * ratio, currency))
    if not eds:
        return InvoicedAmountResult(base_amount, Money(0, currency), base_amount, ())

    zero = Money(0, currency)
    raw_lines = [
        DiscountLineResult(
            enrollment_discount_id=ed.id,
            label=_ed_label(ed),
            # remaining_credit holds the full value on whole-term plans and
            # shrinks as transactions consume it. None means nothing left to give.
            amount=ed.remaining_credit if ed.remaining_credit is not None else zero,
        )
        for ed in eds
    ]
    lines = tuple(
        ln for ln in _scale_lines_to_base(raw_lines, base_amount) if ln.amount.amount > 0
    )
    discount_amt = _money_round(sum((ln.amount for ln in lines), zero))
    invoiced = _money_round(base_amount - discount_amt)
    if invoiced.amount < 0:
        invoiced = zero
        discount_amt = base_amount
    return InvoicedAmountResult(base_amount, discount_amt, invoiced, lines)
```

- [ ] **Step 5: Run the tests**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine_billing_type app_finance.tests.test_discount_engine`
Expected: PASS. `test_whole_term_discounts_are_not_divided_by_period` now returns 190,000.

- [ ] **Step 6: Commit**

```bash
git add app_finance/discount_engine.py app_finance/tests/test_discount_engine_billing_type.py
git commit -m "fix(finance): apply whole-term discounts at full value, not per period"
```

---

### Task 4: Credit setup and consumption for whole-term plans

**Files:**
- Modify: `app_finance/discount_engine.py:220-247` (`apply_enrollment_discount`), `:327-346` (`consume_discount_state_after_invoice`)
- Test: `app_finance/tests/test_discount_engine_billing_type.py`

**Interfaces:**
- Produces: `consume_discount_state_after_invoice(*, enrollment_discount, discount_amount, period_indices: list[int] | None = None, billing_period_index: int | None = None) -> None`

- [ ] **Step 1: Write the failing test**

```python
    def test_whole_term_apply_leaves_per_period_share_null(self):
        with schema_context(self.schema_name):
            self.plan.billing_type = PaymentPlan.BillingType.WHOLE_TERM
            self.plan.save(update_fields=["billing_type", "updated_at"])
            ed = self._fixed_whole_enrollment("180000")
        self.assertIsNone(ed.per_period_share)
        self.assertEqual(ed.remaining_credit, Money(180000, "USD"))

    def test_whole_term_percent_discount_gets_a_credit(self):
        """Without a credit a percent discount would re-apply every transaction."""
        with schema_context(self.schema_name):
            self.plan.billing_type = PaymentPlan.BillingType.WHOLE_TERM
            self.plan.price = Money(400000, "USD")
            self.plan.save(update_fields=["billing_type", "price", "updated_at"])
            discount = Discount.objects.create(
                name=f"pct-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("10"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            ed = apply_enrollment_discount(
                user_course=self.enrollment,
                discount=discount,
                applied_by=self.admin,
                org=self.org,
            )
        self.assertEqual(ed.remaining_credit, Money(40000, "USD"))

    def test_whole_term_split_transactions_sum_to_term_total(self):
        """3 months then 2 months must total the same 190,000 as one payment."""
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()

            first = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                covered_months=[(2026, 1), (2026, 2), (2026, 3)],
                org=self.org,
                user_active_course_count=1,
            )
            for line in first.lines:
                consume_discount_state_after_invoice(
                    enrollment_discount=EnrollmentDiscount.objects.get(
                        id=line.enrollment_discount_id
                    ),
                    discount_amount=line.amount,
                    period_indices=[0, 1, 2],
                )

            second = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                covered_months=[(2026, 4), (2026, 5)],
                org=self.org,
                user_active_course_count=1,
            )

        self.assertEqual(first.invoiced_amount, Money(26000, "USD"))
        self.assertEqual(second.discount_amount, Money(0, "USD"))
        self.assertEqual(second.invoiced_amount, Money(164000, "USD"))
        self.assertEqual(
            first.invoiced_amount + second.invoiced_amount, Money(190000, "USD")
        )

    def test_per_period_apply_still_sets_share(self):
        with schema_context(self.schema_name):
            self.plan.billing_type = PaymentPlan.BillingType.PER_PERIOD
            self.plan.save(update_fields=["billing_type", "updated_at"])
            ed = self._fixed_whole_enrollment("180000")
        # setUp course spans 6 months.
        self.assertEqual(ed.per_period_share, Money(30000, "USD"))

    def test_consume_marks_first_period_when_span_includes_index_zero(self):
        with schema_context(self.schema_name):
            self.plan.billing_type = PaymentPlan.BillingType.PER_PERIOD
            self.plan.save(update_fields=["billing_type", "updated_at"])
            discount = Discount.objects.create(
                name=f"fp-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("10"),
                scope=Discount.Scope.FIRST_PERIOD,
            )
            ed = apply_enrollment_discount(
                user_course=self.enrollment,
                discount=discount,
                applied_by=self.admin,
                org=self.org,
            )
            consume_discount_state_after_invoice(
                enrollment_discount=ed,
                discount_amount=Money(10000, "USD"),
                period_indices=[2, 3],
            )
            ed.refresh_from_db()
            self.assertFalse(ed.first_period_consumed)

            consume_discount_state_after_invoice(
                enrollment_discount=ed,
                discount_amount=Money(10000, "USD"),
                period_indices=[0, 1],
            )
            ed.refresh_from_db()
        self.assertTrue(ed.first_period_consumed)
```

Add `consume_discount_state_after_invoice` to the `app_finance.discount_engine` imports
and `EnrollmentDiscount` to the `app_finance.models` imports. `_whole_term_acca_setup` is
already defined in this module by Task 3.

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine_billing_type`
Expected: FAIL — `test_whole_term_apply_leaves_per_period_share_null` finds `per_period_share` set to 36,000, and `consume_...` rejects `period_indices`.

- [ ] **Step 3: Skip the per-period division for whole-term plans**

In `apply_enrollment_discount`, replace lines 220-229:

```python
    remaining_credit = None
    per_period_share = None
    if (
        discount.discount_type == Discount.DiscountType.FIXED_AMOUNT
        and discount.scope == Discount.Scope.WHOLE_ENROLLMENT
        and discount.fixed_amount is not None
    ):
        periods = estimate_billing_period_count(course=user_course.course, org=org)
        remaining_credit = discount.fixed_amount
        per_period_share = _money_round(discount.fixed_amount / periods)
```

with:

```python
    remaining_credit = None
    per_period_share = None
    plan = user_course.course.payment_plan
    is_whole_term = (
        plan is not None and plan.billing_type == PaymentPlan.BillingType.WHOLE_TERM
    )

    if is_whole_term:
        # One charge, so every discount type gets a credit holding its full
        # value. The credit is what makes "applies once" work: the first
        # transaction draws it down and later ones find it spent. Without it a
        # percent discount would re-apply on every transaction.
        # per_period_share stays null — a "per period share" on a plan that has
        # no periods is the trap that caused the original mispricing.
        term_base = resolve_term_fee(plan=plan, course=user_course.course)
        if discount.discount_type == Discount.DiscountType.PERCENT:
            pct = discount.percent_value or Decimal("0")
            remaining_credit = _money_round(term_base * (pct / Decimal("100")))
        elif (
            discount.discount_type == Discount.DiscountType.FIXED_AMOUNT
            and discount.fixed_amount is not None
        ):
            remaining_credit = _money_round(min(discount.fixed_amount, term_base))
    elif (
        discount.discount_type == Discount.DiscountType.FIXED_AMOUNT
        and discount.scope == Discount.Scope.WHOLE_ENROLLMENT
        and discount.fixed_amount is not None
    ):
        periods = estimate_billing_period_count(course=user_course.course, org=org)
        remaining_credit = discount.fixed_amount
        per_period_share = _money_round(discount.fixed_amount / periods)
```

- [ ] **Step 4: Accept a span in `consume_discount_state_after_invoice`**

Replace its signature and the `FIRST_PERIOD` branch:

```python
def consume_discount_state_after_invoice(
    *,
    enrollment_discount: EnrollmentDiscount,
    discount_amount: Money,
    period_indices: list[int] | None = None,
    billing_period_index: int | None = None,
) -> None:
    """
    Advance one discount's credit state after invoicing a span.

    `period_indices` is the full set of course-relative periods just billed.
    `billing_period_index` is the single-period form kept for the cron.
    """
    indices = (
        period_indices
        if period_indices is not None
        else [billing_period_index if billing_period_index is not None else 0]
    )
    update_fields = ["updated_at"]

    # These two are independent, not mutually exclusive: a whole-term
    # first-period discount records both a credit draw and the consumed flag.
    if enrollment_discount.remaining_credit is not None:
        enrollment_discount.remaining_credit = _money_round(
            enrollment_discount.remaining_credit - discount_amount
        )
        update_fields.append("remaining_credit")

    if (
        enrollment_discount.snapshot_scope == Discount.Scope.FIRST_PERIOD
        and 0 in indices
        and not enrollment_discount.first_period_consumed
    ):
        enrollment_discount.first_period_consumed = True
        update_fields.append("first_period_consumed")

    enrollment_discount.save(update_fields=update_fields)
```

Note the widened credit branch: it no longer requires `snapshot_discount_type ==
FIXED_AMOUNT`, because whole-term percent discounts now carry a credit too. Per-period
percent discounts are unaffected — they never get one, so `remaining_credit` stays None.

- [ ] **Step 5: Update the existing single-index callers**

In `app_finance/tests/test_discount_engine.py` the call at line 429 passes `billing_period_index=0` — it still works via the compat parameter, so no edit is needed. In `app_tasks/management/commands/generate_invoices.py`, the existing call also uses `billing_period_index=`; Task 8 revisits it.

- [ ] **Step 6: Run the tests**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine_billing_type app_finance.tests.test_discount_engine`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app_finance/discount_engine.py app_finance/tests/test_discount_engine_billing_type.py
git commit -m "fix(finance): skip per-period share and consume spans for whole-term plans"
```

---

# Phase 2 — Wiring

### Task 5: Override fields on UserPayment

**Files:**
- Modify: `app_finance/models.py:277-287` (append after `installment_percent`)
- Create: `app_finance/migrations/0074_userpayment_amount_override.py`
- Test: `app_finance/tests/test_payment_repricing.py`

**Interfaces:**
- Produces: `UserPayment.computed_invoiced_amount` (MoneyField, null), `UserPayment.is_amount_overridden` (bool), `UserPayment.amount_override_reason` (char, null)

- [ ] **Step 1: Add the fields**

Append inside `class UserPayment`, after `installment_percent`:

```python
    computed_invoiced_amount = MoneyField(
        max_digits=19,
        decimal_places=4,
        null=True,
        blank=True,
        default_currency="USD",
        help_text=(
            "What the pricing engine calculated for this payment. Always written, "
            "including when an admin overrides invoiced_amount, so the override "
            "can be audited against the computed figure."
        ),
    )
    is_amount_overridden = models.BooleanField(
        default=False,
        help_text=(
            "True when an admin supplied invoiced_amount explicitly. Repricing "
            "and backfills must skip these payments."
        ),
    )
    amount_override_reason = models.CharField(
        max_length=2000,
        null=True,
        blank=True,
        help_text="Why the amount was overridden. Audit trail only.",
    )
```

- [ ] **Step 2: Generate the migration**

Run: `./env/bin/python manage.py makemigrations app_finance --name userpayment_amount_override`
Expected: creates `app_finance/migrations/0074_userpayment_amount_override.py` with three `AddField` operations.

If the command reports conflicting leaf nodes, run `./env/bin/python manage.py makemigrations app_finance --merge` first and keep both files.

- [ ] **Step 3: Write the failing test**

Create `app_finance/tests/test_payment_repricing.py` with the same `setUp` scaffolding used in `test_discount_engine_billing_type.py`, plus:

```python
    def test_override_fields_default_to_unset(self):
        with schema_context(self.schema_name):
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                invoiced_amount=Money(190000, "USD"),
            )
        self.assertFalse(payment.is_amount_overridden)
        self.assertIsNone(payment.computed_invoiced_amount)
        self.assertIsNone(payment.amount_override_reason)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_payment_repricing`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app_finance/models.py app_finance/migrations/0074_userpayment_amount_override.py app_finance/tests/test_payment_repricing.py
git commit -m "feat(finance): add amount override fields to UserPayment"
```

---

### Task 6: Price payments from their coverage

**Files:**
- Modify: `app_finance/payment_discount_apply.py:28-48` and `:67-132`
- Test: `app_finance/tests/test_payment_create_discount.py`

**Interfaces:**
- Consumes: `compute_invoiced_amount(..., covered_months=...)` from Tasks 2-3
- Produces: `apply_discount_and_amount_fields(*, user, course, request_user, org, discount_id=None, discount_ids=None, clear_discount=False, as_of=None, covered_months=None) -> dict` returning `invoiced_amount`, `base_amount`, `discount_amount`, `computed_invoiced_amount`, `_discount_lines`, `_period_indices`

- [ ] **Step 1: Write the failing test**

Append to `app_finance/tests/test_payment_create_discount.py`:

```python
    def test_amount_fields_follow_covered_months(self):
        """A 3-month transaction prices 3 months, not one."""
        from app_finance.payment_discount_apply import apply_discount_and_amount_fields

        with schema_context(self.schema_name):
            fields = apply_discount_and_amount_fields(
                user=self.student,
                course=self.course,
                request_user=self.admin,
                org=self.org,
                covered_months=[(2026, 1), (2026, 2), (2026, 3)],
            )
        single = self.plan.price
        self.assertEqual(fields["base_amount"], single * 3)
        self.assertEqual(fields["computed_invoiced_amount"], fields["invoiced_amount"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_payment_create_discount`
Expected: FAIL with `TypeError: apply_discount_and_amount_fields() got an unexpected keyword argument 'covered_months'`.

- [ ] **Step 3: Replace the period-index helper**

Delete `enrollment_billing_period_index` (lines 28-29) and rewrite `compute_payment_amount_breakdown`:

```python
def compute_payment_amount_breakdown(
    *,
    user_course: UserCourse,
    org: Organization | None,
    covered_months: list[tuple[int, int]] | None,
):
    """Price the enrollment for the months this payment covers."""
    plan = user_course.course.payment_plan
    if not plan:
        return None
    count = student_active_course_count(user_course.user_id)
    return compute_invoiced_amount(
        user_course=user_course,
        payment_plan=plan,
        covered_months=covered_months,
        org=org,
        user_active_course_count=count,
    )
```

- [ ] **Step 4: Thread coverage through `apply_discount_and_amount_fields`**

Add `covered_months: list[tuple[int, int]] | None = None` to the signature, and replace the tail (lines 115-131):

```python
    user_course = resolve_student_enrollment(user_id=user_id, course_id=course_id)
    result = compute_payment_amount_breakdown(
        user_course=user_course,
        org=org,
        covered_months=covered_months,
    )
    if result is None:
        return {}
    period_indices = resolve_period_indices(
        course=user_course.course,
        covered_months=covered_months,
        billing_period_index=None,
    )
    return {
        "invoiced_amount": result.invoiced_amount,
        "base_amount": result.base_amount,
        "discount_amount": result.discount_amount,
        "computed_invoiced_amount": result.invoiced_amount,
        "_discount_lines": result.lines,
        "_period_indices": period_indices,
    }
```

Update the import at the top of the module:

```python
from app_finance.discount_engine import (
    compute_invoiced_amount,
    remove_enrollment_discount,
    resolve_period_indices,
    set_enrollment_discounts,
)
```

Also update the docstring's first paragraph to read:

```
    Returns kwargs to set on UserPayment: invoiced_amount, base_amount,
    discount_amount, computed_invoiced_amount, plus internal `_discount_lines`
    and `_period_indices` for post-save snapshot and credit consumption.
```

- [ ] **Step 5: Run the tests**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_payment_create_discount`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app_finance/payment_discount_apply.py app_finance/tests/test_payment_create_discount.py
git commit -m "feat(finance): price payments from their covered months"
```

---

### Task 7: Serializer ordering, override capture, reprice on edit

**Files:**
- Modify: `app_finance/serializers.py:294-360`
- Test: `app_finance/tests/test_payment_create_discount.py`

**Interfaces:**
- Consumes: `apply_discount_and_amount_fields(..., covered_months=...)` from Task 6
- Produces: coverage resolved before pricing on create; `reprice` on coverage change in update; `is_amount_overridden` set when the payload carries `invoiced_amount`

- [ ] **Step 1: Write the failing test**

Follow the module's existing conventions exactly: `self._client(self.finance)`, the
`/api/v1/scan-transaction-screenshots` create route which returns **200** (not 201),
`resp.json()["data"]["id"]`, and the `@patch("app_finance.views.extract_receiver_ss_text_data.delay")`
decorator on any test that creates a payment.

```python
    def _create_payload(self, **overrides) -> dict:
        payload = {
            "user": self.student.id,
            "course": self.course.id,
            "issued_at": self.month_start.isoformat(),
            "screenshot": self._screenshot(),
            "payment_method": self.kpay.id,
            "parsed_amount": "450",
            "transaction_id": f"tx-{uuid4().hex[:12]}",
        }
        payload.update(overrides)
        return payload

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_explicit_invoiced_amount_marks_payment_overridden(self, _mock_ocr):
        resp = self._client(self.finance).post(
            "/api/v1/scan-transaction-screenshots",
            self._create_payload(invoiced_amount="123.45"),
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        with schema_context(self.schema_name):
            payment = UserPayment.objects.get(id=resp.json()["data"]["id"])
        self.assertTrue(payment.is_amount_overridden)
        self.assertEqual(payment.invoiced_amount.amount, Decimal("123.45"))
        self.assertIsNotNone(payment.computed_invoiced_amount)
        self.assertNotEqual(
            payment.computed_invoiced_amount.amount, Decimal("123.45")
        )

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_editing_covered_months_reprices_unless_overridden(self, _mock_ocr):
        create = self._client(self.finance).post(
            "/api/v1/scan-transaction-screenshots",
            self._create_payload(
                covered_months=json.dumps([{"year": 2026, "month_index": 1}])
            ),
            format="multipart",
        )
        self.assertEqual(create.status_code, 200, create.content)
        payment_id = create.json()["data"]["id"]
        with schema_context(self.schema_name):
            before = UserPayment.objects.get(id=payment_id).invoiced_amount.amount

        resp = self._client(self.finance).patch(
            f"/api/v1/user-payments/{payment_id}",
            {
                "covered_months": json.dumps(
                    [
                        {"year": 2026, "month_index": 1},
                        {"year": 2026, "month_index": 2},
                    ]
                )
            },
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        with schema_context(self.schema_name):
            payment = UserPayment.objects.get(id=payment_id)
        self.assertGreater(payment.invoiced_amount.amount, before)
```

Add `import json` to the module if it is not already imported. The two covered months
must fall inside the `setUp` course calendar; adjust the month indices if that course
does not span 2026-01 and 2026-02.

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_payment_create_discount`
Expected: FAIL — `is_amount_overridden` is False, and the PATCH leaves `invoiced_amount` unchanged.

- [ ] **Step 3: Add a coverage-resolution helper to the serializer**

Insert into `UserPaymentSerializer`, above `create`:

```python
    @staticmethod
    def _coverage_to_tuples(coverage: list[dict] | None) -> list[tuple[int, int]] | None:
        if not coverage:
            return None
        return [(int(m["year"]), int(m["month_index"])) for m in coverage]

    def _price_from_coverage(self, *, user, course, request_user, coverage,
                             discount_id, discount_ids, clear_discount,
                             has_discount_id, has_discount_ids) -> dict:
        """Coverage must be resolved before pricing — the amount depends on it."""
        from app_finance.payment_discount_apply import apply_discount_and_amount_fields
        from app_finance.views import _get_current_org

        try:
            return apply_discount_and_amount_fields(
                user=user,
                course=course,
                request_user=request_user,
                org=_get_current_org(),
                discount_id=discount_id if has_discount_id else None,
                discount_ids=discount_ids if has_discount_ids else None,
                clear_discount=clear_discount,
                covered_months=self._coverage_to_tuples(coverage),
            )
        except ValueError as exc:
            if str(exc) == "covered_month_outside_course":
                raise ValidationError(
                    {"covered_months": "Month falls outside the course schedule."}
                ) from exc
            raise ValidationError({"discount_ids": str(exc)}) from exc
```

- [ ] **Step 4: Rewrite `create` to resolve coverage first**

Replace the `with transaction.atomic():` block in `create` (lines 312-348) with:

```python
        with transaction.atomic():
            request = self.context.get("request")
            request_user = acting_user(request) if request else None
            user = validated_data.get("user")
            course = validated_data.get("course")
            discount_lines = ()
            period_indices = None

            # An explicit invoiced_amount in the payload is an admin override.
            overridden = "invoiced_amount" in validated_data
            override_value = validated_data.get("invoiced_amount")

            if coverage is not None:
                self._validate_month_entries(coverage)

            if user is not None and course is not None and request_user is not None:
                from app_finance.payment_discount_apply import (
                    persist_payment_discount_lines,
                )

                amount_fields = self._price_from_coverage(
                    user=user,
                    course=course,
                    request_user=request_user,
                    coverage=coverage,
                    discount_id=discount_id,
                    discount_ids=discount_ids,
                    clear_discount=clear_discount,
                    has_discount_id=has_discount_id,
                    has_discount_ids=has_discount_ids,
                )
                discount_lines = amount_fields.pop("_discount_lines", ())
                period_indices = amount_fields.pop("_period_indices", None)
                validated_data.update(amount_fields)

            if overridden:
                validated_data["invoiced_amount"] = override_value
                validated_data["is_amount_overridden"] = True

            instance = super().create(validated_data)
            if discount_lines:
                persist_payment_discount_lines(
                    user_payment=instance, lines=discount_lines
                )
            if coverage is not None:
                sync_user_payment_covered_months(instance, coverage)
            del period_indices  # consumed by the invoice cron, not payment create
            return instance
```

- [ ] **Step 5: Add repricing to `update`**

Replace `update` (lines 350-360):

```python
    def update(self, instance, validated_data):
        coverage = self._parse_coverage_from_request()
        installment_coverage = self._resolve_installment_coverage(instance, validated_data)
        if installment_coverage is not None:
            coverage = installment_coverage

        overridden = "invoiced_amount" in validated_data
        with transaction.atomic():
            if coverage is not None:
                self._validate_month_entries(coverage)
            if overridden:
                validated_data["is_amount_overridden"] = True

            instance = super().update(instance, validated_data)
            if coverage is not None:
                sync_user_payment_covered_months(instance, coverage)
                self._reprice_after_coverage_change(instance)
            return instance

    def _reprice_after_coverage_change(self, instance) -> None:
        """Coverage drives price, so an edited span must re-derive the amount."""
        from app_finance.payment_coverage import month_tuples_from_payment
        from app_finance.payment_discount_apply import compute_payment_amount_breakdown
        from app_finance.views import _get_current_org

        if instance.user_id is None or instance.course_id is None:
            return
        user_course = resolve_student_enrollment(
            user_id=instance.user_id, course_id=instance.course_id
        )
        if user_course is None or not user_course.course.payment_plan_id:
            return

        instance.refresh_from_db(fields=["id"])
        result = compute_payment_amount_breakdown(
            user_course=user_course,
            org=_get_current_org(),
            covered_months=month_tuples_from_payment(instance),
        )
        if result is None:
            return

        fields = ["computed_invoiced_amount", "updated_at"]
        instance.computed_invoiced_amount = result.invoiced_amount
        if not instance.is_amount_overridden:
            instance.base_amount = result.base_amount
            instance.discount_amount = result.discount_amount
            instance.invoiced_amount = result.invoiced_amount
            fields += ["base_amount", "discount_amount", "invoiced_amount"]
        instance.save(update_fields=fields)
```

Add to the module's imports:

```python
from app_finance.payment_discount_apply import resolve_student_enrollment
```

- [ ] **Step 6: Run the tests**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_payment_create_discount app_finance.tests.test_payment_group app_finance.tests.test_user_payment_verified_by`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app_finance/serializers.py app_finance/tests/test_payment_create_discount.py
git commit -m "feat(finance): resolve coverage before pricing and support amount override"
```

---

### Task 8: One invoice per whole-term enrollment

**Files:**
- Modify: `app_tasks/management/commands/generate_invoices.py:144-192`
- Test: `app_finance/tests/test_discount_engine_billing_type.py`

**Interfaces:**
- Consumes: `resolve_term_fee`, `course_months`, `compute_invoiced_amount` from Tasks 1-3

- [ ] **Step 1: Write the failing test**

```python
    def test_whole_term_enrollment_is_invoiced_once(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            UserPayment.objects.create(
                user=self.student,
                course=self.course,
                invoiced_amount=Money(190000, "USD"),
            )
            should_skip = whole_term_already_invoiced(
                user_id=self.student.id, course_id=self.course.id
            )
        self.assertTrue(should_skip)

    def test_whole_term_first_invoice_is_not_skipped(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            should_skip = whole_term_already_invoiced(
                user_id=self.student.id, course_id=self.course.id
            )
        self.assertFalse(should_skip)
```

Import `from app_finance.discount_engine import whole_term_already_invoiced` and `from app_finance.models import UserPayment`.

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine_billing_type`
Expected: FAIL with `ImportError: cannot import name 'whole_term_already_invoiced'`.

- [ ] **Step 3: Add the guard helper**

Append to `app_finance/discount_engine.py`:

```python
def whole_term_already_invoiced(*, user_id: int, course_id: int) -> bool:
    """
    True when a whole-term enrollment already has a payment.

    Whole-term plans bill once, so the invoice cron must not keep issuing the
    full term fee every interval.
    """
    from app_finance.models import UserPayment

    return UserPayment.objects.filter(user_id=user_id, course_id=course_id).exists()
```

- [ ] **Step 4: Wire the guard into the cron**

In `generate_invoices.py`, inside the `for course in courses:` loop, immediately after `payment_plan = user_course.course.payment_plan if user_course else None`, insert:

```python
                    is_whole_term = (
                        payment_plan is not None
                        and payment_plan.billing_type
                        == PaymentPlan.BillingType.WHOLE_TERM
                    )
                    if is_whole_term and whole_term_already_invoiced(
                        user_id=user_id, course_id=course["course_id"]
                    ):
                        continue
```

Change the `compute_invoiced_amount` call (lines 164-170) to price the full term for whole-term plans and a single period otherwise:

```python
                    if user_course and payment_plan:
                        if is_whole_term:
                            result = compute_invoiced_amount(
                                user_course=user_course,
                                payment_plan=payment_plan,
                                covered_months=course_months(user_course.course),
                                org=org,
                                user_active_course_count=active_course_count,
                            )
                        else:
                            result = compute_invoiced_amount(
                                user_course=user_course,
                                payment_plan=payment_plan,
                                billing_period_index=billing_period_index,
                                org=org,
                                user_active_course_count=active_course_count,
                            )
```

Extend the local import block at line 111:

```python
            from app_finance.discount_engine import (
                compute_invoiced_amount,
                consume_discount_state_after_invoice,
                course_months,
                whole_term_already_invoiced,
            )
            from app_finance.models import EnrollmentDiscount, PaymentPlan
```

- [ ] **Step 5: Run the tests**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine_billing_type`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app_finance/discount_engine.py app_tasks/management/commands/generate_invoices.py app_finance/tests/test_discount_engine_billing_type.py
git commit -m "fix(finance): invoice whole-term enrollments once instead of every interval"
```

---

### Task 9: Single preview row for whole-term plans

**Files:**
- Modify: `app_finance/discount_engine.py:349-422` (`preview_invoiced_amounts`)
- Test: `app_finance/tests/test_discount_engine_billing_type.py`

**Interfaces:**
- Consumes: `compute_invoiced_amount`, `course_months`

- [ ] **Step 1: Write the failing test**

```python
    def test_preview_returns_one_row_for_whole_term(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            rows = preview_invoiced_amounts(
                user_course=self.enrollment,
                payment_plan=self.plan,
                org=self.org,
                user_active_course_count=1,
                period_count=3,
            )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["invoiced_amount"], "190000.00")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine_billing_type`
Expected: FAIL — 3 rows returned.

- [ ] **Step 3: Short-circuit whole-term previews**

At the top of `preview_invoiced_amounts`, immediately after the signature, insert:

```python
    if payment_plan.billing_type == PaymentPlan.BillingType.WHOLE_TERM:
        # One charge means one preview row; period simulation does not apply.
        result = compute_invoiced_amount(
            user_course=user_course,
            payment_plan=payment_plan,
            covered_months=course_months(user_course.course),
            org=org,
            user_active_course_count=user_active_course_count,
        )
        return [
            {
                "index": 0,
                "base_amount": str(result.base_amount.amount),
                "discount_amount": str(result.discount_amount.amount),
                "invoiced_amount": str(result.invoiced_amount.amount),
                "currency": str(result.invoiced_amount.currency),
            }
        ]
```

- [ ] **Step 4: Run the tests**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine_billing_type app_finance.tests.test_discount_engine app_finance.tests.test_discount_api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app_finance/discount_engine.py app_finance/tests/test_discount_engine_billing_type.py
git commit -m "feat(finance): preview whole-term plans as a single row"
```

---

# Phase 3 — Backfill

### Task 10: Repricing audit

**Files:**
- Create: `app_finance/payment_repricing_audit.py`
- Create: `app_finance/management/commands/audit_payment_repricing.py`
- Test: `app_finance/tests/test_payment_repricing.py`

**Interfaces:**
- Produces: `PaymentRepricingRow` dataclass with fields `schema_name, payment_id, user_id, user_name, course_id, course_title, covered_month_count, stored_invoiced, computed_invoiced, delta, status, notes`; `audit_payment_repricing(schema_name: str) -> list[PaymentRepricingRow]`; `summarize_rows(rows) -> Counter`; `write_audit_csv(rows, handle) -> None`; status constants `STATUS_MATCH`, `STATUS_MISPRICED`, `STATUS_SKIPPED_OVERRIDDEN`, `STATUS_SKIPPED_OUT_OF_RANGE`, `STATUS_SKIPPED_NO_PLAN`

- [ ] **Step 1: Write the failing test**

`test_payment_repricing.py` is a different module from `test_discount_engine_billing_type.py`,
so it needs its own copy of the whole-term fixture. Add this helper to the class first:

```python
    def _whole_term_acca_setup(self):
        """Receipt #172: 410,000 whole-term fee, Early Bird 180k + Loyalty 40k."""
        self.plan.billing_type = PaymentPlan.BillingType.WHOLE_TERM
        self.plan.price = Money(410000, "USD")
        self.plan.save(update_fields=["billing_type", "price", "updated_at"])
        # 5 calendar months: 2026-01 .. 2026-05
        self.course.start_date = date(2026, 1, 1)
        self.course.end_date = date(2026, 5, 31)
        self.course.save(update_fields=["start_date", "end_date"])
        for name, amount in (("eb", "180000"), ("loyalty", "40000")):
            discount = Discount.objects.create(
                name=f"{name}-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.FIXED_AMOUNT,
                fixed_amount=Money(Decimal(amount), "USD"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            apply_enrollment_discount(
                user_course=self.enrollment,
                discount=discount,
                applied_by=self.admin,
                org=self.org,
            )
```

with these module imports:

```python
from datetime import date
from decimal import Decimal
from uuid import uuid4

from djmoney.money import Money
from tenant_schemas.utils import schema_context

from app_finance.discount_engine import apply_enrollment_discount
from app_finance.models import Discount, PaymentPlan, UserPayment
from app_finance.payment_coverage import sync_user_payment_covered_months
from app_finance.payment_repricing_audit import (
    STATUS_MISPRICED,
    STATUS_SKIPPED_OUT_OF_RANGE,
    STATUS_SKIPPED_OVERRIDDEN,
    audit_payment_repricing,
)
```

Then append the tests:

```python
    def test_audit_flags_mispriced_whole_term_payment(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                base_amount=Money(410000, "USD"),
                discount_amount=Money(44000, "USD"),
                invoiced_amount=Money(366000, "USD"),
            )
            sync_user_payment_covered_months(
                payment,
                [{"year": 2026, "month_index": m} for m in range(1, 6)],
            )
            rows = audit_payment_repricing(self.schema_name)
        row = next(r for r in rows if r.payment_id == payment.id)
        self.assertEqual(row.status, STATUS_MISPRICED)
        self.assertEqual(row.computed_invoiced, Decimal("190000.00"))
        self.assertEqual(row.delta, Decimal("-176000.00"))

    def test_audit_skips_overridden_payment(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                invoiced_amount=Money(1, "USD"),
                is_amount_overridden=True,
            )
            sync_user_payment_covered_months(
                payment, [{"year": 2026, "month_index": 1}]
            )
            rows = audit_payment_repricing(self.schema_name)
        row = next(r for r in rows if r.payment_id == payment.id)
        self.assertEqual(row.status, STATUS_SKIPPED_OVERRIDDEN)

    def test_audit_skips_coverage_outside_course(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                invoiced_amount=Money(100, "USD"),
            )
            sync_user_payment_covered_months(
                payment, [{"year": 2030, "month_index": 11}]
            )
            rows = audit_payment_repricing(self.schema_name)
        row = next(r for r in rows if r.payment_id == payment.id)
        self.assertEqual(row.status, STATUS_SKIPPED_OUT_OF_RANGE)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_payment_repricing`
Expected: FAIL with `ModuleNotFoundError: No module named 'app_finance.payment_repricing_audit'`.

- [ ] **Step 3: Write the audit module**

Create `app_finance/payment_repricing_audit.py`:

```python
"""
Read-only diff of stored vs recomputed UserPayment amounts.

Payments created before coverage-driven pricing stored a single billing
period's figures even when they covered several months, and whole-term plans
had their discounts divided by period count. This module reports the gap; it
never writes.

Spec: docs/superpowers/specs/2026-07-26-coverage-driven-payment-pricing-design.md
"""

from __future__ import annotations

import csv
from collections import Counter
from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable, TextIO

from app_finance.discount_engine import compute_invoiced_amount
from app_finance.discount_eligibility import student_active_course_count
from app_finance.models import UserPayment
from app_finance.payment_coverage import month_tuples_from_payment
from app_finance.payment_discount_apply import resolve_student_enrollment

STATUS_MATCH = "match"
STATUS_MISPRICED = "mispriced"
STATUS_SKIPPED_OVERRIDDEN = "skipped_overridden"
STATUS_SKIPPED_OUT_OF_RANGE = "skipped_out_of_range"
STATUS_SKIPPED_NO_PLAN = "skipped_no_plan"

CSV_COLUMNS = [
    "schema_name",
    "payment_id",
    "user_id",
    "user_name",
    "course_id",
    "course_title",
    "covered_month_count",
    "stored_invoiced",
    "computed_invoiced",
    "delta",
    "status",
    "notes",
]


@dataclass(frozen=True)
class PaymentRepricingRow:
    schema_name: str
    payment_id: int
    user_id: int | None
    user_name: str
    course_id: int | None
    course_title: str
    covered_month_count: int
    stored_invoiced: Decimal | None
    computed_invoiced: Decimal | None
    delta: Decimal | None
    status: str
    notes: str


def _amount(value) -> Decimal | None:
    return None if value is None else Decimal(str(value.amount))


def build_repricing_row(schema_name: str, payment: UserPayment) -> PaymentRepricingRow:
    stored = _amount(payment.invoiced_amount)
    months = month_tuples_from_payment(payment)
    base = dict(
        schema_name=schema_name,
        payment_id=payment.id,
        user_id=payment.user_id,
        user_name=getattr(payment.user, "name", "") or "",
        course_id=payment.course_id,
        course_title=getattr(payment.course, "title", "") or "",
        covered_month_count=len(months),
        stored_invoiced=stored,
        computed_invoiced=None,
        delta=None,
    )

    if payment.is_amount_overridden:
        return PaymentRepricingRow(
            **base,
            status=STATUS_SKIPPED_OVERRIDDEN,
            notes="Admin override; amount left untouched.",
        )

    if payment.user_id is None or payment.course_id is None:
        return PaymentRepricingRow(
            **base, status=STATUS_SKIPPED_NO_PLAN, notes="Payment has no user/course."
        )

    user_course = resolve_student_enrollment(
        user_id=payment.user_id, course_id=payment.course_id
    )
    if user_course is None or not user_course.course.payment_plan_id:
        return PaymentRepricingRow(
            **base, status=STATUS_SKIPPED_NO_PLAN, notes="No enrollment or payment plan."
        )

    try:
        result = compute_invoiced_amount(
            user_course=user_course,
            payment_plan=user_course.course.payment_plan,
            covered_months=months or None,
            org=None,
            user_active_course_count=student_active_course_count(payment.user_id),
        )
    except ValueError as exc:
        if str(exc) == "covered_month_outside_course":
            return PaymentRepricingRow(
                **base,
                status=STATUS_SKIPPED_OUT_OF_RANGE,
                notes="Covered month outside the course calendar; needs human review.",
            )
        raise

    computed = Decimal(str(result.invoiced_amount.amount))
    base["computed_invoiced"] = computed
    base["delta"] = None if stored is None else computed - stored
    status = STATUS_MATCH if stored == computed else STATUS_MISPRICED
    return PaymentRepricingRow(**base, status=status, notes="")


def audit_payment_repricing(schema_name: str) -> list[PaymentRepricingRow]:
    """Every payment in the current schema, with its recomputed amount."""
    payments = UserPayment.objects.select_related(
        "user", "course", "course__payment_plan"
    ).prefetch_related("covered_months")
    return [build_repricing_row(schema_name, p) for p in payments]


def summarize_rows(rows: Iterable[PaymentRepricingRow]) -> Counter:
    return Counter(row.status for row in rows)


def write_audit_csv(rows: Iterable[PaymentRepricingRow], handle: TextIO) -> None:
    writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS)
    writer.writeheader()
    for row in rows:
        writer.writerow({column: getattr(row, column) for column in CSV_COLUMNS})
```

- [ ] **Step 4: Write the management command**

Create `app_finance/management/commands/audit_payment_repricing.py`:

```python
"""
Report payments whose stored amounts differ from coverage-driven pricing.

Read-only.

Usage:
  python manage.py audit_payment_repricing
  python manage.py audit_payment_repricing --schema-name xschedjuice
  python manage.py audit_payment_repricing --csv /tmp/repricing.csv
"""

from __future__ import annotations

from pathlib import Path

from django.core.management import BaseCommand
from django.core.management.base import CommandError
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_finance.payment_repricing_audit import (
    STATUS_MISPRICED,
    audit_payment_repricing,
    summarize_rows,
    write_audit_csv,
)
from app_organization.models import Organization


class Command(BaseCommand):
    help = "Audit UserPayment amounts against coverage-driven pricing (read-only)."

    def add_arguments(self, parser):
        parser.add_argument("--schema-name", type=str, default=None)
        parser.add_argument("--csv", type=str, default=None, metavar="PATH")

    def handle(self, *args, **options):
        schema_name_arg = options.get("schema_name")
        csv_path = options.get("csv")

        with schema_context(get_public_schema_name()):
            org_qs = Organization.objects.all()
            if schema_name_arg:
                org_qs = org_qs.filter(schema_name=schema_name_arg)
            schema_names = [o.schema_name for o in org_qs if o.schema_name]

        if schema_name_arg and not schema_names:
            raise CommandError(f"No organization for schema_name={schema_name_arg!r}.")

        all_rows = []
        for schema_name in schema_names:
            with schema_context(schema_name):
                rows = audit_payment_repricing(schema_name)
            counts = summarize_rows(rows)
            all_rows.extend(rows)
            self.stdout.write(
                self.style.NOTICE(
                    f"\nSchema: {schema_name}  payments: {len(rows)}  "
                    f"mispriced: {counts.get(STATUS_MISPRICED, 0)}  "
                    f"match: {counts.get('match', 0)}  "
                    f"skipped_overridden: {counts.get('skipped_overridden', 0)}  "
                    f"skipped_out_of_range: {counts.get('skipped_out_of_range', 0)}"
                )
            )

        if csv_path:
            path = Path(csv_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("w", newline="", encoding="utf-8") as handle:
                write_audit_csv(all_rows, handle)
            self.stdout.write(self.style.SUCCESS(f"\nWrote {len(all_rows)} row(s) to {path}"))
```

- [ ] **Step 5: Run the tests**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_payment_repricing`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app_finance/payment_repricing_audit.py app_finance/management/commands/audit_payment_repricing.py app_finance/tests/test_payment_repricing.py
git commit -m "feat(finance): add payment repricing audit"
```

---

### Task 11: Repricing backfill

**Files:**
- Create: `app_finance/payment_repricing_backfill.py`
- Create: `app_finance/management/commands/backfill_payment_repricing.py`
- Create: `app_finance/migrations/0075_backfill_payment_repricing.py`
- Test: `app_finance/tests/test_payment_repricing.py`

**Interfaces:**
- Consumes: `audit_payment_repricing`, `PaymentRepricingRow`, `STATUS_MISPRICED` from Task 10
- Produces: `backfill_payment_repricing(schema_name: str, *, dry_run: bool = False) -> list[PaymentRepricingRow]` returning only the rows it changed (or would change)

- [ ] **Step 1: Write the failing test**

```python
    def test_backfill_rewrites_mispriced_amounts_only(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                base_amount=Money(410000, "USD"),
                discount_amount=Money(44000, "USD"),
                invoiced_amount=Money(366000, "USD"),
                parsed_amount=Money(190000, "USD"),
                actual_amount=Money(190000, "USD"),
            )
            sync_user_payment_covered_months(
                payment,
                [{"year": 2026, "month_index": m} for m in range(1, 6)],
            )
            changed = backfill_payment_repricing(self.schema_name)
            payment.refresh_from_db()

        self.assertEqual(len(changed), 1)
        self.assertEqual(payment.invoiced_amount, Money(190000, "USD"))
        self.assertEqual(payment.discount_amount, Money(220000, "USD"))
        self.assertEqual(payment.computed_invoiced_amount, Money(190000, "USD"))
        # Money actually received is never a computed value.
        self.assertEqual(payment.parsed_amount, Money(190000, "USD"))
        self.assertEqual(payment.actual_amount, Money(190000, "USD"))

    def test_backfill_is_idempotent(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                invoiced_amount=Money(366000, "USD"),
            )
            sync_user_payment_covered_months(
                payment,
                [{"year": 2026, "month_index": m} for m in range(1, 6)],
            )
            first = backfill_payment_repricing(self.schema_name)
            second = backfill_payment_repricing(self.schema_name)
        self.assertEqual(len(first), 1)
        self.assertEqual(len(second), 0)

    def test_backfill_dry_run_writes_nothing(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                invoiced_amount=Money(366000, "USD"),
            )
            sync_user_payment_covered_months(
                payment,
                [{"year": 2026, "month_index": m} for m in range(1, 6)],
            )
            planned = backfill_payment_repricing(self.schema_name, dry_run=True)
            payment.refresh_from_db()
        self.assertEqual(len(planned), 1)
        self.assertEqual(payment.invoiced_amount, Money(366000, "USD"))

    def test_backfill_skips_overridden_payment(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                invoiced_amount=Money(1, "USD"),
                is_amount_overridden=True,
            )
            sync_user_payment_covered_months(
                payment,
                [{"year": 2026, "month_index": m} for m in range(1, 6)],
            )
            backfill_payment_repricing(self.schema_name)
            payment.refresh_from_db()
        self.assertEqual(payment.invoiced_amount, Money(1, "USD"))

    def test_backfill_clears_stale_whole_term_per_period_share(self):
        """Legacy rows stored fixed_amount/months; whole-term must read null."""
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            ed = EnrollmentDiscount.objects.filter(
                user_course=self.enrollment, is_active=True
            ).first()
            ed.per_period_share = Money(36000, "USD")
            ed.save(update_fields=["per_period_share", "updated_at"])

            backfill_payment_repricing(self.schema_name)
            ed.refresh_from_db()
        self.assertIsNone(ed.per_period_share)
```

Add `EnrollmentDiscount` and `backfill_payment_repricing` to the module imports:

```python
from app_finance.models import Discount, EnrollmentDiscount, PaymentPlan, UserPayment
from app_finance.payment_repricing_backfill import backfill_payment_repricing
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_payment_repricing`
Expected: FAIL with `ModuleNotFoundError: No module named 'app_finance.payment_repricing_backfill'`.

- [ ] **Step 3: Write the backfill module**

Create `app_finance/payment_repricing_backfill.py`:

```python
"""
Rewrite stored UserPayment amounts to match coverage-driven pricing.

Safety rules, enforced here and asserted by tests:
  * Only base_amount, discount_amount, invoiced_amount and
    computed_invoiced_amount are written.
  * parsed_amount and actual_amount are NEVER touched — what a student actually
    transferred is evidence, not a derived figure.
  * Payments with is_amount_overridden are skipped.
  * Payments whose coverage falls outside the course calendar are skipped and
    reported, never guessed at.

Spec: docs/superpowers/specs/2026-07-26-coverage-driven-payment-pricing-design.md
"""

from __future__ import annotations

from django.db import transaction
from djmoney.money import Money

from app_finance.models import UserPayment
from app_finance.payment_repricing_audit import (
    STATUS_MISPRICED,
    PaymentRepricingRow,
    audit_payment_repricing,
)

WRITABLE_FIELDS = (
    "base_amount",
    "discount_amount",
    "invoiced_amount",
    "computed_invoiced_amount",
)


def null_stale_whole_term_shares() -> int:
    """
    Clear `per_period_share` on whole-term enrollment discounts.

    Rows created before this change stored fixed_amount/months there. The
    whole-term code path ignores the field, but leaving a wrong-looking value in
    the database invites someone to "fix" the reader instead of the writer.
    Returns the number of rows cleared.
    """
    from app_finance.models import EnrollmentDiscount, PaymentPlan

    stale = EnrollmentDiscount.objects.filter(
        per_period_share__isnull=False,
        user_course__course__payment_plan__billing_type=(
            PaymentPlan.BillingType.WHOLE_TERM
        ),
    )
    return stale.update(per_period_share=None)


def backfill_payment_repricing(
    schema_name: str,
    *,
    dry_run: bool = False,
) -> list[PaymentRepricingRow]:
    """Reprice mispriced payments in the current schema. Returns changed rows."""
    if not dry_run:
        # Clear stale shares first so repricing reads the corrected state.
        null_stale_whole_term_shares()
    rows = [r for r in audit_payment_repricing(schema_name) if r.status == STATUS_MISPRICED]
    if dry_run or not rows:
        return rows

    from app_finance.discount_engine import compute_invoiced_amount
    from app_finance.discount_eligibility import student_active_course_count
    from app_finance.payment_coverage import month_tuples_from_payment
    from app_finance.payment_discount_apply import resolve_student_enrollment

    with transaction.atomic():
        for row in rows:
            payment = UserPayment.objects.select_related(
                "course", "course__payment_plan"
            ).get(id=row.payment_id)
            user_course = resolve_student_enrollment(
                user_id=payment.user_id, course_id=payment.course_id
            )
            if user_course is None:
                continue
            result = compute_invoiced_amount(
                user_course=user_course,
                payment_plan=user_course.course.payment_plan,
                covered_months=month_tuples_from_payment(payment) or None,
                org=None,
                user_active_course_count=student_active_course_count(payment.user_id),
            )
            payment.base_amount = result.base_amount
            payment.discount_amount = result.discount_amount
            payment.invoiced_amount = result.invoiced_amount
            payment.computed_invoiced_amount = result.invoiced_amount
            payment.save(update_fields=[*WRITABLE_FIELDS, "updated_at"])
    return rows
```

- [ ] **Step 4: Write the management command**

Create `app_finance/management/commands/backfill_payment_repricing.py`:

```python
"""
Reprice historical payments under coverage-driven pricing.

Usage:
  python manage.py backfill_payment_repricing --dry-run
  python manage.py backfill_payment_repricing --schema-name xschedjuice
"""

from __future__ import annotations

from django.core.management import BaseCommand
from django.core.management.base import CommandError
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_finance.payment_repricing_backfill import backfill_payment_repricing
from app_organization.models import Organization


class Command(BaseCommand):
    help = "Reprice UserPayment amounts to match coverage-driven pricing."

    def add_arguments(self, parser):
        parser.add_argument("--schema-name", type=str, default=None)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        schema_name_arg = options.get("schema_name")
        dry_run = options["dry_run"]

        with schema_context(get_public_schema_name()):
            org_qs = Organization.objects.all()
            if schema_name_arg:
                org_qs = org_qs.filter(schema_name=schema_name_arg)
            schema_names = [o.schema_name for o in org_qs if o.schema_name]

        if schema_name_arg and not schema_names:
            raise CommandError(f"No organization for schema_name={schema_name_arg!r}.")

        grand_total = 0
        for schema_name in schema_names:
            with schema_context(schema_name):
                changed = backfill_payment_repricing(schema_name, dry_run=dry_run)
            grand_total += len(changed)
            verb = "would reprice" if dry_run else "repriced"
            self.stdout.write(
                self.style.NOTICE(f"Schema {schema_name}: {verb} {len(changed)} payment(s)")
            )

        self.stdout.write(self.style.SUCCESS(f"\nTotal: {grand_total}"))
```

- [ ] **Step 5: Write the data migration**

Create `app_finance/migrations/0075_backfill_payment_repricing.py`:

```python
"""Reprice historical payments so past receipts reprint with correct amounts."""

from django.db import migrations


def run_backfill(apps, schema_editor):
    # Import the live module (not the historical one): pricing needs real model
    # behaviour and the discount engine, which historical models cannot provide.
    from django.db import connection

    from app_finance.payment_repricing_backfill import backfill_payment_repricing

    schema_name = getattr(connection, "schema_name", "") or ""
    if not schema_name or schema_name == "public":
        return
    backfill_payment_repricing(schema_name)


def noop_reverse(apps, schema_editor):
    """Amounts cannot be un-repriced; the audit CSV is the record of what changed."""


class Migration(migrations.Migration):
    dependencies = [
        ("app_finance", "0074_userpayment_amount_override"),
    ]

    operations = [
        migrations.RunPython(run_backfill, noop_reverse),
    ]
```

- [ ] **Step 6: Run the tests**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_payment_repricing`
Expected: PASS — every test in the module, including the four audit tests from Task 10.

- [ ] **Step 7: Verify the migration applies cleanly**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine_billing_type`
Expected: PASS. Migration `0075` runs during test schema setup without error.

- [ ] **Step 8: Commit**

```bash
git add app_finance/payment_repricing_backfill.py app_finance/management/commands/backfill_payment_repricing.py app_finance/migrations/0075_backfill_payment_repricing.py app_finance/tests/test_payment_repricing.py
git commit -m "feat(finance): backfill historical payment amounts"
```

---

# Phase 4 — Receipts

### Task 12: Expose payment sequence and term progress

**Files:**
- Modify: `app_finance/discount_engine.py` (add `compute_course_term_total`)
- Create: `app_finance/payment_context.py`
- Modify: `app_finance/views.py:1016` (list) and the `user-payments/<int:obj_id>` retrieve response
- Test: `app_finance/tests/test_payment_repricing.py`

**Interfaces:**
- Consumes: `resolve_term_fee`, `course_months`, `_scale_lines_to_base` from Tasks 1-3
- Produces: `compute_course_term_total(*, user_course, payment_plan) -> Money`; `attach_course_payment_context(rows: list[dict]) -> None` adding `payment_sequence`, `term_total`, `paid_to_date` keys to serialized payment rows

**Why not serializer method fields:** all three are facts about the `(user, course)` pair,
not about the payment, so computing them per row costs three queries per row. The codebase
already solves this with post-serialization attach methods
(`_attach_installment_cumulative_metadata` at `views.py:537`). A `SerializerMethodField`
with an "attached value" fallback would not help — the attach runs *after* serialization,
so the expensive fallback would execute anyway and then be overwritten.

`is_amount_overridden` and `computed_invoiced_amount` are plain model fields; just add them
to the serializer's field list.

- [ ] **Step 1: Write the failing test**

```python
    def _two_payment_rows(self):
        """Two verified payments (26,000 then 164,000) as serialized row dicts."""
        first = UserPayment.objects.create(
            user=self.student, course=self.course,
            invoiced_amount=Money(26000, "USD"),
            actual_amount=Money(26000, "USD"),
            status=UserPayment.Status.VERIFIED,
            issued_at=timezone.now() - timedelta(days=10),
        )
        second = UserPayment.objects.create(
            user=self.student, course=self.course,
            invoiced_amount=Money(164000, "USD"),
            actual_amount=Money(164000, "USD"),
            status=UserPayment.Status.VERIFIED,
            issued_at=timezone.now(),
        )
        return [
            {
                "id": p.id,
                "user": {"id": self.student.id},
                "course": {"id": self.course.id},
            }
            for p in (first, second)
        ]

    def test_payment_sequence_counts_per_course(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            rows = self._two_payment_rows()
            attach_course_payment_context(rows)
        self.assertEqual(rows[0]["payment_sequence"], 1)
        self.assertEqual(rows[1]["payment_sequence"], 2)

    def test_term_total_is_identical_on_every_receipt(self):
        """
        The course total must not move between a student's first and last
        receipt. It is a property of the course, not of the transaction.
        """
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            rows = self._two_payment_rows()
            attach_course_payment_context(rows)
        self.assertEqual(rows[0]["term_total"], "190000.00")
        self.assertEqual(rows[1]["term_total"], "190000.00")
        self.assertEqual(rows[1]["paid_to_date"], "190000.00")

    def test_term_total_survives_credit_consumption(self):
        """Reads snapshot values, not remaining_credit, which shrinks."""
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            before = compute_course_term_total(
                user_course=self.enrollment, payment_plan=self.plan
            )
            EnrollmentDiscount.objects.filter(
                user_course=self.enrollment
            ).update(remaining_credit=Money(0, "USD"))
            after = compute_course_term_total(
                user_course=self.enrollment, payment_plan=self.plan
            )
        self.assertEqual(before, Money(190000, "USD"))
        self.assertEqual(after, Money(190000, "USD"))

    def test_context_attach_is_constant_query_count(self):
        """Guards the N+1 this design exists to avoid."""
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            rows = self._two_payment_rows()
            rows += self._two_payment_rows()
            with self.assertNumQueries(3):
                attach_course_payment_context(rows)
```

Add these imports to the module:

```python
from datetime import timedelta

from django.utils import timezone

from app_finance.discount_engine import compute_course_term_total
from app_finance.payment_context import attach_course_payment_context
```

If `assertNumQueries(3)` is off by a query or two once written, adjust the number to the
actual constant — the point of the test is that it does not scale with row count, so
verify by doubling the rows and confirming the count is unchanged.

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_payment_repricing`
Expected: FAIL with `KeyError: 'payment_sequence'`.

- [ ] **Step 3: Add `compute_course_term_total` to the engine**

Append to `app_finance/discount_engine.py`:

```python
def compute_course_term_total(
    *,
    user_course: UserCourse,
    payment_plan: PaymentPlan,
) -> Money:
    """
    What the student owes for the whole course, after discounts.

    STABLE. This is a property of the course, not of any transaction: it must
    read the same on a student's first receipt and their last. That is why it
    uses each discount's SNAPSHOT value and never remaining_credit — the credit
    shrinks as payments consume it, so reading it here would make the total
    drift downward between receipts.
    """
    course = user_course.course
    term_base = resolve_term_fee(plan=payment_plan, course=course)
    currency = term_base.currency
    eds = get_active_enrollment_discounts(user_course)
    if not eds:
        return term_base

    zero = Money(0, currency)
    months = max(len(course_months(course)), 1)
    one_period = _money_round(term_base / months)
    is_whole_term = payment_plan.billing_type == PaymentPlan.BillingType.WHOLE_TERM

    raw: list[DiscountLineResult] = []
    for ed in eds:
        first_period_only = (
            not is_whole_term and ed.snapshot_scope == Discount.Scope.FIRST_PERIOD
        )
        if ed.snapshot_discount_type == Discount.DiscountType.PERCENT:
            pct = ed.snapshot_percent_value or Decimal("0")
            against = one_period if first_period_only else term_base
            amount = _money_round(against * (pct / Decimal("100")))
        elif ed.snapshot_discount_type == Discount.DiscountType.FIXED_AMOUNT:
            fixed = ed.snapshot_fixed_amount or zero
            ceiling = one_period if first_period_only else term_base
            amount = _money_round(min(fixed, ceiling))
        else:
            amount = zero
        raw.append(DiscountLineResult(ed.id, _ed_label(ed), amount))

    lines = _scale_lines_to_base(raw, term_base)
    total_discount = _money_round(sum((ln.amount for ln in lines), zero))
    return _money_round(term_base - total_discount)
```

- [ ] **Step 4: Write the context attach module**

Do **not** use a `Window` annotation for the ordinal. The payment list runs through
`RBACSearchView`, which applies `.distinct()` and dynamic filtering; window functions
combined with `DISTINCT` behave badly in Postgres, and the ordinal would be computed over
the filtered page rather than the student's full history.

Create `app_finance/payment_context.py`:

```python
"""
Per-(user, course) context attached to serialized payment rows.

Payment ordinal, course term total, and paid-to-date are facts about the
enrollment, not about the individual payment, so they are computed once per
distinct (user, course) pair after serialization rather than per row. Adding
them as SerializerMethodFields would cost three queries per row.

Spec: docs/superpowers/specs/2026-07-26-coverage-driven-payment-pricing-design.md
"""

from __future__ import annotations

from decimal import Decimal

from django.db.models import Q

from app_finance.discount_engine import compute_course_term_total
from app_finance.models import UserPayment
from app_finance.payment_discount_apply import resolve_student_enrollment

CONTEXT_KEYS = ("payment_sequence", "term_total", "paid_to_date")


def _pair_of(row: dict) -> tuple[int, int] | None:
    user = row.get("user")
    course = row.get("course")
    user_id = user.get("id") if isinstance(user, dict) else user
    course_id = course.get("id") if isinstance(course, dict) else course
    if user_id is None or course_id is None:
        return None
    return (user_id, course_id)


def attach_course_payment_context(rows: list[dict]) -> None:
    """
    Add payment_sequence, term_total and paid_to_date to serialized rows.

    Query count is constant in the number of rows: one pass over the payments
    of the distinct pairs, plus one enrollment lookup per pair.
    """
    pairs = {p for p in (_pair_of(r) for r in rows) if p is not None}
    if not pairs:
        for row in rows:
            row["payment_sequence"] = 1
            row["term_total"] = None
            row["paid_to_date"] = "0"
        return

    pair_filter = Q()
    for user_id, course_id in pairs:
        pair_filter |= Q(user_id=user_id, course_id=course_id)

    # Ordinal is taken over the pair's FULL history, not the current page, so a
    # filtered list still reports "Payment #3".
    ordinals: dict[tuple[int, int], list[int]] = {}
    paid: dict[tuple[int, int], Decimal] = {}
    for payment in (
        UserPayment.objects.filter(pair_filter)
        .order_by("issued_at", "id")
        .values("id", "user_id", "course_id", "status", "actual_amount", "parsed_amount")
    ):
        key = (payment["user_id"], payment["course_id"])
        ordinals.setdefault(key, []).append(payment["id"])
        if payment["status"] == UserPayment.Status.VERIFIED:
            amount = payment["actual_amount"]
            if amount is None:
                amount = payment["parsed_amount"]
            if amount is not None:
                paid[key] = paid.get(key, Decimal("0")) + Decimal(str(amount))

    term_totals: dict[tuple[int, int], str | None] = {}
    for user_id, course_id in pairs:
        user_course = resolve_student_enrollment(user_id=user_id, course_id=course_id)
        plan = user_course.course.payment_plan if user_course else None
        if plan is None:
            term_totals[(user_id, course_id)] = None
            continue
        total = compute_course_term_total(user_course=user_course, payment_plan=plan)
        term_totals[(user_id, course_id)] = str(total.amount)

    for row in rows:
        key = _pair_of(row)
        ids = ordinals.get(key, [])
        row_id = row.get("id")
        row["payment_sequence"] = ids.index(row_id) + 1 if row_id in ids else 1
        row["term_total"] = term_totals.get(key)
        row["paid_to_date"] = str(paid.get(key, Decimal("0")))
```

- [ ] **Step 5: Wire it into the payment responses**

Add `computed_invoiced_amount` and `is_amount_overridden` to `UserPaymentSerializer`'s
field list — they are plain model fields and need no method.

Call the attach next to the existing attach at `app_finance/views.py:1016`:

```python
        self._attach_installment_cumulative_metadata(user_payments)
        attach_course_payment_context(user_payments)
```

Do the same on the `user-payments/<int:obj_id>` retrieve response, passing a single-element
list, so receipts downloaded from the detail view carry the same three keys.

Import at the top of `views.py`:

```python
from app_finance.payment_context import attach_course_payment_context
```

- [ ] **Step 6: Run the tests**

Run: `./scripts/run_backend_tests.sh app_finance.tests.test_payment_repricing app_finance.tests.test_payment_group`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app_finance/discount_engine.py app_finance/payment_context.py app_finance/serializers.py app_finance/views.py app_finance/tests/test_payment_repricing.py
git commit -m "feat(finance): expose payment sequence and stable course term total"
```

---

### Task 13: Receipt rendering

**Files:**
- Modify: `schedjuice-reimagined-fe/src/helpers/payment-receipt.ts:74-135` and `:274-307`
- Modify: `schedjuice-reimagined-fe/src/components/finances/payment-receipt-pdf.tsx:123-156`
- Test: `schedjuice-reimagined-fe/src/helpers/payment-receipt.test.ts`

**Interfaces:**
- Consumes: `payment_sequence`, `term_total`, `paid_to_date`, `is_amount_overridden`, `computed_invoiced_amount` from Task 12
- Produces: `PaymentReceiptPayload` gains `paymentSequence: number | null`, `monthsCoveredCount: number | null`, `termProgress: string | null`, `adjustedNote: string | null`

- [ ] **Step 1: Write the failing test**

Append to `payment-receipt.test.ts`:

```ts
  it("reports payment ordinal and covered month count", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 172,
        payment_sequence: 2,
        covered_months: [
          { year: 2026, month_index: 10 },
          { year: 2026, month_index: 11 },
        ],
        term_total: "190000",
        paid_to_date: "190000",
        actual_amount: "95000",
      },
      { name: "Acme", logo: null, timezone: "UTC" },
      "Ks ",
    );
    expect(payload.paymentSequence).toBe(2);
    expect(payload.monthsCoveredCount).toBe(2);
    expect(payload.termProgress).toMatch(/190,000/);
  });

  it("flags an overridden amount with the computed figure", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 9,
        is_amount_overridden: true,
        computed_invoiced_amount: "190000",
        invoiced_amount: "150000",
        actual_amount: "150000",
      },
      { name: "Acme", logo: null, timezone: "UTC" },
      "Ks ",
    );
    expect(payload.adjustedNote).toMatch(/190,000/);
  });

  it("omits the adjusted note when the amount was not overridden", () => {
    const payload = buildPaymentReceiptPayload(
      { id: 9, computed_invoiced_amount: "190000", actual_amount: "190000" },
      { name: "Acme", logo: null, timezone: "UTC" },
      "Ks ",
    );
    expect(payload.adjustedNote).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && npx vitest run src/helpers/payment-receipt.test.ts`
Expected: FAIL — `payload.paymentSequence` is `undefined`.

- [ ] **Step 3: Extend the input and payload types**

In `payment-receipt.ts`, add to `PaymentReceiptRowInput`:

```ts
  payment_sequence?: number | null;
  term_total?: string | number | null;
  paid_to_date?: string | number | null;
  is_amount_overridden?: boolean | null;
  computed_invoiced_amount?: string | number | null;
```

and to `PaymentReceiptPayload`:

```ts
  /** 1-based position of this payment among the student's payments for the course. */
  paymentSequence: number | null;
  monthsCoveredCount: number | null;
  termProgress: string | null;
  adjustedNote: string | null;
```

- [ ] **Step 4: Build the new fields**

Add above `buildSharedMeta`:

```ts
function buildProgressFields(
  row: PaymentReceiptRowInput,
  currencySymbol: string,
): Pick<
  PaymentReceiptPayload,
  "paymentSequence" | "monthsCoveredCount" | "termProgress" | "adjustedNote"
> {
  const monthsCoveredCount = row.covered_months?.length ?? null;

  let termProgress: string | null = null;
  if (hasAmountValue(row.term_total) && hasAmountValue(row.paid_to_date)) {
    termProgress =
      `Term total ${formatMoney(row.term_total!, currencySymbol)}` +
      ` · Paid to date ${formatMoney(row.paid_to_date!, currencySymbol)}`;
  }

  const adjustedNote =
    row.is_amount_overridden && hasAmountValue(row.computed_invoiced_amount)
      ? `Adjusted by staff (system calculated ${formatMoney(
          row.computed_invoiced_amount!,
          currencySymbol,
        )})`
      : null;

  return {
    paymentSequence: row.payment_sequence ?? null,
    monthsCoveredCount,
    termProgress,
    adjustedNote,
  };
}
```

Spread it into both builders, alongside `buildAmountFields`:

```ts
    ...buildAmountFields(row, currencySymbol),
    ...buildProgressFields(row, currencySymbol),
```

in `buildPaymentReceiptPayload`, and:

```ts
    ...buildAmountFields(synthetic, currencySymbol),
    ...buildProgressFields(synthetic, currencySymbol),
```

in `buildGroupPaymentReceiptPayload`.

- [ ] **Step 5: Render the rows**

In `payment-receipt-pdf.tsx`, replace the billing-period row (line 126) with:

```tsx
          {payload.paymentSequence ? (
            <DetailRow label="Payment" value={`#${payload.paymentSequence}`} />
          ) : null}
          <DetailRow
            label="Months covered"
            value={
              payload.monthsCoveredCount
                ? `${payload.billingPeriod} (${payload.monthsCoveredCount} ${
                    payload.monthsCoveredCount === 1 ? "month" : "months"
                  })`
                : payload.billingPeriod
            }
          />
```

and insert after the `Amount paid` row (line 146):

```tsx
          {payload.termProgress ? (
            <DetailRow label="Term progress" value={payload.termProgress} />
          ) : null}
          {payload.adjustedNote ? (
            <DetailRow label="Adjustment" value={payload.adjustedNote} />
          ) : null}
```

- [ ] **Step 6: Run the tests**

Run: `cd schedjuice-reimagined-fe && npx vitest run src/helpers/payment-receipt.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/helpers/payment-receipt.ts src/helpers/payment-receipt.test.ts src/components/finances/payment-receipt-pdf.tsx
git commit -m "feat(receipts): show payment ordinal, months covered, and term progress"
```

---

# Phase 5 — Guardrails

### Task 14: Invariant documentation and Cursor rule

**Files:**
- Modify: `app_finance/discount_engine.py:1` (module docstring)
- Create: `.cursor/rules/finance-pricing-invariants.mdc` (workspace root, alongside the existing rules)

**Interfaces:**
- Consumes: everything from Tasks 1-13; adds no runtime behaviour

- [ ] **Step 1: Add the module docstring**

Insert at the very top of `app_finance/discount_engine.py`, above `from __future__ import annotations`:

```python
"""
Enrollment discount pricing.

INVARIANTS — breaking any of these has shipped a billing bug before:

1. Coverage drives price. A payment is priced from the months it covers, not
   from a count of prior payments. `resolve_period_indices` turns coverage into
   course-relative indices; everything else consumes those.

2. Whole-term discounts are NEVER divided by period count. `plan.price` on a
   whole_term plan is the entire term fee, so a 180,000 fixed discount reduces
   it by 180,000 — not by 180,000/months. Dividing it is the bug that made
   receipt #172 invoice 366,000 instead of 190,000.

3. On whole_term plans only the BASE is apportioned by month count. The
   discount lands in full on the first transaction and is drawn from
   `remaining_credit`; later transactions find it spent. Do not add
   proportional apportionment of discounts — `_scale_lines_to_base` already
   clamps an oversized discount to the base and leaves the remainder on the
   credit for the next transaction.

4. Across any split of an enrollment's transactions, the invoiced amounts sum
   to the course term total. A 3+2 month split of a 410,000/220,000 term gives
   26,000 + 164,000 = 190,000.

5. `per_period_share` is meaningless for whole_term plans and is left null
   there. Read `remaining_credit` (set to the full value at apply time) instead.

6. `remaining_credit is None` means "no ceiling", not "no credit". On
   per-period plans, FIRST_PERIOD fixed discounts never get a credit row.

7. `compute_course_term_total` reads SNAPSHOT values, never `remaining_credit`.
   The credit shrinks as payments consume it, so using it there would make the
   course total drift downward between a student's first and last receipt.

8. base_amount - discount_amount == invoiced_amount, and sum(lines) ==
   discount_amount, for both billing types.

Spec: docs/superpowers/specs/2026-07-26-coverage-driven-payment-pricing-design.md
"""
```

- [ ] **Step 2: Write the Cursor rule**

Create `schedjuice-reimagined-be/.cursor/rules/finance-pricing-invariants.mdc`. That
directory is tracked in the backend repo and already holds ten rules, so the new rule is
committed with the code it governs. Do **not** put it at the workspace root — that
directory is not a git repository.

Because the rule now lives inside the backend repo, its globs are repo-relative:

```markdown
---
description: Invariants for payment pricing in app_finance
globs: app_finance/**,app_tasks/management/commands/generate_invoices.py
alwaysApply: false
---

# Finance pricing invariants

Payment pricing lives in `app_finance/discount_engine.py`. These rules encode bugs
that have already shipped once.

## Always

- Price from the payment's **covered months**, never from a count of prior payments.
- Branch on `PaymentPlan.billing_type`. `whole_term` means `plan.price` is the entire
  term fee; `per_period` means it is one month.
- On `whole_term`, apportion only the **base** by month count. The discount lands in full
  on the first transaction, bounded by `remaining_credit`.
- Keep `base_amount - discount_amount == invoiced_amount` and
  `sum(lines) == discount_amount` for both billing types.
- Keep the invoiced amounts of an enrollment's transactions summing to the course term
  total, however the payments are split.
- Treat `remaining_credit is None` as "no ceiling", never as zero.
- Use `Money` and `_money_round` (`Decimal("0.01")`, `ROUND_HALF_UP`). Never floats.

## Never

- Divide a whole-term discount by the course's month count. A 180,000 Early Bird on a
  410,000 whole-term fee reduces it by 180,000.
- Add proportional apportionment of whole-term discounts. `_scale_lines_to_base` already
  clamps an oversized discount to the transaction's base and carries the remainder.
- Read `per_period_share` on a `whole_term` plan — it is null there by design. Use
  `remaining_credit`.
- Compute the course term total from `remaining_credit` or from a payment's
  `discount_amount`. Both shrink or vary per transaction; the total must not.
- Reprice a payment with `is_amount_overridden=True`.
- Let a backfill write `parsed_amount` or `actual_amount`. What a student transferred
  is evidence, not a derived value.
- Add `payment_sequence`, `term_total` or `paid_to_date` as `SerializerMethodField`s.
  They are per-`(user, course)` facts; use `payment_context.attach_course_payment_context`.

## Tests

`app_finance/tests/test_discount_engine_billing_type.py::
DiscountEngineBillingTypeTests::test_whole_term_discounts_are_not_divided_by_period`
pins the production regression (410,000 term, 220,000 discounts, expect 190,000). If it
fails, a pricing invariant broke — do not adjust the expected number to match new output.

Run backend tests with `./scripts/run_backend_tests.sh <label>` (never `manage.py test`).

Spec: `schedjuice-reimagined-be/docs/superpowers/specs/2026-07-26-coverage-driven-payment-pricing-design.md`
```

- [ ] **Step 3: Run the full finance suite**

Run: `./scripts/run_backend_tests.sh app_finance app_tasks`
Expected: PASS with no regressions.

- [ ] **Step 4: Commit**

```bash
git add app_finance/discount_engine.py .cursor/rules/finance-pricing-invariants.mdc
git commit -m "docs(finance): document pricing invariants in the engine"
```

---

## Verification

After Task 14, confirm the whole change end to end:

- [ ] `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_finance app_tasks app_course` → PASS
- [ ] `cd schedjuice-reimagined-fe && npx vitest run src/helpers/payment-receipt.test.ts` → PASS
- [ ] `cd schedjuice-reimagined-be && ./env/bin/python manage.py makemigrations --check --dry-run` → "No changes detected"
- [ ] `./env/bin/python manage.py audit_payment_repricing --csv /tmp/repricing.csv` on a seeded local tenant reports 0 mispriced rows after the backfill migration has run

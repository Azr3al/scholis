from __future__ import annotations

"""
Enrollment discount pricing.

INVARIANTS — breaking any of these has shipped a billing bug before:

1. Coverage drives price. A payment is priced from the months it covers, not
   from a count of prior payments. `resolve_period_indices` turns coverage into
   course-relative indices; everything else consumes those.

2. Whole-term discounts are NEVER divided by period count. `plan.price` on a
   whole_term plan is the entire term fee, so a 180,000 fixed discount reduces
   it by 180,000 — not by 180,000/months.

3. On whole_term plans only the BASE is apportioned by month count. The
   discount lands in full on the first transaction and is drawn from
   `remaining_credit`; later transactions find it spent.

4. Across any split of an enrollment's transactions, the invoiced amounts sum
   to the course term total.

5. `per_period_share` is meaningless for whole_term plans and is left null.

6. `remaining_credit is None` means "no ceiling", not "no credit".

7. `compute_course_term_total` reads SNAPSHOT values, never `remaining_credit`.

8. base_amount - discount_amount == invoiced_amount, and sum(lines) ==
   discount_amount, for both billing types.

Spec: docs/superpowers/specs/2026-07-26-coverage-driven-payment-pricing-design.md
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone
from djmoney.money import Money

from app_course.models import Course, UserCourse
from app_finance.models import Discount, EnrollmentDiscount, PaymentPlan
from app_finance.payment_coverage import calendar_months_for_course
from app_organization.models import Organization


@dataclass(frozen=True)
class DiscountLineResult:
    enrollment_discount_id: int | None
    label: str
    amount: Money


@dataclass(frozen=True)
class InvoicedAmountResult:
    base_amount: Money
    discount_amount: Money
    invoiced_amount: Money
    lines: tuple[DiscountLineResult, ...] = ()


def get_active_enrollment_discounts(user_course: UserCourse) -> list[EnrollmentDiscount]:
    prefetched = getattr(user_course, "active_enrollment_discount_list", None)
    if prefetched is not None:
        return sorted(
            [ed for ed in prefetched if ed.is_active],
            key=lambda e: e.id if e.id is not None else 0,
        )
    return list(
        EnrollmentDiscount.objects.filter(user_course=user_course, is_active=True)
        .select_related("discount")
        .order_by("id")
    )


def get_active_enrollment_discount(user_course: UserCourse) -> EnrollmentDiscount | None:
    """Compat: first active by id. Prefer get_active_enrollment_discounts."""
    eds = get_active_enrollment_discounts(user_course)
    return eds[0] if eds else None


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


def resolve_base_price(
    *,
    user_course: UserCourse,
    payment_plan: PaymentPlan,
    user_active_course_count: int,
) -> Money:
    if get_active_enrollment_discounts(user_course):
        return payment_plan.price
    if user_active_course_count >= 2 and payment_plan.discount_price is not None:
        return payment_plan.discount_price
    return payment_plan.price


def _money_round(amount: Money) -> Money:
    quantized = amount.amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return Money(quantized, amount.currency)


def _ed_label(ed: EnrollmentDiscount) -> str:
    if ed.discount_id and getattr(ed, "discount", None) is not None and ed.discount.name:
        return ed.discount.name
    return "Discount"


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


def _scale_lines_to_base(
    raw_lines: list[DiscountLineResult],
    base: Money,
) -> tuple[DiscountLineResult, ...]:
    if not raw_lines:
        return ()
    raw_sum = sum((ln.amount for ln in raw_lines), Money(0, base.currency))
    if raw_sum.amount <= base.amount:
        return tuple(raw_lines)
    if raw_sum.amount <= 0:
        return tuple(
            DiscountLineResult(ln.enrollment_discount_id, ln.label, Money(0, base.currency))
            for ln in raw_lines
        )
    scale = base.amount / raw_sum.amount
    scaled: list[DiscountLineResult] = []
    running = Decimal("0")
    for i, ln in enumerate(raw_lines):
        if i == len(raw_lines) - 1:
            amt = _money_round(Money(base.amount - running, base.currency))
        else:
            amt = _money_round(Money(ln.amount.amount * scale, base.currency))
            running += amt.amount
        scaled.append(DiscountLineResult(ln.enrollment_discount_id, ln.label, amt))
    return tuple(scaled)


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


def resolve_period_indices_for_cleanup(
    *,
    course: Course,
    covered_months: list[tuple[int, int]] | None,
    billing_period_index: int | None,
) -> list[int]:
    """
    Like resolve_period_indices, but returns [] when coverage is outside the
    course calendar so delete cleanup can proceed on corrupt legacy rows.
    """
    try:
        return resolve_period_indices(
            course=course,
            covered_months=covered_months,
            billing_period_index=billing_period_index,
        )
    except ValueError as exc:
        if str(exc) == "covered_month_outside_course":
            return []
        raise


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
    if payment_plan.billing_type == PaymentPlan.BillingType.WHOLE_TERM:
        return _compute_whole_term(
            user_course=user_course,
            payment_plan=payment_plan,
            covered_count=len(indices),
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


@transaction.atomic
def apply_enrollment_discount(
    *,
    user_course: UserCourse,
    discount: Discount,
    applied_by,
    org: Organization,
    reason: str = "",
    as_of: date | None = None,
) -> EnrollmentDiscount:
    from app_finance.discount_eligibility import is_discount_eligible

    if user_course.assigned_as != UserCourse.AssignedAs.STUDENT:
        raise ValueError("Discounts apply to student enrollments only.")
    if not user_course.course.payment_plan_id:
        raise ValueError("Course has no payment plan.")
    if not discount.is_active:
        raise ValueError("Discount is inactive.")

    if getattr(org, "is_discount_eligibility_enabled", True):
        ok, reason_code = is_discount_eligible(
            discount=discount,
            user=user_course.user,
            course=user_course.course,
            user_course=user_course,
            as_of=as_of or date.today(),
        )
        if not ok:
            raise ValueError(reason_code or "Discount not eligible")

    if EnrollmentDiscount.objects.filter(
        user_course=user_course, discount=discount, is_active=True
    ).exists():
        raise ValueError("already_applied")

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

    return EnrollmentDiscount.objects.create(
        user_course=user_course,
        discount=discount,
        snapshot_discount_type=discount.discount_type,
        snapshot_scope=discount.scope,
        snapshot_percent_value=discount.percent_value,
        snapshot_fixed_amount=discount.fixed_amount,
        snapshot_eligibility_type=discount.eligibility_type
        or Discount.EligibilityType.NONE,
        snapshot_early_bird_days=discount.early_bird_days,
        snapshot_bulk_min_courses=discount.bulk_min_courses,
        remaining_credit=remaining_credit,
        per_period_share=per_period_share,
        applied_by=applied_by,
        reason=reason or "",
        is_active=True,
    )


def _deactivate_ed(ed: EnrollmentDiscount, removed_by) -> None:
    ed.is_active = False
    ed.removed_by = removed_by
    ed.removed_at = timezone.now()
    ed.save(update_fields=["is_active", "removed_by", "removed_at", "updated_at"])


def deactivate_enrollment_discount(
    *,
    user_course: UserCourse,
    removed_by,
) -> None:
    """Deactivate all active enrollment discounts (clear stack)."""
    for ed in get_active_enrollment_discounts(user_course):
        _deactivate_ed(ed, removed_by)


def remove_enrollment_discount(*, user_course: UserCourse, removed_by) -> None:
    deactivate_enrollment_discount(user_course=user_course, removed_by=removed_by)


def remove_enrollment_discount_by_id(
    *,
    user_course: UserCourse,
    enrollment_discount_id: int,
    removed_by,
) -> None:
    ed = EnrollmentDiscount.objects.filter(
        id=enrollment_discount_id, user_course=user_course, is_active=True
    ).first()
    if not ed:
        raise LookupError("enrollment_discount_not_found")
    _deactivate_ed(ed, removed_by)


@transaction.atomic
def set_enrollment_discounts(
    *,
    user_course: UserCourse,
    discount_ids: list[int],
    applied_by,
    org: Organization,
    as_of: date | None = None,
    reason: str = "",
) -> list[EnrollmentDiscount]:
    if len(discount_ids) != len(set(discount_ids)):
        raise ValueError("duplicate_discount_ids")

    wanted = set(discount_ids)
    for ed in get_active_enrollment_discounts(user_course):
        if ed.discount_id not in wanted:
            remove_enrollment_discount_by_id(
                user_course=user_course,
                enrollment_discount_id=ed.id,
                removed_by=applied_by,
            )

    current_ids = {
        ed.discount_id for ed in get_active_enrollment_discounts(user_course)
    }
    for did in discount_ids:
        if did in current_ids:
            continue
        discount = Discount.objects.filter(id=did, is_active=True).first()
        if discount is None:
            raise ValueError("Discount not found or inactive")
        apply_enrollment_discount(
            user_course=user_course,
            discount=discount,
            applied_by=applied_by,
            org=org,
            reason=reason,
            as_of=as_of,
        )
    return get_active_enrollment_discounts(user_course)


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


def _other_payment_covers_period_zero(
    *,
    enrollment_discount_id: int,
    excluding_payment_id: int,
    course,
) -> bool:
    from app_finance.models import UserPaymentDiscount
    from app_finance.payment_coverage import month_tuples_from_payment

    lines = (
        UserPaymentDiscount.objects.filter(enrollment_discount_id=enrollment_discount_id)
        .exclude(user_payment_id=excluding_payment_id)
        .select_related("user_payment")
        .prefetch_related("user_payment__covered_months")
    )
    for line in lines:
        up = line.user_payment
        if up.course_id != course.id:
            continue
        indices = resolve_period_indices_for_cleanup(
            course=course,
            covered_months=month_tuples_from_payment(up) or None,
            billing_period_index=None,
        )
        if 0 in indices:
            return True
    return False


def revert_discount_state_after_payment_delete(
    *,
    enrollment_discount: EnrollmentDiscount,
    discount_amount: Money,
    period_indices: list[int],
    excluding_payment_id: int,
    course,
) -> list[str]:
    """
    Undo consumption recorded for a payment that is being deleted.

    Mirrors consume_discount_state_after_invoice: restores remaining_credit and
    may clear first_period_consumed when no other payment bills period 0.
    """
    update_fields = ["updated_at"]

    if enrollment_discount.remaining_credit is not None:
        enrollment_discount.remaining_credit = _money_round(
            enrollment_discount.remaining_credit + discount_amount
        )
        update_fields.append("remaining_credit")

    if (
        enrollment_discount.snapshot_scope == Discount.Scope.FIRST_PERIOD
        and 0 in period_indices
        and enrollment_discount.first_period_consumed
        and not _other_payment_covers_period_zero(
            enrollment_discount_id=enrollment_discount.id,
            excluding_payment_id=excluding_payment_id,
            course=course,
        )
    ):
        enrollment_discount.first_period_consumed = False
        update_fields.append("first_period_consumed")

    return update_fields


def preview_invoiced_amounts(
    *,
    user_course: UserCourse,
    payment_plan: PaymentPlan,
    org: Organization | None,
    user_active_course_count: int,
    period_count: int = 3,
) -> list[dict]:
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

    rows = []
    eds = get_active_enrollment_discounts(user_course)
    states = [
        {
            "ed": ed,
            "remaining_credit": ed.remaining_credit,
            "first_period_consumed": ed.first_period_consumed,
            "per_period_share": ed.per_period_share,
        }
        for ed in eds
    ]

    for index in range(period_count):
        preview_eds: list[EnrollmentDiscount] = []
        for i, st in enumerate(states):
            ed = st["ed"]
            preview_ed = EnrollmentDiscount(
                id=ed.id if ed.id is not None else -(i + 1),
                user_course=user_course,
                discount=ed.discount if ed.discount_id else None,
                snapshot_discount_type=ed.snapshot_discount_type,
                snapshot_scope=ed.snapshot_scope,
                snapshot_percent_value=ed.snapshot_percent_value,
                snapshot_fixed_amount=ed.snapshot_fixed_amount,
                remaining_credit=st["remaining_credit"],
                per_period_share=st["per_period_share"],
                first_period_consumed=st["first_period_consumed"],
                is_active=True,
                applied_by=ed.applied_by,
            )
            preview_eds.append(preview_ed)
        user_course.active_enrollment_discount_list = preview_eds

        result = compute_invoiced_amount(
            user_course=user_course,
            payment_plan=payment_plan,
            billing_period_index=index,
            org=org,
            user_active_course_count=user_active_course_count,
        )
        rows.append(
            {
                "index": index,
                "base_amount": str(result.base_amount.amount),
                "discount_amount": str(result.discount_amount.amount),
                "invoiced_amount": str(result.invoiced_amount.amount),
                "currency": str(result.invoiced_amount.currency),
            }
        )

        line_by_id = {ln.enrollment_discount_id: ln.amount for ln in result.lines}
        for st in states:
            ed = st["ed"]
            line_amt = line_by_id.get(ed.id, Money(0, result.base_amount.currency))
            if ed.snapshot_scope == Discount.Scope.FIRST_PERIOD and index == 0:
                st["first_period_consumed"] = True
            elif (
                ed.snapshot_discount_type == Discount.DiscountType.FIXED_AMOUNT
                and ed.snapshot_scope == Discount.Scope.WHOLE_ENROLLMENT
                and st["remaining_credit"] is not None
            ):
                st["remaining_credit"] = _money_round(st["remaining_credit"] - line_amt)

    if hasattr(user_course, "active_enrollment_discount_list"):
        del user_course.active_enrollment_discount_list
    return rows


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


def whole_term_already_invoiced(*, user_id: int, course_id: int) -> bool:
    """
    True when a whole-term enrollment already has a payment.

    Whole-term plans bill once, so the invoice cron must not keep issuing the
    full term fee every interval.
    """
    from app_finance.models import UserPayment

    return UserPayment.objects.filter(user_id=user_id, course_id=course_id).exists()

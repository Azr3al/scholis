"""
Per-(user, course) context attached to serialized payment rows.

Payment ordinal, course term total, and paid-to-date are facts about the
enrollment, not about the individual payment, so they are computed once per
distinct (user, course) pair after serialization rather than per row.

Spec: docs/superpowers/specs/2026-07-26-coverage-driven-payment-pricing-design.md
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from app_finance.discount_engine import compute_course_term_total
from app_finance.models import UserPayment
from app_finance.payment_adjustment_totals import refund_total_for_payment_ids
from app_finance.payment_pair_context import PaymentPairContext, build_payment_pair_context

CONTEXT_KEYS = ("payment_sequence", "term_total", "paid_to_date", "total_refunded_to_date")


def _money_str(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _pair_of(row: dict) -> tuple[int, int] | None:
    user = row.get("user")
    course = row.get("course")
    user_id = user.get("id") if isinstance(user, dict) else user
    course_id = course.get("id") if isinstance(course, dict) else course
    if user_id is None or course_id is None:
        return None
    return (user_id, course_id)


def attach_course_payment_context(
    rows: list[dict],
    *,
    ctx: PaymentPairContext | None = None,
) -> None:
    """Add payment_sequence, term_total, paid_to_date, and total_refunded_to_date."""
    if not rows:
        return

    if ctx is None:
        ctx = build_payment_pair_context(rows)

    pairs = ctx.pairs
    if not pairs:
        for row in rows:
            row["payment_sequence"] = 1
            row["term_total"] = None
            row["paid_to_date"] = "0"
            row["total_refunded_to_date"] = "0"
        return

    ordinals: dict[tuple[int, int], list[int]] = {}
    paid: dict[tuple[int, int], Decimal] = {}
    verified_payment_ids: list[int] = []
    payment_id_to_pair: dict[int, tuple[int, int]] = {}
    for key, payments in ctx.payments_by_pair.items():
        for payment in payments:
            ordinals.setdefault(key, []).append(payment.id)
            payment_id_to_pair[payment.id] = key
            if payment.status == UserPayment.Status.VERIFIED:
                amount = payment.actual_amount
                if amount is None:
                    amount = payment.parsed_amount
                if amount is not None:
                    paid[key] = paid.get(key, Decimal("0")) + Decimal(str(amount.amount))
                verified_payment_ids.append(payment.id)

    refunded_by_pair: dict[tuple[int, int], Decimal] = {}
    if verified_payment_ids:
        refund_by_payment = refund_total_for_payment_ids(set(verified_payment_ids))
        for payment_id, refund_amount in refund_by_payment.items():
            pair = payment_id_to_pair.get(payment_id)
            if pair is None:
                continue
            refunded_by_pair[pair] = refunded_by_pair.get(pair, Decimal("0")) + refund_amount

    term_totals: dict[tuple[int, int], str | None] = {}
    for user_id, course_id in pairs:
        user_course = ctx.enrollments.get((user_id, course_id))
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
        row["paid_to_date"] = _money_str(paid.get(key, Decimal("0")))
        row["total_refunded_to_date"] = _money_str(
            refunded_by_pair.get(key, Decimal("0"))
        )

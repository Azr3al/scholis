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

from typing import Type

from django.db import transaction

from app_finance.discount_engine import compute_invoiced_amount
from app_finance.models import EnrollmentDiscount, PaymentPlan, UserPayment
from app_finance.payment_coverage import month_tuples_from_payment
from app_finance.payment_repricing_audit import (
    DEFAULT_REPRICING_CHUNK_SIZE,
    STATUS_MISPRICED,
    PaymentRepricingRow,
    RepricingAuditContext,
    _load_payment_chunk,
    build_repricing_audit_context,
    build_repricing_row,
)

WRITABLE_FIELDS = (
    "base_amount",
    "discount_amount",
    "invoiced_amount",
    "computed_invoiced_amount",
)
BULK_UPDATE_BATCH_SIZE = 500


def null_stale_whole_term_shares() -> int:
    """
    Clear `per_period_share` on whole-term enrollment discounts.

    Rows created before this change stored fixed_amount/months there. The
    whole-term code path ignores the field, but leaving a wrong-looking value in
    the database invites someone to "fix" the reader instead of the writer.
    """
    stale = EnrollmentDiscount.objects.filter(
        per_period_share__isnull=False,
        user_course__course__payment_plan__billing_type=PaymentPlan.BillingType.WHOLE_TERM,
    )
    return stale.update(per_period_share=None)


def _apply_repricing_to_payment(
    payment: UserPayment,
    ctx: RepricingAuditContext,
) -> bool:
    """Mutate payment pricing fields in memory. Returns False when skipped."""
    user_course = ctx.enrollment_map.get((payment.user_id, payment.course_id))
    if user_course is None or not user_course.course.payment_plan_id:
        return False
    result = compute_invoiced_amount(
        user_course=user_course,
        payment_plan=user_course.course.payment_plan,
        covered_months=month_tuples_from_payment(payment) or None,
        org=None,
        user_active_course_count=ctx.active_course_counts.get(payment.user_id, 0),
    )
    payment.base_amount = result.base_amount
    payment.discount_amount = result.discount_amount
    payment.invoiced_amount = result.invoiced_amount
    payment.computed_invoiced_amount = result.invoiced_amount
    return True


def backfill_payment_repricing(
    schema_name: str,
    *,
    dry_run: bool = False,
    chunk_size: int = DEFAULT_REPRICING_CHUNK_SIZE,
    user_payment_model: Type = UserPayment,
) -> list[PaymentRepricingRow]:
    """Reprice mispriced payments in the current schema. Returns changed rows."""
    if not dry_run:
        null_stale_whole_term_shares()

    changed_rows: list[PaymentRepricingRow] = []
    active_course_counts: dict[int, int] = {}
    last_id = 0

    with transaction.atomic():
        while True:
            payments = _load_payment_chunk(
                last_id=last_id,
                chunk_size=chunk_size,
                user_payment_model=user_payment_model,
            )
            if not payments:
                break

            ctx = build_repricing_audit_context(
                payments,
                active_course_counts=active_course_counts,
            )
            to_update: list[UserPayment] = []

            for payment in payments:
                row = build_repricing_row(schema_name, payment, ctx=ctx)
                if row.status != STATUS_MISPRICED:
                    continue
                changed_rows.append(row)
                if dry_run:
                    continue
                if _apply_repricing_to_payment(payment, ctx):
                    to_update.append(payment)

            if to_update:
                user_payment_model.objects.bulk_update(
                    to_update,
                    [*WRITABLE_FIELDS, "updated_at"],
                    batch_size=BULK_UPDATE_BATCH_SIZE,
                )

            last_id = payments[-1].id
            if len(payments) < chunk_size:
                break

    return changed_rows

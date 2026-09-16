"""
Reprice first parts of split-screenshot payment groups from stored covered_months.

The multipart create path once priced without covered_months, storing one period's
base/discount/invoiced while coverage spanned several months. Generic repricing
backfill only compares invoiced_amount, so base-only mismatches were skipped.

Safety rules (same as payment_repricing_backfill):
  * Only base_amount, discount_amount, invoiced_amount, computed_invoiced_amount
    and payment discount lines are rewritten on the group's first part.
  * parsed_amount and actual_amount are NEVER touched.
  * Payments with is_amount_overridden are skipped.
  * Coverage outside the course calendar is skipped.
"""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Min

from app_finance.discount_engine import compute_invoiced_amount
from app_finance.discount_eligibility import active_course_counts_for_users
from app_finance.models import UserPayment
from app_finance.payment_coverage import month_tuples_from_payment
from app_finance.payment_discount_apply import (
    persist_payment_discount_lines,
    resolve_student_enrollments_bulk,
)
from app_finance.payment_repricing_backfill import WRITABLE_FIELDS

BULK_UPDATE_BATCH_SIZE = 500


def _money_equal(stored, computed) -> bool:
    if stored is None and computed is None:
        return True
    if stored is None or computed is None:
        return False
    return Decimal(str(stored.amount)) == Decimal(str(computed.amount))


def _needs_repricing(payment: UserPayment, result) -> bool:
    return not (
        _money_equal(payment.base_amount, result.base_amount)
        and _money_equal(payment.discount_amount, result.discount_amount)
        and _money_equal(payment.invoiced_amount, result.invoiced_amount)
    )


def _first_part_ids_for_multi_part_groups() -> list[int]:
    return list(
        UserPayment.objects.filter(group_id__isnull=False)
        .values("group_id")
        .annotate(part_count=Count("id"), first_part_id=Min("id"))
        .filter(part_count__gte=2)
        .values_list("first_part_id", flat=True)
    )


def backfill_split_screenshot_group_pricing(
    schema_name: str,
    *,
    dry_run: bool = False,
) -> list[int]:
    """
    Reprice mispriced first parts of payment groups in the current schema.

    Returns payment ids that would be or were updated.
    """
    del schema_name  # tenant scope is the active connection schema

    first_part_ids = _first_part_ids_for_multi_part_groups()
    if not first_part_ids:
        return []

    payments = list(
        UserPayment.objects.filter(id__in=first_part_ids)
        .select_related("user", "course", "course__payment_plan")
        .prefetch_related("covered_months")
        .order_by("id")
    )

    pairs = {
        (p.user_id, p.course_id)
        for p in payments
        if not p.is_amount_overridden and p.user_id and p.course_id
    }
    user_ids = {user_id for user_id, _ in pairs}
    enrollment_map = resolve_student_enrollments_bulk(pairs)
    active_course_counts = active_course_counts_for_users(user_ids)

    changed_ids: list[int] = []

    with transaction.atomic():
        to_update: list[UserPayment] = []

        for payment in payments:
            if payment.is_amount_overridden:
                continue
            if payment.user_id is None or payment.course_id is None:
                continue

            months = month_tuples_from_payment(payment)
            if not months:
                continue

            user_course = enrollment_map.get((payment.user_id, payment.course_id))
            if user_course is None or not user_course.course.payment_plan_id:
                continue

            try:
                result = compute_invoiced_amount(
                    user_course=user_course,
                    payment_plan=user_course.course.payment_plan,
                    covered_months=months,
                    org=None,
                    user_active_course_count=active_course_counts.get(
                        payment.user_id, 0
                    ),
                )
            except ValueError as exc:
                if str(exc) == "covered_month_outside_course":
                    continue
                raise

            if not _needs_repricing(payment, result):
                continue

            changed_ids.append(payment.id)
            if dry_run:
                continue

            payment.base_amount = result.base_amount
            payment.discount_amount = result.discount_amount
            payment.invoiced_amount = result.invoiced_amount
            payment.computed_invoiced_amount = result.invoiced_amount
            to_update.append(payment)
            persist_payment_discount_lines(user_payment=payment, lines=result.lines)

        if to_update:
            UserPayment.objects.bulk_update(
                to_update,
                [*WRITABLE_FIELDS, "updated_at"],
                batch_size=BULK_UPDATE_BATCH_SIZE,
            )

    return changed_ids

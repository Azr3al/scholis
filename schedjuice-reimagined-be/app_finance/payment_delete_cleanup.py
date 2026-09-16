"""Revert enrollment discount state when a student payment is deleted."""

from __future__ import annotations

from app_finance.discount_engine import (
    remove_enrollment_discount_by_id,
    resolve_period_indices_for_cleanup,
    revert_discount_state_after_payment_delete,
)
from app_finance.models import UserPayment, UserPaymentDiscount
from app_finance.payment_coverage import month_tuples_from_payment


def cleanup_discounts_on_user_payment_delete(
    user_payment: UserPayment,
    *,
    removed_by,
) -> None:
    """
    Before deleting a payment:
    - revert consumed credit from its discount lines
    - deactivate orphan enrollment discounts introduced on create (provenance)
    """
    lines = list(
        user_payment.payment_discounts.select_related(
            "enrollment_discount",
            "enrollment_discount__user_course",
        ).all()
    )
    course = user_payment.course
    if course is None:
        return

    period_indices = resolve_period_indices_for_cleanup(
        course=course,
        covered_months=month_tuples_from_payment(user_payment) or None,
        billing_period_index=None,
    )

    provenance = user_payment.discount_ids_set_on_create
    can_deactivate = provenance is not None and provenance != []
    provenance_set = set(provenance) if can_deactivate else set()

    for line in lines:
        ed = line.enrollment_discount
        if ed is None:
            continue

        update_fields = revert_discount_state_after_payment_delete(
            enrollment_discount=ed,
            discount_amount=line.amount,
            period_indices=period_indices,
            excluding_payment_id=user_payment.id,
            course=course,
        )

        other_references = UserPaymentDiscount.objects.filter(
            enrollment_discount_id=ed.id
        ).exclude(user_payment_id=user_payment.id)

        should_deactivate = (
            can_deactivate
            and ed.is_active
            and ed.discount_id in provenance_set
            and not other_references.exists()
        )

        if should_deactivate:
            if len(update_fields) > 1:
                ed.save(update_fields=update_fields)
            remove_enrollment_discount_by_id(
                user_course=ed.user_course,
                enrollment_discount_id=ed.id,
                removed_by=removed_by,
            )
        elif len(update_fields) > 1:
            ed.save(update_fields=update_fields)

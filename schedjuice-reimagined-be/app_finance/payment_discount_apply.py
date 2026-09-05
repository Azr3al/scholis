from __future__ import annotations

from datetime import date

from django.db.models import Prefetch

from app_course.models import UserCourse
from app_finance.discount_eligibility import student_active_course_count
from app_finance.discount_engine import (
    compute_invoiced_amount,
    remove_enrollment_discount,
    resolve_period_indices,
    set_enrollment_discounts,
)
from app_finance.models import EnrollmentDiscount, UserPayment, UserPaymentDiscount
from app_organization.models import Organization


def resolve_student_enrollment(*, user_id: int, course_id: int) -> UserCourse | None:
    return (
        UserCourse.objects.filter(
            user_id=user_id,
            course_id=course_id,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        .select_related("course", "course__payment_plan", "user")
        .first()
    )


def resolve_student_enrollments_bulk(
    pairs: set[tuple[int, int]],
) -> dict[tuple[int, int], UserCourse]:
    """Load student enrollments for many (user_id, course_id) pairs in one query."""
    if not pairs:
        return {}
    user_ids = {user_id for user_id, _ in pairs}
    course_ids = {course_id for _, course_id in pairs}
    enrollments = (
        UserCourse.objects.filter(
            user_id__in=user_ids,
            course_id__in=course_ids,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        .select_related("course", "course__payment_plan")
        .prefetch_related(
            Prefetch(
                "enrollment_discounts",
                queryset=EnrollmentDiscount.objects.filter(is_active=True).select_related(
                    "discount"
                ),
                to_attr="active_enrollment_discount_list",
            )
        )
    )
    return {(uc.user_id, uc.course_id): uc for uc in enrollments}


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


def persist_payment_discount_lines(*, user_payment: UserPayment, lines) -> None:
    UserPaymentDiscount.objects.filter(user_payment=user_payment).delete()
    to_create = [
        UserPaymentDiscount(
            user_payment=user_payment,
            enrollment_discount_id=ln.enrollment_discount_id,
            label=ln.label,
            amount=ln.amount,
        )
        for ln in lines
        if ln.amount is not None and ln.amount.amount > 0
    ]
    if to_create:
        UserPaymentDiscount.objects.bulk_create(to_create)


def apply_discount_and_amount_fields(
    *,
    user,
    course,
    request_user,
    org: Organization | None,
    discount_id=None,
    discount_ids=None,
    clear_discount: bool = False,
    as_of: date | None = None,
    covered_months: list[tuple[int, int]] | None = None,
) -> dict:
    """
    Returns kwargs to set on UserPayment: invoiced_amount, base_amount,
    discount_amount, computed_invoiced_amount, plus internal `_discount_lines`
    and `_period_indices` for post-save snapshot and credit consumption.

    - discount_ids is None → leave stack unchanged (omitted)
    - discount_ids is a list (incl. []) → set stack exactly
    - clear_discount True → set stack to []
    - discount_id singular (deprecated) → treat as [discount_id] when discount_ids omitted
    """
    user_id = user.id if hasattr(user, "id") else int(user)
    course_id = course.id if hasattr(course, "id") else int(course)
    user_course = resolve_student_enrollment(user_id=user_id, course_id=course_id)
    if not user_course or not user_course.course.payment_plan_id:
        return {}

    if discount_ids is not None and discount_id is not None:
        raise ValueError("Provide discount_ids or discount_id, not both")

    effective_ids = discount_ids
    discount_ids_set_on_create = None
    if clear_discount:
        effective_ids = []
    elif effective_ids is None and discount_id is not None:
        effective_ids = [int(discount_id)]

    if effective_ids is not None:
        if not user_course.course.payment_plan_id:
            return {}
        set_enrollment_discounts(
            user_course=user_course,
            discount_ids=[int(x) for x in effective_ids],
            applied_by=request_user,
            org=org,
            as_of=as_of,
        )
        discount_ids_set_on_create = [int(x) for x in effective_ids]
    elif clear_discount:
        remove_enrollment_discount(user_course=user_course, removed_by=request_user)
        discount_ids_set_on_create = []

    user_course = resolve_student_enrollment(user_id=user_id, course_id=course_id)
    if not user_course or not user_course.course.payment_plan_id:
        return {}
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
        "_discount_ids_set_on_create": discount_ids_set_on_create,
    }


def reprice_user_payment_from_coverage(
    payment: UserPayment,
    *,
    org: Organization | None,
) -> bool:
    """
    Re-derive base/discount/invoiced from the payment's stored covered_months.

    Returns True when pricing fields were updated. Skips overridden payments and
    rows without enrollment/plan/coverage.
    """
    from app_finance.payment_coverage import month_tuples_from_payment

    if payment.is_amount_overridden:
        return False
    if payment.user_id is None or payment.course_id is None:
        return False

    user_course = resolve_student_enrollment(
        user_id=payment.user_id, course_id=payment.course_id
    )
    if user_course is None or not user_course.course.payment_plan_id:
        return False

    covered_months = month_tuples_from_payment(payment)
    if not covered_months:
        return False

    result = compute_payment_amount_breakdown(
        user_course=user_course,
        org=org,
        covered_months=covered_months,
    )
    if result is None:
        return False

    payment.base_amount = result.base_amount
    payment.discount_amount = result.discount_amount
    payment.invoiced_amount = result.invoiced_amount
    payment.computed_invoiced_amount = result.invoiced_amount
    payment.save(
        update_fields=[
            "base_amount",
            "discount_amount",
            "invoiced_amount",
            "computed_invoiced_amount",
            "updated_at",
        ]
    )
    persist_payment_discount_lines(user_payment=payment, lines=result.lines)
    return True


def joined_discount_label(user_payment: UserPayment) -> str | None:
    lines = list(user_payment.payment_discounts.all())
    if lines:
        labels = [ln.label for ln in lines if ln.label]
        return " + ".join(labels) if labels else None
    ed = getattr(user_payment, "enrollment_discount", None)
    if ed is None:
        return None
    discount = getattr(ed, "discount", None)
    if discount is not None and discount.name:
        return discount.name
    return None

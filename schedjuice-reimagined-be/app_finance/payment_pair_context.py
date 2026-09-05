"""
Bulk-loaded (user, course) context for payment list/report attach helpers.

Spec: docs/superpowers/specs/2026-07-26-coverage-driven-payment-pricing-design.md
"""

from __future__ import annotations

from dataclasses import dataclass

from django.db.models import Prefetch, Q

from app_course.models import Course, UserCourse
from app_finance.models import UserPayment, UserPaymentCoveredMonth
from app_finance.payment_discount_apply import resolve_student_enrollments_bulk


def pairs_from_rows(rows: list[dict]) -> set[tuple[int, int]]:
    pairs: set[tuple[int, int]] = set()
    for row in rows:
        user = row.get("user") or {}
        course = row.get("course") or {}
        user_id = user.get("id") if isinstance(user, dict) else user
        course_id = course.get("id") if isinstance(course, dict) else course
        if user_id is not None and course_id is not None:
            pairs.add((int(user_id), int(course_id)))
    return pairs


@dataclass(frozen=True)
class PaymentPairContext:
    pairs: set[tuple[int, int]]
    enrollments: dict[tuple[int, int], UserCourse]
    courses: dict[int, Course]
    payments_by_pair: dict[tuple[int, int], list[UserPayment]]


def build_payment_pair_context(
    rows: list[dict],
    *,
    include_courses: bool = False,
    include_coverage: bool = False,
) -> PaymentPairContext:
    """Prefetch enrollments, courses and payment history for serialized rows."""
    pairs = pairs_from_rows(rows)
    if not pairs:
        return PaymentPairContext(
            pairs=set(),
            enrollments={},
            courses={},
            payments_by_pair={},
        )

    enrollments = resolve_student_enrollments_bulk(pairs)

    courses: dict[int, Course] = {}
    if include_courses:
        course_ids = {course_id for _, course_id in pairs}
        courses = {
            c.id: c
            for c in Course.objects.filter(id__in=course_ids).select_related(
                "payment_plan"
            )
        }

    pair_filter = Q()
    for user_id, course_id in pairs:
        pair_filter |= Q(user_id=user_id, course_id=course_id)

    payment_qs = UserPayment.objects.filter(pair_filter).order_by("issued_at", "id")
    if include_coverage:
        payment_qs = payment_qs.prefetch_related(
            Prefetch(
                "covered_months",
                queryset=UserPaymentCoveredMonth.objects.only(
                    "year", "month_index", "user_payment_id"
                ),
            )
        )

    payments_by_pair: dict[tuple[int, int], list[UserPayment]] = {}
    for payment in payment_qs:
        key = (payment.user_id, payment.course_id)
        payments_by_pair.setdefault(key, []).append(payment)

    return PaymentPairContext(
        pairs=pairs,
        enrollments=enrollments,
        courses=courses,
        payments_by_pair=payments_by_pair,
    )

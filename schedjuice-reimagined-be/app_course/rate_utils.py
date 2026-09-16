"""
Utilities for resolving teacher hourly rates, including course-specific rates.
"""
from decimal import Decimal
from typing import Dict, Iterable, Optional, Tuple

from app_auth.models import User
from app_course.models import Course, UserCourse
from app_organization.models import Organization


def is_session_based_payroll(organization) -> bool:
    return (
        getattr(organization, "payroll_calculation_strategy", None)
        == Organization.PayrollCalculationStrategy.SESSION_BASED
    )


def get_rate_from_user_course_rates(user: User, course: Course) -> Optional[Decimal]:
    """
    Get the hourly rate from user.course_rates for the course's category.

    user.course_rates format: { category_id: rate } (e.g. {"1": "1500.00", "2": 1800})
    Returns None if no matching category rate exists.
    """
    if not user.course_rates or course.category_id is None:
        return None
    key = str(course.category_id)
    rate = user.course_rates.get(key)
    if rate is None:
        return None
    try:
        return Decimal(str(rate))
    except (ValueError, TypeError):
        return None


def _rate_after_no_user_course_hourly(
    user: User,
    course: Course,
) -> Optional[Decimal]:
    """
    When UserCourse.hourly_rate does not apply (missing row or null), use
    user.course_rates for the course category, then user.per_hour_rate.
    """
    cat = get_rate_from_user_course_rates(user, course)
    if cat is not None:
        return cat
    return user.per_hour_rate


def build_user_course_teacher_hourly_rate_lookup(
    pairs: Iterable[Tuple[int, int]],
) -> Dict[Tuple[int, int], Decimal]:
    """
    One query: load UserCourse teacher rows with non-null hourly_rate for the given
    (user_id, course_id) pairs. Keys present map to the course-specific rate; missing
    keys mean the caller will fall back to user.course_rates and then
    user.per_hour_rate (same as get_hourly_rate_for_teacher_course).
    """
    pair_set = set(pairs)
    if not pair_set:
        return {}
    user_ids = {p[0] for p in pair_set}
    course_ids = {p[1] for p in pair_set}
    rows = UserCourse.objects.filter(
        assigned_as=UserCourse.AssignedAs.TEACHER,
        user_id__in=user_ids,
        course_id__in=course_ids,
        hourly_rate__isnull=False,
    ).values_list("user_id", "course_id", "hourly_rate")
    out: Dict[Tuple[int, int], Decimal] = {}
    for uid, cid, hr in rows:
        key = (uid, cid)
        if key in pair_set:
            out[key] = hr
    return out


def get_hourly_rate_for_teacher_course(
    user: User,
    course: Course,
    organization=None,
    *,
    user_course_hourly_rate_lookup: Optional[Dict[Tuple[int, int], Decimal]] = None,
) -> Optional[Decimal]:
    """
    Resolve the hourly rate for a teacher teaching a specific course.

    When organization.supports_course_specific_rates is True:
        - Use UserCourse.hourly_rate if set for this teacher-course pair
        - Else use user.course_rates for the course category (if present)
        - Else user.per_hour_rate

    When organization.supports_course_specific_rates is False (or organization is None):
        - Always use user.per_hour_rate (legacy behavior)

    Pass user_course_hourly_rate_lookup from build_user_course_teacher_hourly_rate_lookup
    to avoid a UserCourse query per row (e.g. bulk backfills).
    """
    if organization is None or not getattr(
        organization, "supports_course_specific_rates", False
    ):
        return user.per_hour_rate

    if user_course_hourly_rate_lookup is not None:
        key = (user.pk, course.pk)
        if key in user_course_hourly_rate_lookup:
            return user_course_hourly_rate_lookup[key]
        return _rate_after_no_user_course_hourly(user, course)

    uc = UserCourse.objects.filter(
        user=user,
        course=course,
        assigned_as=UserCourse.AssignedAs.TEACHER,
    ).first()

    if uc and uc.hourly_rate is not None:
        return uc.hourly_rate
    return _rate_after_no_user_course_hourly(user, course)


def get_per_hour_price_snapshot_for_course(course: Optional[Course]) -> Optional[Decimal]:
    """Return ``PaymentPlan.per_hour_price`` amount for freezing on ``UserEvent`` (historical revenue)."""
    if course is None:
        return None
    plan = getattr(course, "payment_plan", None)
    if plan is None:
        return None
    price = getattr(plan, "per_hour_price", None)
    if price is None:
        return None
    return price.amount

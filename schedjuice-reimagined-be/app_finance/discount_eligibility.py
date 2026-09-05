# app_finance/discount_eligibility.py
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable

from app_auth.models import User
from app_course.course_status import course_is_effectively_active
from app_course.models import Course, UserCourse
from app_finance.models import Discount


@dataclass(frozen=True)
class EligibilityContext:
    """Precomputed enrollment facts for batch discount eligibility checks."""

    has_other_enrollment: bool
    active_course_count: int


def _student_enrollments(user_id: int) -> list[UserCourse]:
    return list(
        UserCourse.objects.filter(
            user_id=user_id,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        ).select_related("course")
    )


def build_eligibility_context(
    *,
    user_id: int,
    user_course_id: int | None = None,
    as_of: date | None = None,
) -> EligibilityContext:
    """Load student enrollments once for loyalty and bulk rule evaluation."""
    enrollments = _student_enrollments(user_id)
    if user_course_id is None:
        has_other_enrollment = bool(enrollments)
    else:
        has_other_enrollment = any(uc.pk != user_course_id for uc in enrollments)
    active_course_count = sum(
        1
        for uc in enrollments
        if course_is_effectively_active(uc.course, reference=as_of)
    )
    return EligibilityContext(
        has_other_enrollment=has_other_enrollment,
        active_course_count=active_course_count,
    )


def student_active_course_count(user_id: int, *, as_of: date | None = None) -> int:
    return build_eligibility_context(user_id=user_id, as_of=as_of).active_course_count


def active_course_counts_for_users(
    user_ids: Iterable[int],
    *,
    as_of: date | None = None,
) -> dict[int, int]:
    """Active course count per student in one enrollment query."""
    unique_ids = {uid for uid in user_ids if uid is not None}
    if not unique_ids:
        return {}
    counts = dict.fromkeys(unique_ids, 0)
    enrollments = UserCourse.objects.filter(
        user_id__in=unique_ids,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).select_related("course")
    for uc in enrollments:
        if course_is_effectively_active(uc.course, reference=as_of):
            counts[uc.user_id] += 1
    return counts


def is_discount_eligible(
    *,
    discount: Discount,
    user: User,
    course: Course,
    user_course: UserCourse | None,
    as_of: date,
    ctx: EligibilityContext | None = None,
) -> tuple[bool, str | None]:
    etype = discount.eligibility_type or Discount.EligibilityType.NONE
    if etype == Discount.EligibilityType.NONE:
        return True, None

    if etype == Discount.EligibilityType.EARLY_BIRD:
        start = course.start_date
        if start is None:
            return False, "early_bird_missing_start_date"
        days = discount.early_bird_days or 0
        cutoff = start - timedelta(days=days)
        if as_of <= cutoff:
            return True, None
        return False, "early_bird_window_closed"

    if etype == Discount.EligibilityType.LOYALTY:
        if ctx is not None:
            if ctx.has_other_enrollment:
                return True, None
            return False, "loyalty_not_met"
        qs = UserCourse.objects.filter(
            user_id=user.id,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        if user_course is not None:
            qs = qs.exclude(pk=user_course.pk)
        if qs.exists():
            return True, None
        return False, "loyalty_not_met"

    if etype == Discount.EligibilityType.BULK:
        count = (
            ctx.active_course_count
            if ctx is not None
            else student_active_course_count(user.id, as_of=as_of)
        )
        minimum = discount.bulk_min_courses or 0
        if count >= minimum:
            return True, None
        return False, "bulk_min_not_met"

    return False, "unknown_eligibility_type"


def filter_selectable_discounts(
    *,
    discounts: Iterable[Discount],
    user: User,
    course: Course,
    user_course: UserCourse,
    as_of: date,
    applied_template_ids: set[int],
    eligibility_enabled: bool = True,
) -> list[Discount]:
    """Return active catalog discounts not yet applied and eligible for selection."""
    candidates = [d for d in discounts if d.id not in applied_template_ids]
    if not eligibility_enabled:
        return candidates

    ctx = build_eligibility_context(
        user_id=user.id,
        user_course_id=user_course.pk,
        as_of=as_of,
    )
    return [
        d
        for d in candidates
        if is_discount_eligible(
            discount=d,
            user=user,
            course=course,
            user_course=user_course,
            as_of=as_of,
            ctx=ctx,
        )[0]
    ]

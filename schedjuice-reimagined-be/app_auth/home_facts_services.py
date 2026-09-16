from __future__ import annotations

from datetime import date, datetime

from django.db.models import Q

from app_attendance.models import UserEvent
from app_auth.models import User
from app_auth.shortcuts_availability_helpers import STAFF_ROLES_FOR_SHORTCUTS
from app_auth.student_enrollment import actively_enrolled_students_qs
from app_course.course_status import apply_effective_status_filter
from app_course.models import Course, Event
from app_organization.models import Organization
from app_rbac.resolution import effective_permissions
from app_utility_notifications.tenant_time import (
    get_tenant_day_boundaries,
    get_tenant_today_ymd,
)


def _organization_today(organization: Organization | None, now: datetime) -> date:
    tz = getattr(organization, "timezone", None) or "UTC"
    ymd = get_tenant_today_ymd(tz, now)
    return date.fromisoformat(ymd)


def build_home_facts(
    user: User,
    organization: Organization | None,
    *,
    now: datetime,
) -> dict[str, int]:
    held = set(effective_permissions(user))
    if "user.view_all" not in held or "course.view_all" not in held:
        return {}

    tz = getattr(organization, "timezone", None) or "UTC"
    today_ymd = get_tenant_today_ymd(tz, now)
    start, end = get_tenant_day_boundaries(now, tz, today_ymd)
    reference = _organization_today(organization, now)

    payload: dict[str, int] = {
        "staff": User.objects.filter(
            is_active=True,
            roles__contained_by=[*STAFF_ROLES_FOR_SHORTCUTS],
        ).count(),
        "students": actively_enrolled_students_qs().count(),
        "courses": apply_effective_status_filter(
            Course.objects.all(),
            ["active"],
            reference=reference,
        ).count(),
        "sessions_today": Event.objects.filter(
            date__gte=start,
            date__lte=end,
        ).count(),
    }

    if (
        organization is not None
        and organization.use_teacher_session_checkin
        and "checkin.view_all" in held
    ):
        today_events = Event.objects.filter(date__gte=start, date__lte=end)
        teacher_filter = Q(user__roles__contains=[User.UserRole.TEACHER])
        expected_staff_today = (
            UserEvent.objects.filter(event__in=today_events)
            .filter(teacher_filter)
            .values("user_id")
            .distinct()
            .count()
        )
        checked_in_today = (
            UserEvent.objects.filter(
                event__in=today_events,
                checkin_time__isnull=False,
            )
            .filter(teacher_filter)
            .values("user_id")
            .distinct()
            .count()
        )
        payload["expected_staff_today"] = expected_staff_today
        payload["checked_in_today"] = checked_in_today

    return payload

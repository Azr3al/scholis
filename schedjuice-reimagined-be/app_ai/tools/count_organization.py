"""Organization-wide staff, student, and course counts."""
from __future__ import annotations

from datetime import date
from typing import Any

from app_ai.links import get_current_org
from app_ai.org_datetime import org_today
from app_ai.tools.base import Tool, strict_object_schema
from app_ai.tools.rbac import require_course_read_breadth, require_user_read_breadth
from app_auth.models import User
from app_auth.shortcuts_availability_helpers import STAFF_ROLES_FOR_SHORTCUTS
from app_auth.student_enrollment import actively_enrolled_students_qs
from app_course.course_status import apply_effective_status_filter
from app_course.models import Course

COURSE_STATUS_ENUM = ["active", "planned", "ended", "paused", "all"]

COUNT_ORGANIZATION_SCHEMA = strict_object_schema(
    properties={
        "entity": {
            "type": "string",
            "enum": ["staff", "students", "courses"],
        },
        "course_status": {
            "type": "string",
            "enum": COURSE_STATUS_ENUM,
            "description": (
                "Filter courses by status. Default active. Ignored for staff/students."
            ),
        },
        "include_inactive_users": {
            "type": "boolean",
            "description": (
                "Include inactive users for staff/student counts. Default false."
            ),
        },
        "include_all_student_accounts": {
            "type": "boolean",
            "description": (
                "Students only. When true, count all student-role accounts regardless "
                "of course enrollment. Default false counts actively enrolled students "
                "(at least one non-dropped assignment in an active course), matching "
                "the student data sheet."
            ),
        },
    },
    required=["entity"],
)


def _apply_course_status(qs, status: str, *, reference: date | None = None):
    if status == "all":
        return qs
    ref = reference
    if ref is None:
        org = get_current_org()
        if org is not None:
            ref = org_today(org)
    return apply_effective_status_filter(qs, [status], reference=ref)


def run_count_organization(args: dict[str, Any], user: User) -> dict[str, Any]:
    entity = args["entity"]
    course_status = args.get("course_status") or "active"
    include_inactive = bool(args.get("include_inactive_users"))
    include_all_student_accounts = bool(args.get("include_all_student_accounts"))

    if entity in ("staff", "students"):
        denied = require_user_read_breadth(user)
        if denied:
            return denied
        if entity == "staff":
            qs = User.objects.all()
            if not include_inactive:
                qs = qs.filter(is_active=True)
            qs = qs.filter(roles__contained_by=[*STAFF_ROLES_FOR_SHORTCUTS])
            enrollment_scope = None
        elif include_all_student_accounts:
            qs = User.objects.all()
            if not include_inactive:
                qs = qs.filter(is_active=True)
            qs = qs.filter(roles__contains=[User.UserRole.STUDENT])
            enrollment_scope = "all_accounts"
        else:
            qs = actively_enrolled_students_qs(
                include_inactive_users=include_inactive,
            )
            enrollment_scope = "actively_enrolled"
        return {
            "count": qs.count(),
            "entity": entity,
            "filters_applied": {
                "include_inactive_users": include_inactive,
                "course_status": None,
                "enrollment_scope": enrollment_scope,
            },
        }

    denied = require_course_read_breadth(user)
    if denied:
        return denied
    org = get_current_org()
    reference = org_today(org) if org is not None else None
    qs = _apply_course_status(
        Course.objects.all(), course_status, reference=reference
    )
    return {
        "count": qs.count(),
        "entity": "courses",
        "filters_applied": {
            "include_inactive_users": None,
            "course_status": course_status,
            "enrollment_scope": None,
        },
    }


COUNT_ORGANIZATION_TOOL = Tool(
    name="count_organization",
    description=(
        "Count school-wide totals: staff, students, or courses. "
        "Requires admin permissions. Courses default to active status only; "
        "staff default to active users only. Student counts default to actively "
        "enrolled students (at least one non-dropped assignment in an active course), "
        "matching the student data sheet. Use include_all_student_accounts=true only "
        "for total student accounts regardless of enrollment."
    ),
    parameters=COUNT_ORGANIZATION_SCHEMA,
    run=run_count_organization,
)

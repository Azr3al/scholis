"""List courses assigned to a student or staff member."""
from __future__ import annotations

from typing import Any

from django.db.models import QuerySet

from app_ai.links import compact_user_for_ai, get_current_org, with_course_link
from app_ai.tools.base import Tool, strict_object_schema
from app_ai.tools.count_organization import COURSE_STATUS_ENUM
from app_ai.tools.resolve import resolve_user
from app_auth.models import User
from app_auth.shortcuts_availability_helpers import STAFF_ROLES_FOR_SHORTCUTS
from app_course.course_scoping import scope_courses_for_user
from app_course.models import AssignedAsRole, Course, UserCourse

LARGE_ACTIVE_ASSIGNMENT_THRESHOLD = 50
MAIN_TEACHER_SENIORITIES = (
    AssignedAsRole.Seniority.MAIN_TEACHER,
    AssignedAsRole.Seniority.ASSISTANT_TEACHER,
)
ASSIGNMENT_SCOPE_ENUM = ["default", "full", "non_main"]

LIST_USER_COURSES_SCHEMA = strict_object_schema(
    properties={
        "user_id": {
            "type": "integer",
            "description": "User id from a prior search_users result.",
        },
        "query": {
            "type": "string",
            "description": "User name, email, or code when user_id is unknown.",
            "minLength": 1,
        },
        "course_status": {
            "type": "string",
            "enum": COURSE_STATUS_ENUM,
            "description": "Filter by course status. Default active.",
        },
        "assignment_scope": {
            "type": "string",
            "enum": ASSIGNMENT_SCOPE_ENUM,
            "description": (
                "For staff with more than 50 active course assignments: default "
                "returns only Main Teacher (MT) and Assistant Teacher (AT) roles; "
                "use full for every assignment or non_main for non-MT/AT roles only."
            ),
        },
        "limit": {
            "type": "integer",
            "description": "Maximum courses to return (1-50).",
            "minimum": 1,
            "maximum": 50,
        },
    },
    required=[],
)


def _role_payload(role) -> dict[str, Any] | None:
    if role is None:
        return None
    return {
        "id": role.id,
        "name": role.name,
        "seniority": role.seniority,
    }


def _compact_enrollment(user_course: UserCourse, *, org) -> dict[str, Any]:
    course = user_course.course
    row: dict[str, Any] = {
        "course_id": course.id,
        "title": course.title,
        "code": course.code,
        "status": course.status,
        "assigned_as": user_course.assigned_as,
    }
    if user_course.assigned_as == UserCourse.AssignedAs.TEACHER:
        row["assigned_as_role"] = _role_payload(user_course.assigned_as_role)
    return with_course_link(row, org=org)


def _is_staff_user(user: User) -> bool:
    roles = set(user.roles or [])
    return bool(roles & set(STAFF_ROLES_FOR_SHORTCUTS))


def _base_enrollment_qs(*, actor: User, target: User) -> QuerySet[UserCourse]:
    accessible_course_ids = scope_courses_for_user(actor).values_list("id", flat=True)
    return (
        UserCourse.objects.filter(
            user_id=target.id,
            course_id__in=accessible_course_ids,
        )
        .select_related("course", "assigned_as_role")
        .order_by("course__title")
    )


def _active_assignment_count(qs: QuerySet[UserCourse]) -> int:
    return qs.filter(course__status=Course.CourseStatus.ACTIVE).count()


def _apply_assignment_scope(
    qs: QuerySet[UserCourse], *, scope: str, apply_large_list_filter: bool
) -> QuerySet[UserCourse]:
    if not apply_large_list_filter:
        return qs
    if scope == "full":
        return qs
    if scope == "non_main":
        return qs.filter(assigned_as=UserCourse.AssignedAs.TEACHER).exclude(
            assigned_as_role__seniority__in=MAIN_TEACHER_SENIORITIES
        )
    return qs.filter(
        assigned_as=UserCourse.AssignedAs.TEACHER,
        assigned_as_role__seniority__in=MAIN_TEACHER_SENIORITIES,
    )


def run_list_user_courses(args: dict[str, Any], user: User) -> dict[str, Any]:
    user_id = args.get("user_id")
    query = args.get("query")
    has_id = user_id is not None
    has_query = bool((query or "").strip())
    if has_id == has_query:
        return {
            "error": "validation_error",
            "message": "Provide exactly one of user_id or query.",
        }

    resolved = resolve_user(actor=user, user_id=user_id, query=query)
    if resolved["status"] != "ok":
        return {
            "error": resolved["status"],
            **{k: v for k, v in resolved.items() if k != "status"},
        }

    target = resolved["user"]
    course_status = args.get("course_status") or "active"
    assignment_scope = args.get("assignment_scope") or "default"
    if assignment_scope not in ASSIGNMENT_SCOPE_ENUM:
        return {
            "error": "validation_error",
            "message": f"assignment_scope must be one of {ASSIGNMENT_SCOPE_ENUM}.",
        }
    limit = int(args.get("limit") or 50)

    base_qs = _base_enrollment_qs(actor=user, target=target)
    active_assignment_count = _active_assignment_count(base_qs)
    apply_large_list_filter = (
        _is_staff_user(target)
        and active_assignment_count > LARGE_ACTIVE_ASSIGNMENT_THRESHOLD
    )

    qs = base_qs
    if course_status != "all":
        qs = qs.filter(course__status=course_status)
    qs = _apply_assignment_scope(
        qs,
        scope=assignment_scope,
        apply_large_list_filter=apply_large_list_filter,
    )

    org = get_current_org()
    matched = list(qs[: limit + 1])
    truncated = len(matched) > limit
    courses = [_compact_enrollment(uc, org=org) for uc in matched[:limit]]

    user_row = compact_user_for_ai(target, org=org)
    user_row["roles"] = list(target.roles or [])

    result: dict[str, Any] = {
        "user": user_row,
        "courses": courses,
        "course_status": course_status,
        "count": len(courses),
    }
    if apply_large_list_filter:
        result["total_active_assignments"] = active_assignment_count
        result["assignment_scope"] = assignment_scope
        result["large_list_filtered"] = assignment_scope != "full"
        if truncated:
            result["truncated"] = True
    return result


LIST_USER_COURSES_TOOL = Tool(
    name="list_user_courses",
    description=(
        "List courses a student or staff member is enrolled in. Use search_users first "
        "to resolve names to user_id. For staff/teachers, each course includes "
        "assigned_as (teacher) and assigned_as_role (e.g. Main Teacher). "
        "Defaults to active courses only. When a staff member has more than 50 active "
        "assignments, only Main Teacher and Assistant Teacher courses are returned "
        "unless assignment_scope is full (all courses) or non_main (non-MT/AT only)."
    ),
    parameters=LIST_USER_COURSES_SCHEMA,
    run=run_list_user_courses,
)

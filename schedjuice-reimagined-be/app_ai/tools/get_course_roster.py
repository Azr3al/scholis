"""Return course roster member names (teachers and students)."""
from __future__ import annotations

from typing import Any

from app_ai.links import compact_user_for_ai, get_current_org, with_course_link
from app_ai.tools.base import Tool, strict_object_schema
from app_ai.tools.resolve import resolve_accessible_course
from app_auth.models import User
from app_course.models import AssignedAsRole, CourseMembershipEvent, UserCourse

GET_COURSE_ROSTER_SCHEMA = strict_object_schema(
    properties={
        "course_id": {
            "type": "integer",
            "description": "Course id from a prior search_courses result.",
        },
        "query": {
            "type": "string",
            "description": (
                "Course title or code when course_id is unknown "
                "(e.g. 'CAE 36', 'PET 151')."
            ),
            "minLength": 1,
        },
        "member_type": {
            "type": "string",
            "enum": ["all", "teachers", "students"],
            "description": (
                "Which roster members to return. Default all. Use teachers when the user "
                "only asks about MT/AT/staff; use students for enrollment lists only."
            ),
        },
        "include_dropped_students": {
            "type": "boolean",
            "description": (
                "Include students removed from the course (from membership history). "
                "Default false (active enrollments only)."
            ),
        },
        "include_other_staff": {
            "type": "boolean",
            "description": (
                "Include teachers with OTHER seniority. Default false (MT/AT only)."
            ),
        },
    },
    required=[],
)


def _compact_student(user: User, *, org, is_removed: bool) -> dict[str, Any]:
    row = compact_user_for_ai(user, org=org)
    row["is_removed"] = is_removed
    return row


def _sort_members(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(rows, key=lambda row: (row.get("name") or "").lower())


def run_get_course_roster(args: dict[str, Any], user: User) -> dict[str, Any]:
    course_id = args.get("course_id")
    query = args.get("query")
    member_type = args.get("member_type") or "all"
    include_dropped_students = bool(args.get("include_dropped_students"))
    include_other_staff = bool(args.get("include_other_staff"))

    has_id = course_id is not None
    has_query = bool((query or "").strip())
    if has_id == has_query:
        return {
            "error": "validation_error",
            "message": "Provide exactly one of course_id or query.",
        }

    resolved = resolve_accessible_course(
        user=user, course_id=course_id, query=query
    )
    if resolved["status"] != "ok":
        return {
            "error": resolved["status"],
            **{k: v for k, v in resolved.items() if k != "status"},
        }

    course = resolved["course"]
    org = get_current_org()
    course_row = with_course_link(
        {"id": course.id, "title": course.title, "code": course.code},
        org=org,
    )

    include_teachers = member_type in ("all", "teachers")
    include_students = member_type in ("all", "students")

    main_teachers: list[dict[str, Any]] = []
    assistant_teachers: list[dict[str, Any]] = []
    other_staff: list[dict[str, Any]] = []
    students: list[dict[str, Any]] = []

    if include_teachers:
        teacher_rows = UserCourse.objects.filter(
            course_id=course.id,
            assigned_as=UserCourse.AssignedAs.TEACHER,
        ).select_related("user", "assigned_as_role")

        for enrollment in teacher_rows:
            role = enrollment.assigned_as_role
            seniority = getattr(role, "seniority", None)
            member = compact_user_for_ai(enrollment.user, org=org)
            if seniority == AssignedAsRole.Seniority.MAIN_TEACHER:
                main_teachers.append(member)
            elif seniority == AssignedAsRole.Seniority.ASSISTANT_TEACHER:
                assistant_teachers.append(member)
            elif include_other_staff and seniority == AssignedAsRole.Seniority.OTHER:
                other_staff.append(member)

        main_teachers = _sort_members(main_teachers)
        assistant_teachers = _sort_members(assistant_teachers)
        other_staff = _sort_members(other_staff)

    if include_students:
        active_enrollments = UserCourse.objects.filter(
            course_id=course.id,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        ).select_related("user")
        active_user_ids = {enrollment.user_id for enrollment in active_enrollments}

        students = [
            _compact_student(enrollment.user, org=org, is_removed=False)
            for enrollment in active_enrollments
        ]

        if include_dropped_students:
            removed_user_ids = (
                CourseMembershipEvent.objects.filter(
                    course_id=course.id,
                    event_type=CourseMembershipEvent.EventType.REMOVED,
                )
                .exclude(user_id__in=active_user_ids)
                .values_list("user_id", flat=True)
                .distinct()
            )
            removed_users = User.objects.filter(id__in=removed_user_ids)
            for removed_user in removed_users:
                students.append(
                    _compact_student(removed_user, org=org, is_removed=True)
                )

        students = _sort_members(students)

    out: dict[str, Any] = {
        "course": course_row,
        "member_type_requested": member_type,
        "counts": {},
    }

    if include_teachers:
        out["main_teachers"] = main_teachers
        out["assistant_teachers"] = assistant_teachers
        out["other_staff"] = other_staff
        out["counts"]["main_teachers"] = len(main_teachers)
        out["counts"]["assistant_teachers"] = len(assistant_teachers)
        out["counts"]["other_staff"] = len(other_staff)

    if include_students:
        out["students"] = students
        out["counts"]["students"] = len(students)

    return out


GET_COURSE_ROSTER_TOOL = Tool(
    name="get_course_roster",
    description=(
        "Get names of teachers and/or students on a specific course roster. "
        "Use for 'who is the MT/main teacher of course X?' — pass query X and read "
        "main_teachers (MT = Main Teacher; AT = Assistant Teacher in assistant_teachers). "
        "Use member_type=teachers when only staff are asked. Requires access to the course. "
        "Provide course_id from search_courses or query to look up the course. "
        "Success: course, main_teachers, assistant_teachers, students (per member_type), counts. "
        "Errors: validation_error (need exactly one of course_id/query), ambiguous (multiple "
        "matches — candidates have letter keys A/B/C), not_found, permission_denied. "
        "Use count_course_roster when the user only wants counts, not names."
    ),
    parameters=GET_COURSE_ROSTER_SCHEMA,
    run=run_get_course_roster,
)

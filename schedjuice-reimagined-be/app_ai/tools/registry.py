"""Canonical tool registry."""
from __future__ import annotations

from app_ai.tools.adjust_staff_points import ADJUST_STAFF_POINTS_TOOL
from app_ai.tools.assign_staff_to_course import ASSIGN_STAFF_TO_COURSE_TOOL
from app_ai.tools.base import Tool
from app_ai.tools.count_course_roster import COUNT_COURSE_ROSTER_TOOL
from app_ai.tools.count_courses_by_subject import COUNT_COURSES_BY_SUBJECT_TOOL
from app_ai.tools.count_organization import COUNT_ORGANIZATION_TOOL
from app_ai.tools.count_teacher_courses import COUNT_TEACHER_COURSES_TOOL
from app_ai.tools.enroll_student_in_course import ENROLL_STUDENT_IN_COURSE_TOOL
from app_ai.tools.get_course_roster import GET_COURSE_ROSTER_TOOL
from app_ai.tools.get_unpaid_students import GET_UNPAID_STUDENTS_TOOL
from app_ai.tools.get_staff_point_balances import GET_STAFF_POINT_BALANCES_TOOL
from app_ai.tools.remove_staff_from_course import REMOVE_STAFF_FROM_COURSE_TOOL
from app_ai.tools.remove_student_from_course import REMOVE_STUDENT_FROM_COURSE_TOOL
from app_ai.tools.intent import TurnIntent
from app_ai.tools.list_point_types import LIST_POINT_TYPES_TOOL
from app_ai.tools.list_user_courses import LIST_USER_COURSES_TOOL
from app_ai.tools.query_courses import QUERY_COURSES_TOOL, QUERY_COURSES_STARTING_TOOL
from app_ai.tools.search_courses import SEARCH_COURSES_TOOL
from app_ai.tools.search_users import SEARCH_USERS_TOOL
from app_ai.tools.set_ai_preferences import SET_AI_PREFERENCES_TOOL
from app_organization.models import Organization

TOOL_REGISTRY: dict[str, Tool] = {
    SEARCH_USERS_TOOL.name: SEARCH_USERS_TOOL,
    SEARCH_COURSES_TOOL.name: SEARCH_COURSES_TOOL,
    COUNT_ORGANIZATION_TOOL.name: COUNT_ORGANIZATION_TOOL,
    COUNT_TEACHER_COURSES_TOOL.name: COUNT_TEACHER_COURSES_TOOL,
    COUNT_COURSE_ROSTER_TOOL.name: COUNT_COURSE_ROSTER_TOOL,
    COUNT_COURSES_BY_SUBJECT_TOOL.name: COUNT_COURSES_BY_SUBJECT_TOOL,
    GET_COURSE_ROSTER_TOOL.name: GET_COURSE_ROSTER_TOOL,
    GET_UNPAID_STUDENTS_TOOL.name: GET_UNPAID_STUDENTS_TOOL,
    LIST_USER_COURSES_TOOL.name: LIST_USER_COURSES_TOOL,
    QUERY_COURSES_TOOL.name: QUERY_COURSES_TOOL,
    QUERY_COURSES_STARTING_TOOL.name: QUERY_COURSES_STARTING_TOOL,
    LIST_POINT_TYPES_TOOL.name: LIST_POINT_TYPES_TOOL,
    GET_STAFF_POINT_BALANCES_TOOL.name: GET_STAFF_POINT_BALANCES_TOOL,
    ADJUST_STAFF_POINTS_TOOL.name: ADJUST_STAFF_POINTS_TOOL,
    ENROLL_STUDENT_IN_COURSE_TOOL.name: ENROLL_STUDENT_IN_COURSE_TOOL,
    REMOVE_STUDENT_FROM_COURSE_TOOL.name: REMOVE_STUDENT_FROM_COURSE_TOOL,
    ASSIGN_STAFF_TO_COURSE_TOOL.name: ASSIGN_STAFF_TO_COURSE_TOOL,
    REMOVE_STAFF_FROM_COURSE_TOOL.name: REMOVE_STAFF_FROM_COURSE_TOOL,
    SET_AI_PREFERENCES_TOOL.name: SET_AI_PREFERENCES_TOOL,
}

_FEATURE_FLAGS = {
    "staff_points": lambda org: bool(getattr(org, "is_staff_points_enabled", False)),
}


def _org_allows_feature(org: Organization | None, feature: str | None) -> bool:
    if not feature:
        return True
    if org is None:
        return False
    checker = _FEATURE_FLAGS.get(feature)
    return bool(checker(org)) if checker else False


def list_tools() -> list[Tool]:
    return list(TOOL_REGISTRY.values())


def list_tools_for_cache(org: Organization | None) -> list[Tool]:
    """All tools eligible for this org (read + write), ignoring turn intent."""
    from app_ai.packs import resolve_tools_for_org

    return [
        tool
        for tool in resolve_tools_for_org(org)
        if _org_allows_feature(org, tool.requires_feature)
    ]


def list_tools_for_turn(*, intent: TurnIntent, org: Organization | None) -> list[Tool]:
    from app_ai.packs import resolve_tools_for_org

    selected: list[Tool] = []
    for tool in resolve_tools_for_org(org):
        if not _org_allows_feature(org, tool.requires_feature):
            continue
        if tool.always_available:
            selected.append(tool)
            continue
        if tool.exposure == "read":
            selected.append(tool)
        elif tool.exposure == "write" and intent == TurnIntent.WRITE:
            selected.append(tool)
    return selected


def get_tool(name: str) -> Tool:
    tool = TOOL_REGISTRY.get(name)
    if tool is None:
        raise KeyError(f"Unknown tool: {name}")
    return tool

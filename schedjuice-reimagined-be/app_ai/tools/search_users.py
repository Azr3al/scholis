"""Search users (staff/student) by name, alternate name, email, or code."""
from __future__ import annotations

from typing import Any

from app_ai.links import compact_user_for_ai, get_current_org
from app_ai.tools.self_reference import is_self_reference_query
from app_ai.tools.base import Tool, strict_object_schema
from app_auth.assistant_user_lookup import apply_assistant_user_lookup_filters
from app_auth.models import User
from app_auth.shortcuts_availability_helpers import filter_active_staff_users
from app_auth.user_scoping import scope_users_for_user
from app_auth.user_search import apply_user_search_q_with_meta

SEARCH_USERS_SCHEMA = strict_object_schema(
    properties={
        "query": {
            "type": "string",
            "description": "Name, alternate name, email, or code fragment.",
            "minLength": 1,
        },
        "role": {
            "type": "string",
            "description": "Optional filter: staff or student.",
            "enum": ["staff", "student"],
        },
        "limit": {
            "type": "integer",
            "description": "Maximum results (1-50).",
            "minimum": 1,
            "maximum": 50,
        },
    },
    required=["query"],
)


def _apply_role_filter(qs, role: str | None):
    if role == "student":
        return qs.filter(roles__contains=[User.UserRole.STUDENT])
    if role == "staff":
        return filter_active_staff_users(qs)
    return qs


def _compact_row(user: User, *, org) -> dict[str, Any]:
    row = compact_user_for_ai(user, org=org)
    row["alternative_name"] = user.alternative_name
    row["roles"] = list(user.roles or [])
    return row


def run_search_users(args: dict[str, Any], user: User) -> list[dict[str, Any]]:
    query = args["query"]
    role = args.get("role")
    limit = int(args.get("limit") or 20)
    org = get_current_org()
    if is_self_reference_query(query):
        return [_compact_row(user, org=org)]
    qs = apply_assistant_user_lookup_filters(scope_users_for_user(user))
    qs = _apply_role_filter(qs, role)
    qs, _ = apply_user_search_q_with_meta(qs, query)
    return [_compact_row(u, org=org) for u in qs[:limit]]


SEARCH_USERS_TOOL = Tool(
    name="search_users",
    description=(
        "Search staff or students by name, alternate name, email, communication email, "
        "or student/staff code. Communication email can be used for lookup but is never "
        "shown in replies. Use role=staff or role=student to narrow results."
    ),
    parameters=SEARCH_USERS_SCHEMA,
    run=run_search_users,
)

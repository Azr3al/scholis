"""Staff point balances for one staff member."""
from __future__ import annotations

from typing import Any

from app_ai.links import compact_user_for_ai
from app_ai.tools.base import Tool, strict_object_schema
from app_ai.tools.points_rbac import require_points_view
from app_ai.tools.resolve import enrich_staff_resolve_failure, resolve_staff_user
from app_auth.models import User
from app_points import services


def _ambiguous_subject_payload(resolved: dict[str, Any], query: str) -> dict[str, Any]:
    count = len(resolved.get("candidates") or [])
    return {
        "status": "ambiguous_subject",
        "query": query,
        "message": (
            f"{count} ambiguous users found with name {query!r}. "
            "Reply with A, B, C or state their full name."
        ),
        "candidates": resolved["candidates"],
    }


GET_STAFF_POINT_BALANCES_SCHEMA = strict_object_schema(
    properties={
        "user_id": {
            "type": "integer",
            "description": "Staff user id from search_users or a prior turn.",
        },
        "query": {
            "type": "string",
            "description": "Staff name, email, or code when user_id is unknown.",
            "minLength": 1,
        },
    },
    required=[],
)


def run_get_staff_point_balances(args: dict[str, Any], user: User) -> dict[str, Any]:
    user_id = args.get("user_id")
    query = args.get("query")
    has_id = user_id is not None
    has_query = bool((query or "").strip())
    if has_id == has_query:
        return {
            "error": "validation_error",
            "message": "Provide exactly one of user_id or query.",
        }

    resolved = resolve_staff_user(user_id=user_id, query=query)
    if resolved["status"] == "ambiguous":
        return _ambiguous_subject_payload(resolved, (query or "").strip())
    if resolved["status"] != "ok":
        return enrich_staff_resolve_failure(resolved=resolved, query=query)

    subject = resolved["user"]
    denied = require_points_view(actor=user, subject=subject)
    if denied:
        return denied

    balances = services.get_balances(subject)
    return {
        "subject": compact_user_for_ai(subject),
        "balances": {str(point_type_id): total for point_type_id, total in balances.items()},
    }


GET_STAFF_POINT_BALANCES_TOOL = Tool(
    name="get_staff_point_balances",
    description=(
        "Get point balances for a staff member. Provide user_id or query to identify "
        "the staff member. Not for students."
    ),
    parameters=GET_STAFF_POINT_BALANCES_SCHEMA,
    run=run_get_staff_point_balances,
    exposure="read",
    requires_feature="staff_points",
)

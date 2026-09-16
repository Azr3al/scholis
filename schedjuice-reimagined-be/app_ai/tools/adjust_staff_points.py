"""Award or deduct staff points via the append-only ledger."""
from __future__ import annotations

from typing import Any

from rest_framework.exceptions import ValidationError

from app_ai.disambiguation import save_pending
from app_ai.links import compact_user_for_ai
from app_ai.tools.base import Tool, strict_object_schema
from app_ai.tools.points_rbac import require_points_award
from app_ai.tools.resolve import enrich_staff_resolve_failure, resolve_point_type, resolve_staff_user
from app_auth.models import User
from app_points import services


def _feature_disabled() -> dict[str, Any]:
    return {
        "error": "feature_disabled",
        "message": "Staff points is disabled for this organization.",
    }


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


def _ambiguous_point_type_payload(resolved: dict[str, Any], query: str) -> dict[str, Any]:
    count = len(resolved.get("candidates") or [])
    return {
        "status": "ambiguous_point_type",
        "query": query,
        "message": (
            f"{count} point types match {query!r}. "
            "Reply with A, B, C or state the full name."
        ),
        "candidates": resolved["candidates"],
    }


ADJUST_STAFF_POINTS_SCHEMA = strict_object_schema(
    properties={
        "user_id": {
            "type": "integer",
            "description": (
                "Staff user id when already resolved. Exactly one of user_id or "
                "query is required on every call."
            ),
        },
        "query": {
            "type": "string",
            "description": (
                "Staff name, email, or code when user_id is unknown. Exactly one "
                "of user_id or query is required on every call."
            ),
            "minLength": 1,
        },
        "point_type_id": {
            "type": "integer",
            "description": (
                "Point type id when already resolved. Exactly one of "
                "point_type_id or point_type_query is required on every call."
            ),
        },
        "point_type_query": {
            "type": "string",
            "description": (
                "Point type name fragment when point_type_id is unknown. Exactly "
                "one of point_type_id or point_type_query is required; call "
                "list_point_types first if the type name is unknown."
            ),
            "minLength": 1,
        },
        "direction": {
            "type": "string",
            "enum": ["add", "deduct"],
            "description": (
                "Required. Use exactly add or deduct. Do not pass signed amounts "
                "or synonyms like change."
            ),
        },
        "amount": {
            "type": "integer",
            "description": (
                "Required. Positive integer count of points. Sign comes from "
                "direction, not from amount."
            ),
            "minimum": 1,
        },
        "note": {
            "type": "string",
            "description": (
                "Required. Reason for the adjustment (min 3 characters). Do not "
                "use reason."
            ),
            "minLength": 3,
        },
    },
    required=["direction", "amount", "note"],
)


def _normalize_adjust_staff_points_args(args: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(args)
    if "reason" in normalized and "note" not in normalized:
        normalized["note"] = normalized.pop("reason")
    return normalized


def validate_adjust_staff_points_args(args: dict[str, Any]) -> dict[str, Any]:
    from app_ai.tools.validation import validate_tool_args

    return validate_tool_args(
        ADJUST_STAFF_POINTS_SCHEMA,
        _normalize_adjust_staff_points_args(args),
    )


def run_adjust_staff_points(
    args: dict[str, Any],
    user: User,
    *,
    channel_key: str | None = None,
    org=None,
) -> dict[str, Any]:
    if org is not None and not getattr(org, "is_staff_points_enabled", False):
        return _feature_disabled()

    denied = require_points_award(user)
    if denied:
        return denied

    user_id = args.get("user_id")
    query = args.get("query")
    has_user_id = user_id is not None
    has_query = bool((query or "").strip())
    if has_user_id == has_query:
        return {
            "error": "validation_error",
            "message": "Provide exactly one of user_id or query.",
        }

    point_type_id = args.get("point_type_id")
    point_type_query = args.get("point_type_query")
    has_type_id = point_type_id is not None
    has_type_query = bool((point_type_query or "").strip())
    if has_type_id == has_type_query:
        return {
            "error": "validation_error",
            "message": "Provide exactly one of point_type_id or point_type_query.",
        }

    direction = args.get("direction")
    amount = int(args.get("amount") or 0)
    note = args.get("note") or ""
    if direction not in {"add", "deduct"}:
        return {"error": "validation_error", "message": "direction must be add or deduct."}
    if amount < 1:
        return {"error": "validation_error", "message": "amount must be at least 1."}

    partial_args = {
        "direction": direction,
        "amount": amount,
        "note": note,
    }
    if has_user_id:
        partial_args["user_id"] = user_id
    else:
        partial_args["query"] = query
    if has_type_id:
        partial_args["point_type_id"] = point_type_id
    else:
        partial_args["point_type_query"] = point_type_query

    resolved_user = resolve_staff_user(user_id=user_id, query=query)
    if resolved_user["status"] == "ambiguous":
        payload = _ambiguous_subject_payload(resolved_user, (query or "").strip())
        if channel_key:
            save_pending(
                user=user,
                channel_key=channel_key,
                tool_name="adjust_staff_points",
                pending_field="subject",
                partial_args=partial_args,
                candidates=payload["candidates"],
            )
        return payload
    if resolved_user["status"] != "ok":
        return enrich_staff_resolve_failure(
            resolved=resolved_user,
            query=query,
        )

    resolved_type = resolve_point_type(
        point_type_id=point_type_id,
        query=point_type_query,
        active_only=True,
    )
    if resolved_type["status"] == "ambiguous":
        payload = _ambiguous_point_type_payload(
            resolved_type,
            (point_type_query or "").strip(),
        )
        partial_args["user_id"] = resolved_user["user"].id
        partial_args.pop("query", None)
        if channel_key:
            save_pending(
                user=user,
                channel_key=channel_key,
                tool_name="adjust_staff_points",
                pending_field="point_type",
                partial_args=partial_args,
                candidates=payload["candidates"],
            )
        return payload
    if resolved_type["status"] != "ok":
        return {
            "error": resolved_type["status"],
            **{k: v for k, v in resolved_type.items() if k != "status"},
        }

    subject = resolved_user["user"]
    point_type = resolved_type["point_type"]
    delta = amount if direction == "add" else -amount

    try:
        tx = services.post_transaction(
            subject=subject,
            actor=user,
            point_type=point_type,
            delta=delta,
            note=note,
        )
    except ValidationError as exc:
        detail = exc.detail
        if isinstance(detail, dict):
            message = "; ".join(
                f"{key}: {value[0] if isinstance(value, list) else value}"
                for key, value in detail.items()
            )
        else:
            message = str(detail)
        return {"error": "validation_error", "message": message}

    balances = services.get_balances(subject)
    return {
        "status": "ok",
        "transaction": {
            "id": tx.id,
            "delta": tx.delta,
            "note": tx.note,
            "point_type": {"id": point_type.id, "name": point_type.name},
        },
        "subject": compact_user_for_ai(subject),
        "balances": {str(point_type_id): total for point_type_id, total in balances.items()},
    }


ADJUST_STAFF_POINTS_TOOL = Tool(
    name="adjust_staff_points",
    description=(
        "Award or deduct staff points. Requires points.award. Staff only — not students. "
        "Allowed arguments: user_id, query, point_type_id, point_type_query, direction, "
        "amount, note. Every call must include direction, amount, and note, plus exactly "
        "one of user_id or query and exactly one of point_type_id or point_type_query. "
        "Example: "
        '{"query": "James", "point_type_query": "Merit", "direction": "add", '
        '"amount": 5, "note": "Great teamwork"}. '
        "Do not use adjustment, change, delta, points, or reason — only direction, amount, "
        "and note."
    ),
    parameters=ADJUST_STAFF_POINTS_SCHEMA,
    run=run_adjust_staff_points,
    exposure="write",
    requires_feature="staff_points",
)
ADJUST_STAFF_POINTS_TOOL.validate_args = validate_adjust_staff_points_args

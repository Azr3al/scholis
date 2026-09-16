"""Update the calling user's AI assistant preferences."""
from __future__ import annotations

from typing import Any

from app_ai.tools.base import Tool, strict_object_schema
from app_ai.user_preferences import preferences_to_dict, upsert_preferences
from app_auth.models import User

SCHEMA = strict_object_schema(
    properties={
        "response_language": {
            "type": "string",
            "enum": ["auto", "en", "my"],
            "description": "Language for assistant replies.",
        },
        "tone": {
            "type": "string",
            "enum": ["default", "formal", "casual"],
        },
        "verbosity": {
            "type": "string",
            "enum": ["default", "brief", "detailed"],
        },
        "preferred_name": {
            "type": "string",
            "description": "How to address the user in replies.",
            "maxLength": 64,
        },
        "clear_preferred_name": {
            "type": "boolean",
            "description": "When true, remove the stored preferred name.",
        },
    },
    required=[],
)


def run_set_ai_preferences(
    args: dict[str, Any],
    user: User,
    *,
    channel_key: str | None = None,
    org=None,
) -> dict[str, Any]:
    del channel_key, org
    updates = {
        k: v
        for k, v in args.items()
        if k
        in {
            "response_language",
            "tone",
            "verbosity",
            "preferred_name",
            "clear_preferred_name",
        }
        and v is not None
    }
    if not updates:
        return {"status": "error", "message": "At least one preference field is required."}
    try:
        prefs = upsert_preferences(user, **updates)
    except ValueError as exc:
        return {"status": "error", "message": str(exc)}
    return {
        "status": "ok",
        "preferences": preferences_to_dict(prefs, user_id=user.id),
    }


SET_AI_PREFERENCES_TOOL = Tool(
    name="set_ai_preferences",
    description=(
        "Update the calling user's AI preferences: response language, tone, "
        "verbosity, or preferred name. Call when the user asks to change how "
        "you speak or address them."
    ),
    parameters=SCHEMA,
    run=run_set_ai_preferences,
    exposure="write",
    always_available=True,
)

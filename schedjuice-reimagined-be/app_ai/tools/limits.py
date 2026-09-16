"""Central limits for tool results returned to the LLM."""
from __future__ import annotations

import copy
import json
from typing import Any

from django.conf import settings

_LIST_KEYS = ("courses", "results", "groups", "items", "users", "enrollments")


def _default_max_items() -> int:
    return int(getattr(settings, "AI_TOOL_RESULT_MAX_ITEMS", 50))


def _default_max_chars() -> int:
    return int(getattr(settings, "AI_TOOL_RESULT_MAX_CHARS", 8000))


def _trim_list(items: list[Any], *, max_items: int) -> tuple[list[Any], bool]:
    if len(items) <= max_items:
        return items, False
    return items[:max_items], True


def _clamp_dict_lists(payload: dict[str, Any], *, max_items: int) -> tuple[dict[str, Any], bool]:
    trimmed = False
    result = copy.deepcopy(payload)

    if "groups" in result and isinstance(result["groups"], list):
        groups, groups_trimmed = _trim_list(result["groups"], max_items=max_items)
        result["groups"] = groups
        trimmed = trimmed or groups_trimmed
        for group in result["groups"]:
            if not isinstance(group, dict):
                continue
            courses = group.get("courses")
            if isinstance(courses, list):
                group["courses"], courses_trimmed = _trim_list(
                    courses, max_items=max_items
                )
                trimmed = trimmed or courses_trimmed

    for key in _LIST_KEYS:
        if key == "groups":
            continue
        value = result.get(key)
        if isinstance(value, list):
            result[key], key_trimmed = _trim_list(value, max_items=max_items)
            trimmed = trimmed or key_trimmed

    return result, trimmed


def _enforce_char_ceiling(payload: Any, *, max_chars: int) -> tuple[Any, bool]:
    serialized = json.dumps(payload, default=str)
    if len(serialized) <= max_chars:
        return payload, False

    if isinstance(payload, dict):
        trimmed_payload = copy.deepcopy(payload)
        for key in _LIST_KEYS:
            value = trimmed_payload.get(key)
            if isinstance(value, list) and len(value) > 1:
                trimmed_payload[key] = value[:1]
                serialized = json.dumps(trimmed_payload, default=str)
                if len(serialized) <= max_chars:
                    trimmed_payload["truncated"] = True
                    return trimmed_payload, True
        if "groups" in trimmed_payload and isinstance(trimmed_payload["groups"], list):
            trimmed_payload["groups"] = trimmed_payload["groups"][:1]
            for group in trimmed_payload["groups"]:
                if isinstance(group, dict) and isinstance(group.get("courses"), list):
                    group["courses"] = group["courses"][:1]
            serialized = json.dumps(trimmed_payload, default=str)
            if len(serialized) <= max_chars:
                trimmed_payload["truncated"] = True
                return trimmed_payload, True

    if isinstance(payload, list) and len(payload) > 1:
        trimmed_payload = payload[:1]
        if len(json.dumps(trimmed_payload, default=str)) <= max_chars:
            return {"results": trimmed_payload, "truncated": True}, True

    return {"truncated": True, "error": "Tool result too large to include."}, True


def clamp_tool_payload(
    payload: Any,
    *,
    max_items: int | None = None,
    max_chars: int | None = None,
) -> Any:
    item_limit = max_items if max_items is not None else _default_max_items()
    char_limit = max_chars if max_chars is not None else _default_max_chars()

    if isinstance(payload, list):
        trimmed_list, truncated = _trim_list(payload, max_items=item_limit)
        if truncated:
            payload = {"results": trimmed_list, "truncated": True}
        else:
            payload = trimmed_list
    elif isinstance(payload, dict):
        payload, truncated = _clamp_dict_lists(payload, max_items=item_limit)
        if truncated:
            payload = {**payload, "truncated": True}
    else:
        return payload

    payload, char_truncated = _enforce_char_ceiling(payload, max_chars=char_limit)
    if char_truncated and isinstance(payload, dict):
        payload.setdefault("truncated", True)
    return payload

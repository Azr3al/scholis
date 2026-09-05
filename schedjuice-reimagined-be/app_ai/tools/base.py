"""Canonical AI tool contract (single source of truth)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Literal


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]
    run: Callable[..., Any]
    exposure: Literal["read", "write"] = "read"
    requires_feature: str | None = None
    always_available: bool = False

    def validate_args(self, args: dict[str, Any]) -> dict[str, Any]:
        from app_ai.tools.validation import validate_tool_args

        return validate_tool_args(self.parameters, args)


def strict_object_schema(
    *,
    properties: dict[str, Any],
    required: list[str],
) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": False,
    }

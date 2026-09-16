"""Validate tool arguments against canonical JSON schemas."""
from __future__ import annotations

from typing import Any


class ToolValidationError(ValueError):
    pass


def validate_tool_args(schema: dict[str, Any], args: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(args, dict):
        raise ToolValidationError("Tool arguments must be a JSON object.")

    properties = schema.get("properties", {})
    required = schema.get("required", [])
    allowed_names = ", ".join(sorted(properties.keys()))

    if schema.get("additionalProperties") is False:
        allowed = set(properties.keys())
        extra = set(args.keys()) - allowed
        if extra:
            raise ToolValidationError(
                f"Unexpected arguments: {', '.join(sorted(extra))}. "
                f"Allowed: {allowed_names}."
            )

    validated: dict[str, Any] = {}

    for key in required:
        if key not in args or args[key] is None:
            required_names = ", ".join(required)
            raise ToolValidationError(
                f"Missing required argument: {key}. Required: {required_names}."
            )

    for key, prop in properties.items():
        if key not in args:
            continue
        value = args[key]
        if value is None:
            if key in required:
                required_names = ", ".join(required)
                raise ToolValidationError(
                    f"Missing required argument: {key}. Required: {required_names}."
                )
            continue
        validated[key] = _validate_value(key, value, prop)

    for key in required:
        if key not in validated and key in args:
            validated[key] = args[key]

    return validated


def _validate_value(name: str, value: Any, prop: dict[str, Any]) -> Any:
    expected = prop.get("type")
    if expected == "string":
        if not isinstance(value, str):
            raise ToolValidationError(f"{name} must be a string.")
        value = value.strip()
        if prop.get("minLength", 0) and len(value) < prop["minLength"]:
            raise ToolValidationError(f"{name} is too short.")
        if "enum" in prop and value not in prop["enum"]:
            raise ToolValidationError(f"{name} must be one of: {prop['enum']}.")
        return value
    if expected == "integer":
        if isinstance(value, bool) or not isinstance(value, int):
            raise ToolValidationError(f"{name} must be an integer.")
        minimum = prop.get("minimum")
        maximum = prop.get("maximum")
        if minimum is not None and value < minimum:
            raise ToolValidationError(f"{name} must be >= {minimum}.")
        if maximum is not None and value > maximum:
            raise ToolValidationError(f"{name} must be <= {maximum}.")
        return value
    raise ToolValidationError(f"Unsupported schema type for {name}.")

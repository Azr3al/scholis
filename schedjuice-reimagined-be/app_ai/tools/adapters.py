"""Render canonical tool contracts for OpenAI consumers."""
from __future__ import annotations

from typing import Any

from app_ai.tools.base import Tool
from app_ai.tools.registry import list_tools


def to_openai(tools: list[Tool] | None = None) -> list[dict[str, Any]]:
    items = tools or list_tools()
    return [
        {
            "type": "function",
            "name": tool.name,
            "description": tool.description,
            "parameters": tool.parameters,
        }
        for tool in items
    ]

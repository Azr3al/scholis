from __future__ import annotations

from app_ai.client import OpenAIClient
from app_organization.models import Organization


def classify_capability_gap(
    *,
    prompt: str,
    response_text: str,
    tool_calls: list[dict],
    available_tool_names: list[str],
    org: Organization,
    user,
    conversation_history: list[dict[str, str]] | None = None,
) -> dict:
    client = OpenAIClient()
    return client.judge_capability_gap(
        prompt=prompt,
        response_text=response_text,
        tool_calls=tool_calls,
        available_tool_names=available_tool_names,
        conversation_history=conversation_history or [],
        org_name=org.name,
        user=user,
    )

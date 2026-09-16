from __future__ import annotations

from app_ai.capability_gap.constants import (
    JUDGE_HISTORY_MODEL_MAX_CHARS,
    JUDGE_HISTORY_USER_MAX_CHARS,
    JUDGE_PROMPT_MAX_CHARS,
    JUDGE_RESPONSE_MAX_CHARS,
    JUDGE_TRUNCATION_SUFFIX,
)


def truncate_judge_text(value: str | None, limit: int) -> str:
    text = (value or "").strip()
    if len(text) <= limit:
        return text
    prefix_len = limit - len(JUDGE_TRUNCATION_SUFFIX)
    return text[:prefix_len] + JUDGE_TRUNCATION_SUFFIX


def _history_text_limit(role: str) -> int:
    if role == "model":
        return JUDGE_HISTORY_MODEL_MAX_CHARS
    return JUDGE_HISTORY_USER_MAX_CHARS


def truncate_judge_payload(
    *,
    prompt: str,
    response_text: str,
    tool_calls: list[dict],
    available_tool_names: list[str],
    conversation_history: list[dict[str, str]] | None,
) -> dict:
    capped_history: list[dict[str, str]] = []
    for turn in conversation_history or []:
        role = str(turn.get("role") or "user")
        capped_history.append(
            {
                "role": role,
                "text": truncate_judge_text(
                    turn.get("text"),
                    _history_text_limit(role),
                ),
            }
        )
    return {
        "prompt": truncate_judge_text(prompt, JUDGE_PROMPT_MAX_CHARS),
        "response_text": truncate_judge_text(response_text, JUDGE_RESPONSE_MAX_CHARS),
        "tool_calls": tool_calls,
        "available_tool_names": available_tool_names,
        "conversation_history": capped_history,
    }

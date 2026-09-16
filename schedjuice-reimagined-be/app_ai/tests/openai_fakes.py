"""Builders for fake OpenAI Responses objects used in client tests."""
from __future__ import annotations

import json
from types import SimpleNamespace


def fake_usage(
    *,
    input_tokens: int = 0,
    cached: int = 0,
    cache_write: int = 0,
    output_tokens: int = 0,
    reasoning: int = 0,
):
    return SimpleNamespace(
        input_tokens=input_tokens,
        input_tokens_details=SimpleNamespace(
            cached_tokens=cached,
            cache_write_tokens=cache_write,
        ),
        output_tokens=output_tokens,
        output_tokens_details=SimpleNamespace(reasoning_tokens=reasoning),
        total_tokens=input_tokens + output_tokens,
    )


def reasoning_item(text: str = ""):
    summary = [SimpleNamespace(type="summary_text", text=text)] if text else []
    return SimpleNamespace(type="reasoning", summary=summary)


def function_call_item(name: str, args: dict, call_id: str = "call_1"):
    return SimpleNamespace(
        type="function_call",
        name=name,
        call_id=call_id,
        arguments=json.dumps(args),
    )


def message_item(text: str):
    return SimpleNamespace(
        type="message",
        content=[SimpleNamespace(type="output_text", text=text)],
    )


def fake_response(output, usage=None, status: str = "completed"):
    return SimpleNamespace(
        output=list(output),
        usage=usage or fake_usage(),
        status=status,
        incomplete_details=None,
    )

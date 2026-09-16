"""Request-scoped context for nplusone JSONL logging."""
from __future__ import annotations

import os
from contextvars import ContextVar
from typing import Any

_nplusone_context: ContextVar[dict[str, Any] | None] = ContextVar(
    "nplusone_context", default=None
)


def get_context() -> dict[str, Any]:
    ctx = _nplusone_context.get()
    return dict(ctx) if ctx is not None else {}


def set_context(**kwargs: Any) -> None:
    _nplusone_context.set(dict(kwargs))


def update_context(**kwargs: Any) -> None:
    current = get_context()
    current.update(kwargs)
    _nplusone_context.set(current)


def clear_context() -> None:
    _nplusone_context.set(None)


def resolve_run_id(request) -> str:
    header = request.META.get("HTTP_X_NPLUSONE_RUN_ID")
    if header:
        return str(header).strip()
    env_run_id = os.environ.get("NPLUSONE_RUN_ID")
    if env_run_id:
        return env_run_id.strip()
    return "manual"

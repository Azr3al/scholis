from __future__ import annotations

import re

from app_ai.guardrails.types import HeuristicVerdict

_SCHOOL_KEYWORDS = re.compile(
    r"\b("
    r"student|students|teacher|teachers|staff|course|courses|class|classes|"
    r"schedule|attendance|payment|payments|enroll|grade|program|intake|"
    r"roster|subject|section|parent|parents|admin|school|timetable|lesson|teach|teaches"
    r")\b",
    re.IGNORECASE,
)

_MATH_PATTERN = re.compile(
    r"(?:"
    r"what\s+is\s+[\d\s+\-*/().]+[\?\!]?"
    r"|^[\d\s+\-*/().=]+\?$"
    r"|\bcalculate\b.*[\d+\-*/]"
    r"|\b\d+\s*[\+\-\*/]\s*\d+"
    r")",
    re.IGNORECASE,
)

_TRIVIA_PATTERN = re.compile(
    r"\b(capital of|who won|when was|how old is|trivia|fun fact)\b",
    re.IGNORECASE,
)

_CREATIVE_PATTERN = re.compile(
    r"\b(write (?:me )?(?:a )?(?:poem|story|essay|song)|explain quantum|"
    r"help me with my homework essay)\b",
    re.IGNORECASE,
)

_FOLLOW_UP_PATTERN = re.compile(
    r"\b(what about|tell me more|and theirs|their courses|those students|"
    r"same (?:person|student|teacher))\b",
    re.IGNORECASE,
)


def scan_heuristics(
    prompt: str,
    *,
    history: list[dict[str, str]] | None = None,
) -> HeuristicVerdict:
    text = (prompt or "").strip()
    if not text:
        return HeuristicVerdict.REJECT

    if (
        _MATH_PATTERN.search(text)
        or _TRIVIA_PATTERN.search(text)
        or _CREATIVE_PATTERN.search(text)
    ):
        return HeuristicVerdict.REJECT

    if _SCHOOL_KEYWORDS.search(text):
        return HeuristicVerdict.ALLOW

    if history and _has_in_scope_history(history):
        if _FOLLOW_UP_PATTERN.search(text) or len(text.split()) <= 8:
            return HeuristicVerdict.ALLOW

    return HeuristicVerdict.UNCERTAIN


def _has_in_scope_history(history: list[dict[str, str]]) -> bool:
    if len(history) < 2:
        return False
    last_model = history[-1] if history[-1].get("role") == "model" else None
    if last_model is None:
        for turn in reversed(history):
            if turn.get("role") == "model" and (turn.get("text") or "").strip():
                last_model = turn
                break
    return bool(last_model and (last_model.get("text") or "").strip())

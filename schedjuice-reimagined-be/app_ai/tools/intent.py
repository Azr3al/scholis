"""Read vs write intent and disambiguation reply parsing."""
from __future__ import annotations

import re
from enum import Enum
from typing import Any

_WRITE_PATTERN = re.compile(
    r"\b("
    r"award|deduct|give|remove|add|subtract|grant|take away"
    r")\b.*\b(points?|merit|demerit)\b|"
    r"\b(points?|merit)\b.*\b(award|deduct|give|remove|add)\b|"
    r"\b(enroll|unenroll|add student|remove student|assign teacher|add teacher|"
    r"remove teacher|assign staff|remove staff)\b|"
    r"\bassign\b.+\bto\b|"
    r"\bremove\b.+\bfrom\b|"
    r"\b(add|put)\b.+\b(on|to)\b|"
    r"\b(try again|retry|do it again)\b|"
    r"\b(give|award|grant)\b.+\b(one|\d+|an?)\s+(extra|more)\b|"
    r"\b(give|award|grant)\b.+\b(one|\d+)\b.*\b(for|because)\b|"
    r"\bbonus\b",
    re.IGNORECASE,
)

_CANCEL_PATTERN = re.compile(
    r"^(?:cancel|nevermind|never mind|abort|stop|no)$",
    re.IGNORECASE,
)
_LETTER_REPLY = re.compile(r"^[A-Z](?:[.:\)]|\s|$)", re.IGNORECASE)


class TurnIntent(str, Enum):
    READ = "read"
    WRITE = "write"


def classify_turn_intent(prompt: str, *, force_write: bool = False) -> TurnIntent:
    if force_write:
        return TurnIntent.WRITE
    text = (prompt or "").strip()
    if _WRITE_PATTERN.search(text):
        return TurnIntent.WRITE
    return TurnIntent.READ


def is_cancel_reply(prompt: str) -> bool:
    return bool(_CANCEL_PATTERN.match((prompt or "").strip()))


def parse_disambiguation_reply(
    prompt: str,
    *,
    candidates: list[dict[str, Any]],
) -> int | None:
    text = (prompt or "").strip()
    if not text or not candidates:
        return None
    if _LETTER_REPLY.match(text):
        letter = text[0].upper()
        for candidate in candidates:
            if candidate.get("key", "").upper() == letter:
                return int(candidate["id"])
    lower = text.lower()
    for candidate in candidates:
        name = (candidate.get("name") or "").strip()
        if name and name.lower() == lower:
            return int(candidate["id"])
    if text.isdigit():
        wanted = int(text)
        ids = {int(candidate["id"]) for candidate in candidates}
        if wanted in ids:
            return wanted
    return None

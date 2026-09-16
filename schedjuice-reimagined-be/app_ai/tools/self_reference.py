"""Detect first-person queries that refer to the authenticated actor."""
from __future__ import annotations

_SELF_EXACT = frozenset({"me", "myself", "i", "my"})


def is_self_reference_query(q: str) -> bool:
    text = (q or "").strip().lower()
    if not text:
        return False
    if text in _SELF_EXACT:
        return True
    if text.startswith("my "):
        return True
    return False

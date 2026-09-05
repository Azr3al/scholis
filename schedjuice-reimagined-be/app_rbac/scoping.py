from __future__ import annotations
from typing import Callable


def has_read_breadth(domain: str, held: set[str]) -> bool:
    return f"{domain}.view_all" in held or f"{domain}.manage_all" in held


def scope(domain: str, queryset, held: set[str], narrow: Callable):
    """Return full queryset if the user has read breadth, else the narrowed queryset."""
    if has_read_breadth(domain, held):
        return queryset
    return narrow(queryset)


def can_write_object(domain: str, held: set[str], *, is_connected: bool) -> bool:
    return f"{domain}.manage_all" in held or is_connected

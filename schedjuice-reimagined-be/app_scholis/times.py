"""
Parsing the timestamps Scholis sends.

Shared because three modules need it and a subtly different parser in each is how
a timezone ends up applied twice.
"""
from __future__ import annotations

from datetime import datetime
from django.utils.dateparse import parse_datetime


def parse_when(value: object) -> datetime | None:
    """
    ISO-8601 to an aware datetime, or None if absent or unparseable.

    Scholis serialises with a trailing ``Z``. Django's ``parse_datetime`` wants an
    explicit ``+00:00`` offset and returns None for ``Z``, so the suffix is
    normalised rather than the parser being replaced -- a naive datetime stored in
    an aware column is a bug that only shows up when a server moves timezone.
    """
    if not isinstance(value, str) or not value:
        return None
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    return parse_datetime(normalized)


__all__ = ["parse_when"]

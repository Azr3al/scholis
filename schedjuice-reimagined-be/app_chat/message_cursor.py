"""Shared cursor pagination for course chat and DM message lists."""

from __future__ import annotations

from django.db.models import QuerySet
from rest_framework.request import Request

DEFAULT_MESSAGE_LIST_SIZE = 100
CURSOR_MESSAGE_PAGE_SIZE = 50
MAX_MESSAGE_PAGE_SIZE = 200


def parse_message_list_size(
    request: Request, *, default: int = DEFAULT_MESSAGE_LIST_SIZE
) -> int:
    raw = request.query_params.get("size", default)
    try:
        size = int(raw)
    except (TypeError, ValueError):
        size = default
    return min(max(1, size), MAX_MESSAGE_PAGE_SIZE)


def parse_before_id(request: Request) -> int | None:
    raw = request.query_params.get("before_id")
    if raw is None or raw == "":
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def fetch_older_messages(queryset: QuerySet, before_id: int, size: int) -> list:
    """Return ascending-ordered rows strictly older than ``before_id``."""
    rows = list(
        queryset.filter(id__lt=before_id).order_by("-created_at", "-id")[:size]
    )
    rows.reverse()
    return rows


def fetch_latest_messages(queryset: QuerySet, size: int) -> list:
    """Return ascending-ordered latest ``size`` rows."""
    rows = list(queryset.order_by("-created_at", "-id")[:size])
    rows.reverse()
    return rows

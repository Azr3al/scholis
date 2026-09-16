"""Org-local calendar helpers for AI tools and prompts."""
from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo


def org_today(org) -> date:
    tz = ZoneInfo(getattr(org, "timezone", None) or "UTC")
    return datetime.now(tz).date()


def build_org_datetime_context(org) -> str:
    today = org_today(org)
    return (
        "Current date/time context:\n"
        f"- Today (school timezone): {today.strftime('%A, %d %B %Y')}\n"
        f"- Current year: {today.year}\n"
        "- When no year is specified, always assume the current year above. "
        "Never state or assume any other year unless the user explicitly gives one "
        "or a tool result specifies it."
    )

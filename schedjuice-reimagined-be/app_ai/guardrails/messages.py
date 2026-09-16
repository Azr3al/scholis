from __future__ import annotations

from app_organization.models import Organization

_BLOCKED_TEMPLATE = (
    "I can only help with {org_name} operations — things like students, staff, "
    "courses, schedules, and attendance. Try rephrasing your question."
)

_RATE_LIMITED_TEMPLATE = (
    "You're sending requests too quickly. Please wait {retry_after} seconds and try again."
)


def blocked_message(org: Organization) -> str:
    return _BLOCKED_TEMPLATE.format(org_name=org.name)


def rate_limited_message(retry_after: int) -> str:
    return _RATE_LIMITED_TEMPLATE.format(retry_after=retry_after)

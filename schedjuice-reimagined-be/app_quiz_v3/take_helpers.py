"""Shared helpers for quiz take flow (avoid circular imports between views and perms)."""

from __future__ import annotations

from uuid import UUID

from django.http import HttpRequest
from django.utils import timezone


def is_uuid_v4(code: str | UUID) -> bool:
    """URL `<uuid:code>` may be a uuid.UUID instance; normalize before checks."""
    try:
        u = code if isinstance(code, UUID) else UUID(str(code).strip())
    except (ValueError, AttributeError, TypeError):
        return False
    return u.version == 4


def quiz_in_take_window(quiz) -> bool:
    now = timezone.now()
    if quiz.activation_date and now < quiz.activation_date:
        return False
    if quiz.expiry_date and now > quiz.expiry_date:
        return False
    return True


def client_ip_from_request(request: HttpRequest) -> str | None:
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        first = xff.split(",")[0].strip()
        return first or None
    addr = request.META.get("REMOTE_ADDR")
    return str(addr).strip() if addr else None


def user_agent_from_request(request: HttpRequest) -> str:
    return (request.META.get("HTTP_USER_AGENT") or "")[:512]

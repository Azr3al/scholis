"""RBAC guards for AI tools — return permission_denied dict or None."""
from __future__ import annotations

from typing import Any

from app_rbac import scoping
from app_rbac.resolution import effective_permissions


def _denied(message: str) -> dict[str, Any]:
    return {"error": "permission_denied", "message": message}


def require_user_read_breadth(user) -> dict[str, Any] | None:
    held = set(effective_permissions(user))
    if scoping.has_read_breadth("user", held):
        return None
    return _denied("Organization-wide user counts require user.view_all.")


def require_course_read_breadth(user) -> dict[str, Any] | None:
    held = set(effective_permissions(user))
    if scoping.has_read_breadth("course", held):
        return None
    return _denied("Organization-wide course counts require course.view_all.")


def require_user_or_course_read_breadth(user) -> dict[str, Any] | None:
    held = set(effective_permissions(user))
    if scoping.has_read_breadth("user", held) or scoping.has_read_breadth("course", held):
        return None
    return _denied("Teacher course counts require user.view_all or course.view_all.")

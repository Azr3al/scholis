"""RBAC guards for AI points tools."""
from __future__ import annotations

from typing import Any

from app_points.services import is_staff_user
from app_rbac.resolution import effective_permissions


def _denied(message: str) -> dict[str, Any]:
    return {"error": "permission_denied", "message": message}


def require_points_view(*, actor, subject) -> dict[str, Any] | None:
    if actor.id == subject.id and is_staff_user(subject):
        return None
    if "points.view" in set(effective_permissions(actor)):
        return None
    return _denied("Viewing staff points requires points.view.")


def require_points_award(user) -> dict[str, Any] | None:
    if "points.award" in set(effective_permissions(user)):
        return None
    return _denied("Awarding or deducting points requires points.award.")

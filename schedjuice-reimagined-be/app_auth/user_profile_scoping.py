"""Helpers for self-service profile updates on PUT /users/{id}."""
from __future__ import annotations

from rest_framework.exceptions import PermissionDenied

from app_auth.models import User
from app_rbac.resolution import effective_permissions


def is_self_user_target(actor: User | None, target_id: int | str | None) -> bool:
    if actor is None or target_id is None:
        return False
    try:
        return actor.id == int(target_id)
    except (TypeError, ValueError):
        return False


def actor_may_self_edit_profile(actor: User) -> bool:
    return "user.update_own" in set(effective_permissions(actor))


def check_self_profile_update(actor: User, target: User) -> None:
    if actor.id != target.id:
        raise PermissionDenied("Not allowed for this user.")
    if not actor_may_self_edit_profile(actor):
        raise PermissionDenied("You don't have permission to edit your profile.")

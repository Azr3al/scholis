"""RBAC helpers for per-user AI usage and memory endpoints."""
from __future__ import annotations

from app_rbac.resolution import effective_permissions


def _is_self(actor, target_user_id: int) -> bool:
    return actor is not None and actor.id == target_user_id


def require_ai_usage_view(actor, target_user_id: int) -> bool:
    held = set(effective_permissions(actor))
    if _is_self(actor, target_user_id):
        return "ai.usage.view_own" in held
    return "ai.usage.view_all" in held


def require_ai_memory_view(actor, target_user_id: int) -> bool:
    held = set(effective_permissions(actor))
    if _is_self(actor, target_user_id):
        return "ai.memory.view_own" in held
    return "ai.memory.view_all" in held


def require_ai_memory_manage(actor, target_user_id: int) -> bool:
    held = set(effective_permissions(actor))
    if _is_self(actor, target_user_id):
        return "ai.memory.manage_own" in held
    return "ai.memory.manage_all" in held


def require_ai_memory_manage_all(actor) -> bool:
    return "ai.memory.manage_all" in set(effective_permissions(actor))

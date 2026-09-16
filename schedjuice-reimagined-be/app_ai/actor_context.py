"""Build system-prompt block describing the authenticated user (actor)."""
from __future__ import annotations

from app_auth.models import User
from app_organization.models import Organization


def build_actor_context(user: User | None, *, org: Organization | None) -> str:
    if user is None:
        return ""
    roles = ", ".join(user.roles or []) or "none"
    email = (user.email or "").strip()
    return (
        "Current user (the person asking):\n"
        f"- Name: {user.name}\n"
        f"- Email: {email}\n"
        f"- Roles: {roles}\n"
        f"- user_id: {user.id} (use for tool calls when they ask about themselves; "
        "never show numeric IDs in replies)"
    )

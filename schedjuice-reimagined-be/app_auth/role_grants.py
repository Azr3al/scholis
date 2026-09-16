"""Role-assignment hierarchy (mirrors FE ``getMutableRoleOfUser``) + legacy-role detection."""

from __future__ import annotations

from rest_framework.exceptions import ValidationError

from app_auth.models import User
from app_rbac.models import Role
from app_rbac.resolution import effective_permissions

_SYSTEM_ROLE_VALUES = {choice[0] for choice in User.UserRole.choices}
SYSTEM_ROLE_VALUES = _SYSTEM_ROLE_VALUES


def _partition_roles(slugs: list[str] | None) -> tuple[set[str], set[str]]:
    slugs = slugs or []
    system = {s for s in slugs if s in _SYSTEM_ROLE_VALUES}
    custom = {s for s in slugs if s not in _SYSTEM_ROLE_VALUES}
    return system, custom


def consultation_role_assignable(tenant) -> bool:
    """Consultant system role may be granted only when consultation booking is on."""
    return bool(tenant and getattr(tenant, "is_consultation_booking_on", False))


def merge_role_add(existing: list[str] | None, slug: str) -> list[str]:
    """Add ``slug`` to roles; mirrors FE ``applyRoleToggle(..., checked=True)``."""
    current = list(existing or [])
    if slug == User.UserRole.STUDENT:
        return [User.UserRole.STUDENT]
    without_student = [role for role in current if role != User.UserRole.STUDENT]
    if slug in without_student:
        return without_student
    return list(dict.fromkeys(without_student + [slug]))


def get_grantable_role_slugs(actor: User | None, tenant) -> set[str]:
    """Roles the actor may assign to other users (system slugs only)."""
    roles = (getattr(actor, "roles", None) or []) if actor else []
    if User.UserRole.SUPERADMIN in roles:
        return set(_SYSTEM_ROLE_VALUES)
    if User.UserRole.ADMIN in roles:
        grantable = {
            User.UserRole.MANAGER,
            User.UserRole.TEACHER,
            User.UserRole.STUDENT,
            User.UserRole.FINANCE,
            User.UserRole.HR,
        }
        if consultation_role_assignable(tenant):
            grantable.add(User.UserRole.CONSULTANT)
        return grantable
    if User.UserRole.MANAGER in roles:
        return {User.UserRole.TEACHER, User.UserRole.STUDENT}
    if tenant and getattr(tenant, "can_teacher_create_course", False):
        return {User.UserRole.STUDENT}
    return set()


def validate_grantable_roles(
    actor: User | None,
    new_roles: list[str],
    tenant,
    previous_roles: list[str] | None = None,
) -> None:
    """Raise ``ValidationError`` when the actor may not grant the requested roles."""
    grantable_system = get_grantable_role_slugs(actor, tenant)
    held = effective_permissions(actor) if actor else frozenset()
    can_manage_custom = "rbac.manage" in held

    _, custom_in_new = _partition_roles(new_roles)
    _, custom_in_previous = _partition_roles(previous_roles)

    if not can_manage_custom and custom_in_new != custom_in_previous:
        raise ValidationError(
            "Cannot modify custom roles without rbac.manage permission."
        )

    unknown: list[str] = []
    forbidden: list[str] = []
    previous_set = set(previous_roles or [])

    for slug in new_roles or []:
        if slug in _SYSTEM_ROLE_VALUES:
            if slug not in grantable_system:
                if slug in previous_set:
                    continue
                forbidden.append(slug)
            continue
        if not Role.objects.filter(slug=slug, is_assignable=True).exists():
            unknown.append(slug)

    if forbidden:
        raise ValidationError(f"Cannot assign roles: {sorted(forbidden)}")
    if unknown:
        raise ValidationError(f"Unknown or non-assignable roles: {sorted(unknown)}")


def has_legacy_role(role_slugs: list[str]) -> bool:
    """True when any assigned slug is a seeded system (legacy) role."""
    if not role_slugs:
        return False
    system_slugs = set(
        Role.objects.filter(is_system=True).values_list("slug", flat=True)
    )
    return bool(system_slugs.intersection(role_slugs))

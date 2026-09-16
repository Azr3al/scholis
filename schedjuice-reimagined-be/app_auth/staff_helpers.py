from __future__ import annotations

from app_auth.models import User
from app_auth.shortcuts_availability_helpers import STAFF_ROLES_FOR_SHORTCUTS

STAFF_ROLES = STAFF_ROLES_FOR_SHORTCUTS

_ROLE_LABELS = {
    User.UserRole.SUPERADMIN: "Superadmin",
    User.UserRole.ADMIN: "Admin",
    User.UserRole.MANAGER: "Manager",
    User.UserRole.FINANCE: "Finance",
    User.UserRole.HR: "HR",
    User.UserRole.TEACHER: "Teacher",
}


def user_is_staff(user: User) -> bool:
    roles = set(user.roles or [])
    if User.UserRole.STUDENT in roles and roles == {User.UserRole.STUDENT}:
        return False
    return bool(roles.intersection(STAFF_ROLES))


def staff_role_label(user: User) -> str:
    for role in user.get_sorted_roles():
        if role in _ROLE_LABELS:
            return _ROLE_LABELS[role]
        if role != User.UserRole.STUDENT:
            return role.replace("_", " ").title()
    return "Staff"

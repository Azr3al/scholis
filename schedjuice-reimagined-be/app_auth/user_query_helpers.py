"""
Helpers for User list/search querysets (tenant-scoped).
"""

from __future__ import annotations

from app_auth.models import User


def _truthy_query_param(request, name: str) -> bool:
    raw = request.query_params.get(name)
    if raw is None:
        return False
    return str(raw).lower() in ("true", "1", "yes")


def _parse_roles_contained_by_value(raw) -> frozenset | None:
    """Parse FE `listToApiArray` shape e.g. `{student}` or `{admin,manager}`."""
    if raw is None:
        return None
    s = str(raw).strip()
    if s.startswith("{") and s.endswith("}"):
        s = s[1:-1]
    if not s:
        return frozenset()
    parts = [p.strip() for p in s.split(",") if p.strip()]
    return frozenset(parts)


def is_student_only_user_search(filter_params: dict) -> bool:
    """
    True when listing students only (active + inactive), matching:
    - Users "Students" tab: roles__contained_by only `student`
    - Course students table: roles__contains only `{student}` (same FE encoding)
    """
    for key in ("roles__contained_by", "roles__contains"):
        raw = filter_params.get(key)
        if raw is None:
            continue
        parsed = _parse_roles_contained_by_value(raw)
        if parsed == frozenset({User.UserRole.STUDENT}):
            return True
    return False


def merge_default_user_active_filter(request, filter_params: dict | None) -> dict:
    """
    Default to active-only for non-student-only User searches unless include_inactive
    or an explicit is_active filter is present.
    """
    if filter_params is None:
        filter_params = {}

    if _truthy_query_param(request, "include_inactive"):
        return filter_params

    if any(k.startswith("is_active") for k in filter_params):
        return filter_params

    if is_student_only_user_search(filter_params):
        return filter_params

    return {**filter_params, "is_active__exact": True}


def user_has_manager_or_above(user: User | None) -> bool:
    if user is None:
        return False
    allowed = {
        User.UserRole.SUPERADMIN,
        User.UserRole.ADMIN,
        User.UserRole.MANAGER,
    }
    return bool(set(user.roles) & allowed)

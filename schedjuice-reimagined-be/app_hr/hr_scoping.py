"""RBAC helpers for payroll endpoints."""
from __future__ import annotations

from rest_framework.exceptions import PermissionDenied

from app_course.course_scoping import acting_user
from app_rbac.resolution import effective_permissions


def check_payroll_calc_access(request, target_user_id: int) -> None:
    """Allow payroll.view_all or payroll.view scoped to the requesting user's own id."""
    user = acting_user(request)
    if user is None:
        raise PermissionDenied("Authentication credentials were not provided.")
    held = set(effective_permissions(user))
    if "payroll.view_all" in held:
        return
    if "payroll.view" in held and int(target_user_id) == user.id:
        return
    raise PermissionDenied("You don't have permission to view this payroll data.")

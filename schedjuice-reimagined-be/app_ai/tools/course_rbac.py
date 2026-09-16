"""RBAC guards for course roster AI tools."""
from __future__ import annotations

from typing import Any

from rest_framework.exceptions import PermissionDenied

from app_course.course_scoping import check_course_write
from app_course.models import Course
from app_rbac.resolution import effective_permissions


def _denied(message: str) -> dict[str, Any]:
    return {"error": "permission_denied", "message": message}


def require_course_manage_members(user) -> dict[str, Any] | None:
    if "course.manage_members" not in set(effective_permissions(user)):
        return _denied("Requires course.manage_members.")
    return None


def require_course_write_access(user, course: Course) -> dict[str, Any] | None:
    denied = require_course_manage_members(user)
    if denied:
        return denied
    try:
        check_course_write(user, course)
    except PermissionDenied:
        return _denied("You do not have access to this course.")
    return None

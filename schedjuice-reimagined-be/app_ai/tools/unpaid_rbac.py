"""RBAC guards for AI unpaid-student tools."""
from __future__ import annotations

from typing import Any

from rest_framework.exceptions import PermissionDenied

from app_finance.payment_scoping import check_unpaid_course_access, check_unpaid_read


def _denied(message: str) -> dict[str, Any]:
    return {"error": "permission_denied", "message": message}


def require_unpaid_read(user) -> dict[str, Any] | None:
    try:
        check_unpaid_read(user)
    except PermissionDenied as exc:
        return _denied(str(exc))
    return None


def require_unpaid_course_access(user, course_id: int) -> dict[str, Any] | None:
    try:
        check_unpaid_course_access(user, course_id)
    except PermissionDenied as exc:
        return _denied(str(exc))
    return None

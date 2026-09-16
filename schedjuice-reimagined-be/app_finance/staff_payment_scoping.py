"""RBAC helpers for staff disbursement (StaffPayment) endpoints."""
from __future__ import annotations

from django.db.models import QuerySet
from rest_framework.exceptions import PermissionDenied

from app_auth.models import User
from app_course.course_scoping import acting_user
from app_finance.models import StaffPayment
from app_rbac.resolution import effective_permissions

_READ_ALL_CODES = ("payment.view_all", "payroll.view_all")
_READ_OWN_CODES = ("payroll.view",)
_WRITE_CODES = ("payroll.manage",)


def _held(user: User | None) -> set[str]:
    if user is None:
        return set()
    return set(effective_permissions(user))


def has_staff_payment_read_breadth(held: set[str]) -> bool:
    return any(code in held for code in _READ_ALL_CODES)


def can_read_staff_payments(user: User | None) -> bool:
    held = _held(user)
    return has_staff_payment_read_breadth(held) or any(
        code in held for code in _READ_OWN_CODES
    )


def can_write_staff_payments(user: User | None) -> bool:
    held = _held(user)
    return any(code in held for code in _WRITE_CODES)


def check_staff_payment_endpoint_access(request, *, for_write: bool = False) -> User:
    user = acting_user(request)
    if user is None:
        raise PermissionDenied("Authentication credentials were not provided.")
    if for_write:
        if not can_write_staff_payments(user):
            raise PermissionDenied("You don't have permission to perform this action.")
    elif not can_read_staff_payments(user):
        raise PermissionDenied("You don't have permission to perform this action.")
    return user


def scope_staff_payments_for_user(
    user: User, queryset: QuerySet | None = None
) -> QuerySet:
    qs = queryset if queryset is not None else StaffPayment.objects.all()
    held = _held(user)
    if has_staff_payment_read_breadth(held):
        return qs
    if "payroll.view" in held:
        return qs.filter(user_id=user.id)
    return qs.none()


def check_staff_payment_read(user: User, staff_payment: StaffPayment) -> None:
    held = _held(user)
    if has_staff_payment_read_breadth(held):
        return
    if "payroll.view" in held and staff_payment.user_id == user.id:
        return
    raise PermissionDenied("You don't have permission to view this staff payment.")


def check_staff_payment_write(user: User, staff_payment: StaffPayment) -> None:
    if not can_write_staff_payments(user):
        raise PermissionDenied("You don't have permission to change this staff payment.")


def check_staff_payment_confirm(user: User, staff_payment: StaffPayment) -> None:
    held = _held(user)
    if "payroll.view" not in held:
        raise PermissionDenied("You don't have permission to confirm this staff payment.")
    if staff_payment.user_id != user.id:
        raise PermissionDenied("You can only confirm your own staff payments.")
    if staff_payment.confirmed_at is not None:
        raise PermissionDenied("This staff payment was already confirmed.")


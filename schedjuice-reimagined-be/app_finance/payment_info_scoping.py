"""RBAC helpers for staff payout PaymentInfo endpoints."""
from __future__ import annotations

from django.db.models import QuerySet
from rest_framework.exceptions import PermissionDenied

from app_auth.models import User
from app_course.course_scoping import acting_user
from app_finance.models import PaymentInfo
from app_rbac.resolution import effective_permissions

_READ_CODES = (
    "payment.view_all",
    "payment.configure",
    "payment_info.view_own",
    "payment_info.manage_own",
)
_WRITE_ALL_CODES = ("payment.configure",)
_WRITE_OWN_CODES = ("payment_info.manage_own",)


def _held(user: User | None) -> set[str]:
    if user is None:
        return set()
    return set(effective_permissions(user))


def has_payment_info_read_breadth(held: set[str]) -> bool:
    return "payment.view_all" in held or "payment.configure" in held


def has_payment_info_manage_all(held: set[str]) -> bool:
    return "payment.configure" in held


def can_read_payment_infos(user: User | None) -> bool:
    held = _held(user)
    return any(code in held for code in _READ_CODES)


def can_write_payment_infos(user: User | None) -> bool:
    held = _held(user)
    return any(code in held for code in (*_WRITE_ALL_CODES, *_WRITE_OWN_CODES))


def check_payment_info_endpoint_access(request, *, for_write: bool = False) -> User:
    user = acting_user(request)
    if user is None:
        raise PermissionDenied("Authentication credentials were not provided.")
    if for_write:
        if not can_write_payment_infos(user):
            raise PermissionDenied("You don't have permission to perform this action.")
    elif not can_read_payment_infos(user):
        raise PermissionDenied("You don't have permission to perform this action.")
    return user


def scope_payment_infos_for_user(
    user: User, queryset: QuerySet | None = None
) -> QuerySet:
    qs = queryset if queryset is not None else PaymentInfo.objects.all()
    held = _held(user)
    if has_payment_info_read_breadth(held):
        return qs
    if "payment_info.view_own" in held or "payment_info.manage_own" in held:
        return qs.filter(user_id=user.id)
    return qs.none()


def check_payment_info_read(user: User, payment_info: PaymentInfo) -> None:
    held = _held(user)
    if has_payment_info_read_breadth(held):
        return
    if (
        "payment_info.view_own" in held or "payment_info.manage_own" in held
    ) and payment_info.user_id == user.id:
        return
    raise PermissionDenied("You don't have permission to view this payment info.")


def check_payment_info_write(user: User, payment_info: PaymentInfo) -> None:
    held = _held(user)
    if has_payment_info_manage_all(held):
        return
    if "payment_info.manage_own" in held and payment_info.user_id == user.id:
        return
    raise PermissionDenied("You don't have permission to change this payment info.")


def check_payment_info_create(user: User, target_user_id: int) -> None:
    held = _held(user)
    if has_payment_info_manage_all(held):
        return
    if "payment_info.manage_own" in held and int(target_user_id) == user.id:
        return
    raise PermissionDenied("You don't have permission to create payment info for this user.")


def get_default_payment_info_for_user(user_id: int) -> PaymentInfo | None:
    return PaymentInfo.objects.filter(user_id=user_id, is_default=True).first()

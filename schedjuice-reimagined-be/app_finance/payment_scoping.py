"""RBAC helpers for payment list/search querysets and object access."""
from __future__ import annotations

from django.db.models import QuerySet
from rest_framework.exceptions import PermissionDenied

from app_auth.models import User
from app_course.course_scoping import (
    acting_user,
    scope_courses_for_user,
    user_is_connected_to_course,
)
from app_course.models import Course, UserCourse
from app_finance import models
from app_rbac import scoping
from app_rbac.resolution import effective_permissions

STAFF_PAYMENT_METHOD_PERMS = (
    "payment.view_all",
    "payment.configure",
    "payment.record",
)


def staff_can_see_retired_payment_methods(user: User | None) -> bool:
    if user is None:
        return False
    held = set(effective_permissions(user))
    return any(code in held for code in STAFF_PAYMENT_METHOD_PERMS)


def restrict_retired_payment_methods(request, filter_params):
    """Hide retired methods from students; staff keep them for late payments."""
    fp = dict(filter_params or {})
    user = acting_user(request)
    if staff_can_see_retired_payment_methods(user):
        return fp
    for key in list(fp):
        if key == "is_retired" or str(key).startswith("is_retired__"):
            fp.pop(key, None)
    fp["is_retired"] = False
    return fp


def user_owns_payment(user: User, payment: models.UserPayment) -> bool:
    return payment.user_id is not None and payment.user_id == user.id


def _user_can_read_course_scoped_payment(
    user: User, payment: models.UserPayment
) -> bool:
    if "payment.record" not in set(effective_permissions(user)):
        return False
    if payment.course_id is None:
        return False
    course = payment.course if getattr(payment, "course", None) else None
    if course is None:
        course = Course.objects.filter(id=payment.course_id).first()
    if course is None:
        return False
    return user_is_connected_to_course(user, course)


def user_can_read_payment(user: User, payment: models.UserPayment) -> bool:
    held = set(effective_permissions(user))
    if scoping.has_read_breadth("payment", held):
        return True
    if user_owns_payment(user, payment) and "payment.view" in held:
        return True
    return _user_can_read_course_scoped_payment(user, payment)


def check_payment_read(user: User) -> set[str]:
    held = set(effective_permissions(user))
    if "payment.view_all" in held or "payment.view" in held:
        return held
    raise PermissionDenied("You don't have permission to perform this action.")


def check_payment_object_read(user: User, payment: models.UserPayment) -> None:
    if not user_can_read_payment(user, payment):
        raise PermissionDenied("You do not have access to this payment.")


def _narrow_payments_for_user(queryset: QuerySet, user: User) -> QuerySet:
    held = set(effective_permissions(user))
    if "payment.record" in held:
        course_ids = scope_courses_for_user(user).values_list("id", flat=True)
        return queryset.filter(course_id__in=course_ids)
    if "payment.view" in held:
        return queryset.filter(user_id=user.id)
    return queryset.none()


def scope_payments_for_user(
    user: User, queryset: QuerySet | None = None
) -> QuerySet:
    qs = queryset if queryset is not None else models.UserPayment.objects.all()
    held = set(effective_permissions(user))
    return scoping.scope("payment", qs, held, lambda q: _narrow_payments_for_user(q, user))


def check_payment_record(user: User, course_id: int | None) -> None:
    held = set(effective_permissions(user))
    if "payment.record" not in held:
        raise PermissionDenied("You don't have permission to perform this action.")
    if scoping.has_read_breadth("payment", held):
        return
    if course_id is None:
        raise PermissionDenied("Not allowed for this course.")
    course = Course.objects.filter(id=course_id).first()
    if course is None or not user_is_connected_to_course(user, course):
        raise PermissionDenied("Not allowed for this course.")


def check_payment_record_for_enrollment(
    user: User,
    course_id: int | None,
    student_user_id: int | None,
) -> None:
    check_payment_record(user, course_id)
    if course_id is None or student_user_id is None:
        raise PermissionDenied("Course and student are required.")
    enrolled = UserCourse.objects.filter(
        course_id=course_id,
        user_id=student_user_id,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).exists()
    if not enrolled:
        raise PermissionDenied("Student is not enrolled in this course.")


UNPAID_VIEW_CONNECTED = "payment.view_unpaid"
UNPAID_VIEW_ALL = "payment.view_unpaid_all"


def can_view_unpaid(held: set[str]) -> bool:
    return UNPAID_VIEW_ALL in held or UNPAID_VIEW_CONNECTED in held


def has_unpaid_read_breadth(held: set[str]) -> bool:
    return UNPAID_VIEW_ALL in held


def check_unpaid_read(user: User) -> set[str]:
    held = set(effective_permissions(user))
    if can_view_unpaid(held):
        return held
    raise PermissionDenied("You don't have permission to perform this action.")


def check_unpaid_course_access(user: User, course_id: int | None) -> None:
    held = set(effective_permissions(user))
    if not can_view_unpaid(held):
        raise PermissionDenied("You don't have permission to perform this action.")
    if has_unpaid_read_breadth(held):
        return
    if course_id is None:
        raise PermissionDenied("course_id filter is required.")
    course = Course.objects.filter(id=course_id).first()
    if course is None or not user_is_connected_to_course(user, course):
        raise PermissionDenied("Not allowed for this course.")


def filter_course_ids_for_unpaid(user: User, course_ids: list[int]) -> list[int]:
    held = set(effective_permissions(user))
    if not can_view_unpaid(held):
        return []
    if has_unpaid_read_breadth(held):
        return course_ids
    allowed = set(scope_courses_for_user(user).values_list("id", flat=True))
    return [cid for cid in course_ids if cid in allowed]


__all__ = [
    "acting_user",
    "can_view_unpaid",
    "restrict_retired_payment_methods",
    "staff_can_see_retired_payment_methods",
    "check_payment_object_read",
    "check_payment_read",
    "check_payment_record",
    "check_payment_record_for_enrollment",
    "check_unpaid_course_access",
    "check_unpaid_read",
    "filter_course_ids_for_unpaid",
    "has_unpaid_read_breadth",
    "scope_payments_for_user",
    "user_can_read_payment",
    "user_owns_payment",
]

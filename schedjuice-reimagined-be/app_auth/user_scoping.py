"""RBAC helpers for user list/search/suggest querysets and object access."""
from __future__ import annotations

from django.db.models import QuerySet
from rest_framework.exceptions import PermissionDenied

from app_auth.models import User
from app_course.course_scoping import acting_user
from app_course.models import UserCourse
from app_rbac import scoping
from app_rbac.resolution import effective_permissions


def user_is_connected_to_user(actor: User, target: User) -> bool:
    """Co-enrolled via shared UserCourse roster membership (includes self)."""
    if actor.id == target.id:
        return True
    actor_course_ids = UserCourse.objects.filter(user_id=actor.id).values_list(
        "course_id", flat=True
    )
    return UserCourse.objects.filter(
        user_id=target.id, course_id__in=actor_course_ids
    ).exists()


def user_can_access_user(actor: User | None, target: User) -> bool:
    if actor is None:
        return False
    held = set(effective_permissions(actor))
    if scoping.has_read_breadth("user", held):
        return True
    return user_is_connected_to_user(actor, target)


def check_user_read(actor: User, target: User) -> None:
    if not user_can_access_user(actor, target):
        raise PermissionDenied("Not allowed for this user.")


def check_user_write(actor: User, target: User) -> None:
    held = set(effective_permissions(actor))
    if scoping.has_read_breadth("user", held):
        return
    if scoping.can_write_object(
        "user", held, is_connected=user_is_connected_to_user(actor, target)
    ):
        return
    raise PermissionDenied("Not allowed for this user.")


def _narrow_users_for_user(queryset: QuerySet, user: User) -> QuerySet:
    actor_course_ids = UserCourse.objects.filter(user_id=user.id).values_list(
        "course_id", flat=True
    )
    co_enrolled_ids = UserCourse.objects.filter(
        course_id__in=actor_course_ids
    ).values_list("user_id", flat=True)
    user_ids = set(co_enrolled_ids) | {user.id}
    return queryset.filter(id__in=user_ids)


def scope_users_for_user(user: User, queryset: QuerySet | None = None) -> QuerySet:
    qs = queryset if queryset is not None else User.objects.all()
    held = set(effective_permissions(user))
    return scoping.scope("user", qs, held, lambda q: _narrow_users_for_user(q, user))

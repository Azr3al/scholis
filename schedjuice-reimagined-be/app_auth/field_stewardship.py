from __future__ import annotations

from typing import Literal

from rest_framework.exceptions import PermissionDenied

from app_auth.models import User
from app_auth.user_scoping import check_user_write
from app_course.course_student_photos import (
    user_is_course_staff,
    user_is_enrolled_student,
)
from app_course.models import Course, UserCourse
from app_rbac.resolution import effective_permissions

WriteMode = Literal["full", "steward", "none"]

STEWARD_USER_KEYS = frozenset(
    {
        "name",
        "alternative_name",
        "phone_number",
        "communication_email",
        "house_number",
        "street",
        "township",
        "city",
        "region",
        "country",
        "profile_image",
        "id_photo",
    }
)
STEWARD_IMAGE_TYPES = frozenset({"id_image"})
_IGNORED_REQUEST_KEYS = frozenset({"expand", "fields", "sorts", "page", "size"})


def course_staff_may_steward_student(
    actor: User, target: User, course: Course | None = None
) -> bool:
    if actor.is_student():
        return False
    if course is not None:
        return user_is_enrolled_student(course, target) and user_is_course_staff(
            actor, course
        )
    teacher_course_ids = UserCourse.objects.filter(
        user_id=actor.id,
        assigned_as=UserCourse.AssignedAs.TEACHER,
    ).values_list("course_id", flat=True)
    creator_ids = Course.objects.filter(created_by_id=actor.id).values_list(
        "id", flat=True
    )
    course_ids = set(teacher_course_ids) | set(creator_ids)
    if not course_ids:
        return False
    return UserCourse.objects.filter(
        user_id=target.id,
        assigned_as=UserCourse.AssignedAs.STUDENT,
        course_id__in=course_ids,
    ).exists()


def user_write_mode(actor: User, target: User) -> WriteMode:
    held = set(effective_permissions(actor))
    if "user.update" in held:
        try:
            check_user_write(actor, target)
            return "full"
        except PermissionDenied:
            pass
    if actor.id == target.id:
        if "user.update_own" not in held:
            return "none"
        if User.UserRole.STUDENT not in (actor.roles or []):
            return "full"
        return "steward"
    if course_staff_may_steward_student(actor, target):
        return "steward"
    return "none"


def request_write_keys(data) -> set[str]:
    if not hasattr(data, "keys"):
        return set()
    return {str(k) for k in data.keys() if str(k) not in _IGNORED_REQUEST_KEYS}


def write_source(actor: User, target: User, mode: str) -> str:
    if actor.id == target.id:
        return "self"
    if mode == "full" and "user.update" in set(effective_permissions(actor)):
        return "admin"
    return "connected_teacher"


def _stringify_steward_value(value) -> str | None:
    if value is None or value == "":
        return None
    name = getattr(value, "name", None)
    if isinstance(name, str):
        return name or "(replaced)"
    if not isinstance(value, (str, int, float, bool)):
        return "(replaced)"
    return str(value)


def record_steward_field_changes(
    actor: User,
    target: User,
    mode: str,
    previous: dict,
    current: dict,
) -> int:
    from app_auth.models import UserFieldChange

    source = write_source(actor, target, mode)
    inserted = 0
    for key in STEWARD_USER_KEYS:
        old_s = _stringify_steward_value(previous.get(key))
        new_s = _stringify_steward_value(current.get(key))
        if old_s == new_s:
            continue
        UserFieldChange.objects.create(
            user=target,
            actor=actor,
            field_key=key,
            old_value=old_s,
            new_value=new_s,
            source=source,
        )
        inserted += 1
    return inserted

from __future__ import annotations

from rest_framework.exceptions import ValidationError

from app_auth.models import User
from app_course.models import AssignedAsRole


class MissingMainTeacherRole(Exception):
    def __init__(self, message: str = "This school has no Main Teacher course role configured."):
        super().__init__(message)
        self.message = message


def is_exclusive_teacher(user: User) -> bool:
    roles = set(user.roles or [])
    return roles == {User.UserRole.TEACHER}


def course_roles_enabled(tenant) -> bool:
    return bool(getattr(tenant, "is_course_role_enabled", True))


def resolve_main_teacher_role() -> AssignedAsRole:
    role = (
        AssignedAsRole.objects.filter(
            seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
            is_substitute=False,
        )
        .order_by("id")
        .first()
    )
    if role is None:
        raise MissingMainTeacherRole()
    return role


def resolve_teacher_assigned_as_role(*, tenant, requested_role_id: int | None) -> AssignedAsRole:
    if not course_roles_enabled(tenant):
        return resolve_main_teacher_role()
    if requested_role_id is None:
        raise ValidationError({"assigned_as_role": "Course role is required."})
    role = AssignedAsRole.objects.filter(id=requested_role_id).first()
    if role is None:
        raise ValidationError({"assigned_as_role": "Course role not found."})
    return role


def assert_assigned_as_role_seniority_unique(
    *,
    seniority: str | None,
    is_substitute: bool = False,
    exclude_pk: int | None = None,
) -> None:
    if seniority not in (
        AssignedAsRole.Seniority.MAIN_TEACHER,
        AssignedAsRole.Seniority.ASSISTANT_TEACHER,
    ):
        return
    if is_substitute:
        return
    qs = AssignedAsRole.objects.filter(seniority=seniority, is_substitute=False)
    if exclude_pk is not None:
        qs = qs.exclude(pk=exclude_pk)
    if qs.exists():
        label = (
            "Main Teacher"
            if seniority == AssignedAsRole.Seniority.MAIN_TEACHER
            else "Assistant Teacher"
        )
        raise ValidationError(
            {
                "seniority": (
                    f"Only one {label} course role is allowed. Another already exists."
                )
            }
        )

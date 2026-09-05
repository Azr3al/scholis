from __future__ import annotations

from rest_framework.exceptions import ValidationError

from app_course.models import AssignedAsRole

SUBSTITUTE_ALLOWED_SENIORITIES = (
    AssignedAsRole.Seniority.MAIN_TEACHER,
    AssignedAsRole.Seniority.ASSISTANT_TEACHER,
)


def substitute_teachers_enabled(tenant) -> bool:
    """Substitute course roles are opt-in per school; default off."""
    return bool(getattr(tenant, "is_substitute_teachers_enabled", False))


def assert_substitute_role_valid(*, is_substitute: bool, seniority: str | None) -> None:
    """A substitute role must still say whether it substitutes for MT or AT."""
    if not is_substitute:
        return
    if seniority not in SUBSTITUTE_ALLOWED_SENIORITIES:
        raise ValidationError(
            {
                "is_substitute": (
                    "A substitute role must have Main Teacher or Assistant Teacher seniority."
                )
            }
        )

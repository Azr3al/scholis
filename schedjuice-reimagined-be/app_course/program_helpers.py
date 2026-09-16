"""Helpers for Program / Intake setup and course generation."""

from __future__ import annotations

from app_course.models import Program


def create_default_general_program() -> Program:
    program, _ = Program.objects.get_or_create(
        name="General",
        defaults={
            "description": "Default program for courses not assigned to a specific curriculum.",
            "course_creation_method": Program.CourseCreationMethod.MANUAL,
            "subject_strategy": Program.SubjectStrategy.OPTIONAL,
            "is_default": True,
            "is_protected": True,
            "is_active": True,
        },
    )
    if not program.is_default or not program.is_protected:
        program.is_default = True
        program.is_protected = True
        program.save(update_fields=["is_default", "is_protected", "updated_at"])
    return program


def get_default_program() -> Program | None:
    return Program.objects.filter(is_default=True).first()

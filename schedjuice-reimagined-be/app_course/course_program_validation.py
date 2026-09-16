"""Validation helpers for program-driven course fields."""

from datetime import date, datetime

from django.db.models import Q
from rest_framework.exceptions import ValidationError

from app_course.models import Course, Intake, Program
from app_course.program_helpers import get_default_program


def _coerce_date(value) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    return None


def validate_course_dates_within_intake(
    start_date,
    end_date,
    intake: Intake | None,
) -> None:
    """Ensure course run dates fall within the linked intake window."""
    if intake is None:
        return

    start = _coerce_date(start_date)
    end = _coerce_date(end_date)
    intake_start = _coerce_date(intake.start_date)
    intake_end = _coerce_date(intake.end_date)
    if start is None or end is None or intake_start is None or intake_end is None:
        return

    if start < intake_start:
        raise ValidationError(
            {
                "start_date": (
                    f"Course start date must be on or after the intake start date "
                    f"({intake_start.isoformat()})."
                )
            }
        )
    if end > intake_end:
        raise ValidationError(
            {
                "end_date": (
                    f"Course end date must be on or before the intake end date "
                    f"({intake_end.isoformat()})."
                )
            }
        )


def validate_intake_dates_do_not_conflict_with_courses(
    intake: Intake,
    new_start_date,
    new_end_date,
) -> None:
    """Reject shrinking an intake below existing linked course run dates."""
    start = _coerce_date(new_start_date)
    end = _coerce_date(new_end_date)
    if start is None or end is None:
        return

    conflicting = (
        Course.objects.filter(intake=intake)
        .filter(Q(start_date__lt=start) | Q(end_date__gt=end))
        .values_list("title", flat=True)[:5]
    )
    titles = list(conflicting)
    if not titles:
        return

    suffix = f" (e.g. {titles[0]})" if titles else ""
    raise ValidationError(
        {
            "non_field_errors": [
                "Cannot change intake dates because one or more linked courses "
                f"fall outside the new range{suffix}."
            ]
        }
    )


def resolve_program(attrs, instance=None):
    program = attrs.get("program")
    if program is None and instance is not None:
        program = instance.program
    if program is None:
        program = get_default_program()
        if program:
            attrs["program"] = program
    return program


def validate_course_program_fields(attrs, instance=None, partial=False):
    program = resolve_program(attrs, instance)
    if program is None:
        raise ValidationError({"program": "Program is required."})

    if instance is not None and "program" in attrs:
        new_program = attrs.get("program")
        if new_program is not None and new_program.id != instance.program_id:
            raise ValidationError({"program": "Cannot change a course's program."})

    intake = attrs.get("intake")
    if intake is None and instance is not None and "intake" not in attrs:
        intake = instance.intake
    if intake is not None and intake.program_id != program.id:
        raise ValidationError({"intake": "Intake must belong to the same program as the course."})

    level = attrs.get("level")
    if level is None and instance is not None and "level" not in attrs:
        level = instance.level
    if level is not None and level.program_id != program.id:
        raise ValidationError({"level": "Level must belong to the same program as the course."})

    section = attrs.get("section")
    if section is None and instance is not None and "section" not in attrs:
        section = instance.section
    if section is not None:
        if level is None:
            raise ValidationError({"section": "Section requires a level on the course."})
        if section.level_id != level.id:
            raise ValidationError(
                {"section": "Section must belong to the course's level."}
            )

    subject = attrs.get("subject")
    if subject is None and instance is not None and "subject" not in attrs:
        subject = instance.subject

    strategy = program.subject_strategy
    if strategy == Program.SubjectStrategy.NONE:
        if subject is not None:
            raise ValidationError(
                {"subject": "Subject must be empty for this program."}
            )
    elif strategy == Program.SubjectStrategy.REQUIRED:
        if subject is None and not partial:
            raise ValidationError({"subject": "Subject is required for this program."})
    elif strategy == Program.SubjectStrategy.MULTI:
        if subject is not None:
            raise ValidationError(
                {"subject": "Use course subjects instead of a single subject for this program."}
            )

    if program.course_creation_method == Program.CourseCreationMethod.INTAKE_BASED:
        if intake is None and not partial:
            raise ValidationError(
                {"intake": "Intake is required for intake-based programs."}
            )

    return attrs

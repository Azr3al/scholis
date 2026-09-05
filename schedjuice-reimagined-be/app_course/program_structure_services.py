"""Bulk program structure setup for first intake onboarding."""

from __future__ import annotations

from django.db import transaction

from app_course.models import (
    Program,
    ProgramLevel,
    ProgramLevelSection,
    ProgramLevelSubject,
    Subject,
)


class ProgramStructureValidationError(ValueError):
    pass


def _validate_levels_payload(levels_data: list) -> list[dict]:
    if not isinstance(levels_data, list):
        raise ProgramStructureValidationError("'levels' must be an array.")

    if len(levels_data) == 0:
        raise ProgramStructureValidationError("At least one level is required.")

    seen_level_names: set[str] = set()
    normalized: list[dict] = []

    for idx, level in enumerate(levels_data):
        if not isinstance(level, dict):
            raise ProgramStructureValidationError(
                f"Level at index {idx} must be an object."
            )

        name = str(level.get("name", "")).strip()
        if not name:
            raise ProgramStructureValidationError(
                f"Level at index {idx} must have a non-empty name."
            )

        name_key = name.casefold()
        if name_key in seen_level_names:
            raise ProgramStructureValidationError(
                f"Duplicate level name: {name!r}."
            )
        seen_level_names.add(name_key)

        sections_data = level.get("sections")
        if not isinstance(sections_data, list) or len(sections_data) == 0:
            raise ProgramStructureValidationError(
                f"Level {name!r} must have at least one section."
            )

        seen_section_names: set[str] = set()
        normalized_sections: list[dict] = []

        for s_idx, section in enumerate(sections_data):
            if not isinstance(section, dict):
                raise ProgramStructureValidationError(
                    f"Section at index {s_idx} in level {name!r} must be an object."
                )

            section_name = str(section.get("name", "")).strip()
            if not section_name:
                raise ProgramStructureValidationError(
                    f"Section at index {s_idx} in level {name!r} must have a non-empty name."
                )

            section_key = section_name.casefold()
            if section_key in seen_section_names:
                raise ProgramStructureValidationError(
                    f"Duplicate section name {section_name!r} in level {name!r}."
                )
            seen_section_names.add(section_key)

            sort_order = section.get("sort_order", s_idx)
            try:
                sort_order = int(sort_order)
            except (TypeError, ValueError) as exc:
                raise ProgramStructureValidationError(
                    f"Invalid sort_order for section {section_name!r} in level {name!r}."
                ) from exc

            normalized_sections.append(
                {"name": section_name, "sort_order": sort_order}
            )

        sort_order = level.get("sort_order", idx)
        try:
            sort_order = int(sort_order)
        except (TypeError, ValueError) as exc:
            raise ProgramStructureValidationError(
                f"Invalid sort_order for level {name!r}."
            ) from exc

        normalized.append(
            {
                "name": name,
                "sort_order": sort_order,
                "sections": normalized_sections,
            }
        )

    return normalized


def setup_program_structure(program_id: int, levels_data: list) -> list[ProgramLevel]:
    """
    Create program levels and sections atomically for a program with no existing levels.

    Returns queryset of created levels with prefetched sections.
    """
    program = Program.objects.filter(pk=program_id).first()
    if not program:
        raise ProgramStructureValidationError("Program not found.")

    if ProgramLevel.objects.filter(program_id=program_id).exists():
        raise ProgramStructureValidationError(
            "Program already has levels. Use program settings to edit structure."
        )

    normalized = _validate_levels_payload(levels_data)

    with transaction.atomic():
        level_objs = [
            ProgramLevel(
                program_id=program_id,
                name=level["name"],
                sort_order=level["sort_order"],
            )
            for level in normalized
        ]
        created_levels = ProgramLevel.objects.bulk_create(level_objs)

        section_objs: list[ProgramLevelSection] = []
        for created_level, level in zip(created_levels, normalized):
            for section in level["sections"]:
                section_objs.append(
                    ProgramLevelSection(
                        level_id=created_level.id,
                        name=section["name"],
                        sort_order=section["sort_order"],
                    )
                )

        ProgramLevelSection.objects.bulk_create(section_objs)

    return (
        ProgramLevel.objects.filter(program_id=program_id)
        .prefetch_related("sections")
        .order_by("sort_order", "name")
    )


def _validate_curriculum_payload(assignments_data: list) -> list[dict]:
    if not isinstance(assignments_data, list):
        raise ProgramStructureValidationError("'assignments' must be an array.")

    normalized: list[dict] = []
    seen_pairs: set[tuple[int, int]] = set()

    for idx, row in enumerate(assignments_data):
        if not isinstance(row, dict):
            raise ProgramStructureValidationError(
                f"Assignment at index {idx} must be an object."
            )

        try:
            level_id = int(row.get("level"))
            subject_id = int(row.get("subject"))
        except (TypeError, ValueError) as exc:
            raise ProgramStructureValidationError(
                f"Assignment at index {idx} must include numeric level and subject."
            ) from exc

        pair = (level_id, subject_id)
        if pair in seen_pairs:
            raise ProgramStructureValidationError(
                f"Duplicate subject {subject_id} for level {level_id}."
            )
        seen_pairs.add(pair)

        sort_order = row.get("sort_order", idx)
        try:
            sort_order = int(sort_order)
        except (TypeError, ValueError) as exc:
            raise ProgramStructureValidationError(
                f"Invalid sort_order for level {level_id}, subject {subject_id}."
            ) from exc

        normalized.append(
            {
                "level_id": level_id,
                "subject_id": subject_id,
                "sort_order": sort_order,
            }
        )

    return normalized


def setup_program_curriculum(
    program_id: int, assignments_data: list
) -> list[ProgramLevelSubject]:
    """
    Replace all ProgramLevelSubject rows for a program in one transaction.
    """
    program = Program.objects.filter(pk=program_id).first()
    if not program:
        raise ProgramStructureValidationError("Program not found.")

    normalized = _validate_curriculum_payload(assignments_data)

    level_ids = {row["level_id"] for row in normalized}
    subject_ids = {row["subject_id"] for row in normalized}

    if level_ids:
        program_level_ids = set(
            ProgramLevel.objects.filter(program_id=program_id).values_list(
                "id", flat=True
            )
        )
        invalid_levels = level_ids - program_level_ids
        if invalid_levels:
            raise ProgramStructureValidationError(
                f"Level(s) {sorted(invalid_levels)} do not belong to this program."
            )

    if subject_ids:
        existing_subject_ids = set(
            Subject.objects.filter(id__in=subject_ids).values_list("id", flat=True)
        )
        invalid_subjects = subject_ids - existing_subject_ids
        if invalid_subjects:
            raise ProgramStructureValidationError(
                f"Subject(s) {sorted(invalid_subjects)} were not found."
            )

    with transaction.atomic():
        ProgramLevelSubject.objects.filter(level__program_id=program_id).delete()
        created = ProgramLevelSubject.objects.bulk_create(
            [
                ProgramLevelSubject(
                    level_id=row["level_id"],
                    subject_id=row["subject_id"],
                    sort_order=row["sort_order"],
                )
                for row in normalized
            ]
        )

    return created

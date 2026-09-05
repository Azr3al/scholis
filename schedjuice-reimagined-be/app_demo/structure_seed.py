from __future__ import annotations

from typing import Any

from tenant_schemas.utils import schema_context

from app_course.models import Category, Program
from app_course.program_helpers import create_default_general_program
from app_rbac.seeding import seed_rbac


def _normalize_structure(
    academic_structure: dict[str, Any] | None,
) -> dict[str, Any]:
    if isinstance(academic_structure, dict):
        return academic_structure
    return {}


def seed_structure(
    schema_name: str,
    academic_structure: dict[str, Any] | None,
    terminology: dict[str, str] | None,
) -> dict[str, Any]:
    del terminology  # Config already applies terminology substitution before this step.
    structure = _normalize_structure(academic_structure)

    with schema_context(schema_name):
        seed_rbac()

        category_by_name: dict[str, Category] = {}
        for row in structure.get("categories", []):
            name = str(row.get("name", "")).strip()
            if not name:
                continue
            sort_order = int(row.get("sort_order", 0))
            category, created = Category.objects.get_or_create(
                name=name,
                defaults={"sort_order": sort_order},
            )
            if not created and category.sort_order != sort_order:
                category.sort_order = sort_order
                category.save(update_fields=["sort_order", "updated_at"])
            category_by_name[name] = category

        program_config = structure.get("program") if isinstance(structure, dict) else None
        if isinstance(program_config, dict) and str(program_config.get("name", "")).strip():
            program_name = str(program_config["name"]).strip()
            program, created = Program.objects.get_or_create(
                name=program_name,
                defaults={
                    "description": program_config.get("description", ""),
                    "course_creation_method": program_config.get(
                        "course_creation_method",
                        Program.CourseCreationMethod.MANUAL,
                    ),
                    "subject_strategy": program_config.get(
                        "subject_strategy",
                        Program.SubjectStrategy.OPTIONAL,
                    ),
                },
            )
            if not created:
                update_fields: list[str] = []
                description = program_config.get("description", "")
                if program.description != description:
                    program.description = description
                    update_fields.append("description")
                if update_fields:
                    update_fields.append("updated_at")
                    program.save(update_fields=update_fields)
        else:
            program = create_default_general_program()

        return {
            "category_by_name": category_by_name,
            "program_id": program.id,
        }

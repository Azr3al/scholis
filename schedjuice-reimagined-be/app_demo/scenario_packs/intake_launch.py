from __future__ import annotations

from datetime import timedelta
from typing import Any

from tenant_schemas.utils import schema_context

from app_course.models import (
    Category,
    Course,
    Intake,
    Program,
    ProgramLevel,
    ProgramLevelSection,
)
from app_demo.config import ResolvedDemoConfig


def _upsert_program() -> Program:
    program, _ = Program.objects.get_or_create(
        name="K12 Core Program",
        defaults={
            "description": "Intake-based K12 launch program for demo course generation.",
            "course_creation_method": Program.CourseCreationMethod.INTAKE_BASED,
            "subject_strategy": Program.SubjectStrategy.REQUIRED,
        },
    )

    update_fields: list[str] = []
    if program.course_creation_method != Program.CourseCreationMethod.INTAKE_BASED:
        program.course_creation_method = Program.CourseCreationMethod.INTAKE_BASED
        update_fields.append("course_creation_method")
    if program.subject_strategy != Program.SubjectStrategy.REQUIRED:
        program.subject_strategy = Program.SubjectStrategy.REQUIRED
        update_fields.append("subject_strategy")
    description = "Intake-based K12 launch program for demo course generation."
    if program.description != description:
        program.description = description
        update_fields.append("description")
    if update_fields:
        update_fields.append("updated_at")
        program.save(update_fields=update_fields)
    return program


def _upsert_level_with_sections(
    *,
    program: Program,
    level_name: str,
    sort_order: int,
    section_names: list[str],
) -> tuple[ProgramLevel, dict[str, ProgramLevelSection]]:
    level, _ = ProgramLevel.objects.get_or_create(
        program=program,
        name=level_name,
        defaults={"sort_order": sort_order},
    )
    if level.sort_order != sort_order:
        level.sort_order = sort_order
        level.save(update_fields=["sort_order", "updated_at"])

    sections: dict[str, ProgramLevelSection] = {}
    for index, section_name in enumerate(section_names, start=1):
        section, _ = ProgramLevelSection.objects.get_or_create(
            level=level,
            name=section_name,
            defaults={"sort_order": index},
        )
        if section.sort_order != index:
            section.sort_order = index
            section.save(update_fields=["sort_order", "updated_at"])
        sections[section_name] = section
    return level, sections


def run_intake_launch_pack(
    *,
    schema_name: str,
    config: ResolvedDemoConfig,
    pack_ctx: dict[str, Any] | None = None,
) -> dict[str, Any]:
    del pack_ctx

    with schema_context(schema_name):
        categories: dict[str, Category] = {}
        for index, category_name in enumerate(["Mathematics", "English", "Science"], start=1):
            category, _ = Category.objects.get_or_create(
                name=category_name,
                defaults={"sort_order": index},
            )
            if category.sort_order != index:
                category.sort_order = index
                category.save(update_fields=["sort_order", "updated_at"])
            categories[category_name] = category

        program = _upsert_program()

        grade7, grade7_sections = _upsert_level_with_sections(
            program=program,
            level_name="Grade 7",
            sort_order=1,
            section_names=["A", "B"],
        )
        grade8, grade8_sections = _upsert_level_with_sections(
            program=program,
            level_name="Grade 8",
            sort_order=2,
            section_names=["A", "B"],
        )

        intake, created = Intake.objects.get_or_create(
            program=program,
            name="DEMO-K12 Intake 2026",
            defaults={
                "start_date": config.demo_date + timedelta(days=7),
                "end_date": config.demo_date + timedelta(days=120),
                "description": "K12 demo intake for launch planning walkthroughs.",
                "generation_defaults": {"status": "planned"},
            },
        )
        if not created:
            expected_start = config.demo_date + timedelta(days=7)
            expected_end = config.demo_date + timedelta(days=120)
            update_fields: list[str] = []
            if intake.start_date != expected_start:
                intake.start_date = expected_start
                update_fields.append("start_date")
            if intake.end_date != expected_end:
                intake.end_date = expected_end
                update_fields.append("end_date")
            description = "K12 demo intake for launch planning walkthroughs."
            if intake.description != description:
                intake.description = description
                update_fields.append("description")
            generation_defaults = {"status": "planned"}
            if intake.generation_defaults != generation_defaults:
                intake.generation_defaults = generation_defaults
                update_fields.append("generation_defaults")
            if update_fields:
                update_fields.append("updated_at")
                intake.save(update_fields=update_fields)

        stub_rows = [
            (
                "DEMO-K12-G7-A-Math",
                categories["Mathematics"],
                grade7,
                grade7_sections["A"],
            ),
            (
                "DEMO-K12-G7-B-Science",
                categories["Science"],
                grade7,
                grade7_sections["B"],
            ),
            (
                "DEMO-K12-G8-A-English",
                categories["English"],
                grade8,
                grade8_sections["A"],
            ),
        ]

        course_ids: list[int] = []
        for title, category, level, section in stub_rows:
            course, created = Course.objects.get_or_create(
                title=title,
                defaults={
                    "category": category,
                    "program": program,
                    "intake": intake,
                    "level": level,
                    "section": section,
                    "start_date": intake.start_date,
                    "end_date": intake.end_date,
                    "status": Course.CourseStatus.PLANNED,
                },
            )
            if not created:
                update_fields: list[str] = []
                if course.category_id != category.id:
                    course.category = category
                    update_fields.append("category")
                if course.program_id != program.id:
                    course.program = program
                    update_fields.append("program")
                if course.intake_id != intake.id:
                    course.intake = intake
                    update_fields.append("intake")
                if course.level_id != level.id:
                    course.level = level
                    update_fields.append("level")
                if course.section_id != section.id:
                    course.section = section
                    update_fields.append("section")
                if course.start_date != intake.start_date:
                    course.start_date = intake.start_date
                    update_fields.append("start_date")
                if course.end_date != intake.end_date:
                    course.end_date = intake.end_date
                    update_fields.append("end_date")
                if course.status != Course.CourseStatus.PLANNED:
                    course.status = Course.CourseStatus.PLANNED
                    update_fields.append("status")
                if update_fields:
                    update_fields.append("updated_at")
                    course.save(update_fields=update_fields)
            course_ids.append(course.id)

    return {
        "id": "intake-launch",
        "status": "applied",
        "message": "Seeded K12 intake and planned course stubs for launch walkthroughs.",
        "intake_id": intake.id,
        "course_ids": course_ids,
    }

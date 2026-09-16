from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_demo.config import ResolvedDemoConfig

_DEFAULT_PASSWORD = "demo-password"


def _upsert_student(*, email: str, name: str, code: str) -> User:
    defaults = {
        "name": name,
        "phone_number": "-",
        "communication_email": email,
        "date_of_birth": date(1990, 1, 1),
        "code": code,
        "roles": [User.UserRole.STUDENT],
        "is_active": True,
        "is_password_change_required": False,
    }
    user = User.objects.filter(email=email).first()
    if user is None:
        return User.objects.create_user(
            email=email,
            password=_DEFAULT_PASSWORD,
            **defaults,
        )

    update_fields: list[str] = []
    for field, value in defaults.items():
        if getattr(user, field) != value:
            setattr(user, field, value)
            update_fields.append(field)
    if update_fields:
        update_fields.append("updated_at")
        user.save(update_fields=update_fields)
    return user


def run_unpaid_students_pack(
    *,
    schema_name: str,
    config: ResolvedDemoConfig,
    pack_ctx: dict[str, Any] | None = None,
) -> dict[str, Any]:
    del pack_ctx

    with schema_context(schema_name):
        category, _ = Category.objects.get_or_create(name="Math")
        program, _ = Program.objects.get_or_create(
            name="DEMO-Program",
            defaults={
                "course_creation_method": Program.CourseCreationMethod.MANUAL,
                "subject_strategy": Program.SubjectStrategy.NONE,
            },
        )
        course, _ = Course.objects.get_or_create(
            title="DEMO-Unpaid-Math-L2",
            defaults={
                "category": category,
                "program": program,
                "start_date": config.demo_date - timedelta(days=45),
                "end_date": config.demo_date + timedelta(days=45),
            },
        )

        enrolled_ids: list[int] = []
        for idx in range(1, 6):
            email = f"demo-student-{idx}@{config.domain_url}"
            student = _upsert_student(
                email=email,
                name=f"Demo Student {idx}",
                code=f"demo-student-{idx}",
            )
            user_course, _ = UserCourse.objects.get_or_create(
                user=student,
                course=course,
                defaults={"assigned_as": UserCourse.AssignedAs.STUDENT},
            )
            if user_course.assigned_as != UserCourse.AssignedAs.STUDENT:
                user_course.assigned_as = UserCourse.AssignedAs.STUDENT
                user_course.save(update_fields=["assigned_as", "updated_at"])
            enrolled_ids.append(student.id)

    return {
        "id": "unpaid-students",
        "status": "applied",
        "message": (
            "Seeded DEMO-Unpaid-Math-L2 with enrolled students "
            "(payment state intentionally simplified)."
        ),
        "course_id": course.id,
        "enrolled_student_ids": enrolled_ids,
    }

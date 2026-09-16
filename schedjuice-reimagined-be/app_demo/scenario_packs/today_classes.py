from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any

from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Event, Program, UserCourse
from app_demo.config import ResolvedDemoConfig

_DEFAULT_PASSWORD = "demo-password"


def _upsert_teacher(*, domain_url: str) -> User:
    email = f"demo-teacher@{domain_url}"
    defaults = {
        "name": "Demo Teacher",
        "phone_number": "-",
        "communication_email": email,
        "date_of_birth": date(1990, 1, 1),
        "code": "demo-teacher",
        "roles": [User.UserRole.TEACHER],
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


def _upsert_today_course(*, demo_date: date) -> Course:
    category, _ = Category.objects.get_or_create(name="DEMO-Category")
    program, _ = Program.objects.get_or_create(
        name="DEMO-Program",
        defaults={
            "course_creation_method": Program.CourseCreationMethod.MANUAL,
            "subject_strategy": Program.SubjectStrategy.NONE,
        },
    )
    course, created = Course.objects.get_or_create(
        title="DEMO-Today-1",
        defaults={
            "category": category,
            "program": program,
            "start_date": demo_date,
            "end_date": demo_date + timedelta(days=30),
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
        if course.start_date != demo_date:
            course.start_date = demo_date
            update_fields.append("start_date")
        expected_end = demo_date + timedelta(days=30)
        if course.end_date != expected_end:
            course.end_date = expected_end
            update_fields.append("end_date")
        if update_fields:
            update_fields.append("updated_at")
            course.save(update_fields=update_fields)
    return course


def run_today_classes_pack(
    *,
    schema_name: str,
    config: ResolvedDemoConfig,
    pack_ctx: dict[str, Any] | None = None,
) -> dict[str, Any]:
    del pack_ctx

    with schema_context(schema_name):
        teacher = _upsert_teacher(domain_url=config.domain_url)
        course = _upsert_today_course(demo_date=config.demo_date)
        user_course = UserCourse.objects.filter(user=teacher, course=course).first()
        if user_course is None:
            # Use bulk_create to avoid post_save side effects (Telegram task enqueue) in test envs.
            UserCourse.objects.bulk_create(
                [
                    UserCourse(
                        user=teacher,
                        course=course,
                        assigned_as=UserCourse.AssignedAs.TEACHER,
                    )
                ]
            )
        elif user_course.assigned_as != UserCourse.AssignedAs.TEACHER:
            UserCourse.objects.filter(id=user_course.id).update(
                assigned_as=UserCourse.AssignedAs.TEACHER
            )

        event_rows = [
            ("DEMO-Today-1 / Session 1", time(9, 0), time(10, 0)),
            ("DEMO-Today-1 / Session 2", time(13, 0), time(14, 0)),
        ]
        event_ids: list[int] = []
        midnight = timezone.make_aware(datetime.combine(config.demo_date, time.min))
        for title, time_from, time_to in event_rows:
            event, _ = Event.objects.update_or_create(
                course=course,
                title=title,
                defaults={
                    "date": midnight,
                    "time_from": time_from,
                    "time_to": time_to,
                },
            )
            event_ids.append(event.id)

    return {
        "id": "today-classes",
        "status": "applied",
        "message": "Seeded DEMO-Today-1 with two events on demo_date.",
        "course_id": course.id,
        "teacher_email": teacher.email,
        "event_ids": event_ids,
    }

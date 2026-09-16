from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any

from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_attendance.models import UserEvent
from app_auth.models import User
from app_course.models import Category, Course, Event, Program, UserCourse
from app_demo.config import ResolvedDemoConfig

_DEFAULT_PASSWORD = "demo-password"


def _upsert_user(
    *,
    email: str,
    name: str,
    code: str,
    role: str,
) -> User:
    defaults = {
        "name": name,
        "phone_number": "-",
        "communication_email": email,
        "date_of_birth": date(1990, 1, 1),
        "code": code,
        "roles": [role],
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


def _ensure_course(*, demo_date: date) -> Course:
    category, _ = Category.objects.get_or_create(name="Attendance")
    program, _ = Program.objects.get_or_create(
        name="DEMO-Program",
        defaults={
            "course_creation_method": Program.CourseCreationMethod.MANUAL,
            "subject_strategy": Program.SubjectStrategy.NONE,
        },
    )
    course, created = Course.objects.get_or_create(
        title="DEMO-Attendance-Story",
        defaults={
            "category": category,
            "program": program,
            "start_date": demo_date - timedelta(days=14),
            "end_date": demo_date + timedelta(days=14),
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
        expected_start = demo_date - timedelta(days=14)
        if course.start_date != expected_start:
            course.start_date = expected_start
            update_fields.append("start_date")
        expected_end = demo_date + timedelta(days=14)
        if course.end_date != expected_end:
            course.end_date = expected_end
            update_fields.append("end_date")
        if update_fields:
            update_fields.append("updated_at")
            course.save(update_fields=update_fields)
    return course


def run_attendance_story_pack(
    *,
    schema_name: str,
    config: ResolvedDemoConfig,
    pack_ctx: dict[str, Any] | None = None,
) -> dict[str, Any]:
    del pack_ctx

    with schema_context(schema_name):
        course = _ensure_course(demo_date=config.demo_date)

        teacher = _upsert_user(
            email=f"demo-teacher@{config.domain_url}",
            name="Demo Teacher",
            code="demo-teacher",
            role=User.UserRole.TEACHER,
        )
        teacher_link = UserCourse.objects.filter(user=teacher, course=course).first()
        if teacher_link is None:
            # Use bulk_create to avoid post_save side effects in test envs without Redis.
            UserCourse.objects.bulk_create(
                [
                    UserCourse(
                        user=teacher,
                        course=course,
                        assigned_as=UserCourse.AssignedAs.TEACHER,
                    )
                ]
            )
        elif teacher_link.assigned_as != UserCourse.AssignedAs.TEACHER:
            UserCourse.objects.filter(id=teacher_link.id).update(
                assigned_as=UserCourse.AssignedAs.TEACHER
            )

        students: list[User] = []
        for index in range(1, 4):
            student = _upsert_user(
                email=f"demo-attendance-student-{index}@{config.domain_url}",
                name=f"Demo Attendance Student {index}",
                code=f"demo-attendance-student-{index}",
                role=User.UserRole.STUDENT,
            )
            students.append(student)
            student_link = UserCourse.objects.filter(user=student, course=course).first()
            if student_link is None:
                UserCourse.objects.bulk_create(
                    [
                        UserCourse(
                            user=student,
                            course=course,
                            assigned_as=UserCourse.AssignedAs.STUDENT,
                        )
                    ]
                )
            elif student_link.assigned_as != UserCourse.AssignedAs.STUDENT:
                UserCourse.objects.filter(id=student_link.id).update(
                    assigned_as=UserCourse.AssignedAs.STUDENT
                )

        event_rows = [
            (
                "DEMO-Attendance-Story / Session 1",
                config.demo_date - timedelta(days=1),
                time(9, 0),
                time(10, 0),
                UserEvent.AttendanceStatus.PRESENT,
            ),
            (
                "DEMO-Attendance-Story / Session 2",
                config.demo_date - timedelta(days=3),
                time(11, 0),
                time(12, 0),
                UserEvent.AttendanceStatus.LATE,
            ),
            (
                "DEMO-Attendance-Story / Session 3",
                config.demo_date - timedelta(days=6),
                time(13, 0),
                time(14, 0),
                UserEvent.AttendanceStatus.ABSENT,
            ),
        ]

        event_ids: list[int] = []
        attendance_ids: list[int] = []
        for index, (title, session_date, time_from, time_to, status) in enumerate(event_rows):
            event, _ = Event.objects.update_or_create(
                course=course,
                title=title,
                defaults={
                    "date": timezone.make_aware(datetime.combine(session_date, time.min)),
                    "time_from": time_from,
                    "time_to": time_to,
                },
            )
            event_ids.append(event.id)
            student = students[index % len(students)]
            user_event, _ = UserEvent.objects.get_or_create(
                user=student,
                event=event,
                defaults={"attendance_status": status},
            )
            if user_event.attendance_status != status:
                user_event.attendance_status = status
                user_event.save(update_fields=["attendance_status", "updated_at"])
            attendance_ids.append(user_event.id)

    return {
        "id": "attendance-story",
        "status": "applied",
        "message": "Seeded DEMO-Attendance-Story with mixed attendance statuses.",
        "course_id": course.id,
        "event_ids": event_ids,
        "attendance_ids": attendance_ids,
    }

import unittest
from datetime import date, datetime
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_attendance.attendance_summary import (
    attendance_pct,
    build_course_attendance_summary,
    build_monthly_attendance_matrix,
    count_attended,
    month_anchors_from_course,
)
from app_attendance.models import UserEvent
from app_auth.models import User
from app_course.models import Category, Course, Event, Program, UserCourse
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class AttendanceSummaryUnitTests(unittest.TestCase):
    def test_count_attended(self):
        statuses = ["present", "late", "absent", "unregistered"]
        self.assertEqual(count_attended(statuses), 2)

    def test_attendance_pct_zero_total(self):
        self.assertEqual(attendance_pct(0, 0), 0.0)

    def test_attendance_pct_rounds(self):
        self.assertEqual(attendance_pct(7, 8), 87.5)

    def test_month_anchors_from_course(self):
        course = SimpleNamespace(
            start_date=date(2026, 1, 15),
            end_date=date(2026, 3, 10),
        )
        self.assertEqual(
            month_anchors_from_course(course),
            ["2026-01-01", "2026-02-01", "2026-03-01"],
        )


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class BuildCourseAttendanceSummaryTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name), patch(
            "app_telegram.signals.dm_invite_link_to_teacher.delay"
        ), patch("app_telegram.signals.remove_telegram_member.delay"):
            seed_rbac()
            self.teacher = User.objects.create_user(
                email=f"tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.student_a = User.objects.create_user(
                email=f"stu-a-{suffix}@example.com",
                password="x",
                name="Student A",
                phone_number="1",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.student_b = User.objects.create_user(
                email=f"stu-b-{suffix}@example.com",
                password="x",
                name="Student B",
                phone_number="2",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.cat = Category.objects.create(name=f"Cat {suffix}")
            self.prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=date(2026, 4, 1),
                end_date=date(2026, 5, 31),
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            for student in (self.student_a, self.student_b):
                UserCourse.objects.create(
                    user=student,
                    course=self.course,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                )
            dropped_uc = UserCourse.objects.get(
                user=self.student_b, course=self.course
            )
            from app_course.membership_history import record_membership_event
            from app_course.models import CourseMembershipEvent

            record_membership_event(
                course_id=self.course.id,
                user_id=self.student_b.id,
                event_type=CourseMembershipEvent.EventType.REMOVED,
            )
            dropped_uc.delete()

            self.april_events = []
            for day in (1, 8):
                ev_date = timezone.make_aware(
                    datetime.combine(date(2026, 4, day), datetime.min.time())
                )
                self.april_events.append(
                    Event.objects.create(
                        title=f"Apr {day}",
                        course=self.course,
                        date=ev_date,
                        time_from=datetime.strptime("09:00", "%H:%M").time(),
                        time_to=datetime.strptime("10:00", "%H:%M").time(),
                    )
                )

            UserEvent.objects.create(
                user=self.student_a,
                event=self.april_events[0],
                attendance_status=UserEvent.AttendanceStatus.PRESENT,
            )
            UserEvent.objects.create(
                user=self.student_a,
                event=self.april_events[1],
                attendance_status=UserEvent.AttendanceStatus.LATE,
            )

    def test_per_student_monthly_and_course_pct(self):
        with schema_context(self.schema_name):
            summary = build_course_attendance_summary(self.course.id, course=self.course)

        self.assertEqual(len(summary["months"]), 2)
        april = summary["months"][0]
        self.assertEqual(april["anchor"], "2026-04-01")
        self.assertEqual(april["session_count"], 2)

        student_a = next(s for s in summary["students"] if s["name"] == "Student A")
        self.assertEqual(student_a["by_month"]["2026-04-01"]["attended"], 2)
        self.assertEqual(student_a["by_month"]["2026-04-01"]["total"], 2)
        self.assertEqual(student_a["by_month"]["2026-04-01"]["pct"], 100.0)
        self.assertEqual(student_a["course"]["pct"], 100.0)
        self.assertEqual(len(summary["students"]), 1)

    def test_class_aggregate_weighted_pct(self):
        with schema_context(self.schema_name):
            summary = build_course_attendance_summary(self.course.id, course=self.course)

        april_agg = summary["class_aggregate"]["by_month"]["2026-04-01"]
        self.assertEqual(april_agg["attended"], 2)
        self.assertEqual(april_agg["total"], 2)
        self.assertEqual(april_agg["pct"], 100.0)

        course_agg = summary["class_aggregate"]["course"]
        self.assertEqual(course_agg["attended"], 2)
        self.assertEqual(course_agg["total"], 2)
        self.assertEqual(course_agg["pct"], 100.0)

    def test_month_with_zero_sessions(self):
        with schema_context(self.schema_name):
            summary = build_course_attendance_summary(self.course.id, course=self.course)

        may_agg = summary["class_aggregate"]["by_month"]["2026-05-01"]
        self.assertEqual(may_agg["total"], 0)
        self.assertEqual(may_agg["pct"], 0.0)

    def test_matrix_matches_summary_for_single_month(self):
        with schema_context(self.schema_name):
            matrix = build_monthly_attendance_matrix(
                self.course.id, year=2026, month=4, all_months=False
            )
            summary = build_course_attendance_summary(self.course.id, course=self.course)

        self.assertIsNotNone(matrix)
        student_a_row = next(r for r in matrix[1:] if r[0] == "Student A")
        student_a = next(s for s in summary["students"] if s["name"] == "Student A")
        self.assertEqual(student_a_row[1], student_a["by_month"]["2026-04-01"]["attended"])
        self.assertEqual(student_a_row[2], student_a["by_month"]["2026-04-01"]["pct"])

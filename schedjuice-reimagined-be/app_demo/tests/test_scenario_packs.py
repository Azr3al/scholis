import unittest
from datetime import date
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_attendance.models import UserEvent
from app_auth.models import User
from app_course.models import Course, Event, Intake, Program, UserCourse
from app_demo.config import ResolvedDemoConfig
from app_demo.scenario_packs.base import run_pack
from app_demo.scenario_packs.enrollment_pipeline import _crm_tables_ready, _has_crm_app


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ScenarioPackRunnerTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:8]
        self.config = ResolvedDemoConfig(
            school_name="Demo School",
            slug=f"demo-{suffix}",
            schema_name=self.schema_name,
            domain_url=f"{suffix}.demo.test",
            demo_date=date(2026, 6, 30),
            terminology={},
            org_toggles={},
            academic_structure={},
            scenario_pack_ids=[],
            demo_stops=[],
            physical_campuses=[],
        )
        result = run_pack(
            "today-classes",
            schema_name=self.schema_name,
            config=self.config,
            pack_ctx={},
        )

        self.assertEqual(result["status"], "applied")
        with schema_context(self.schema_name):
            course = Course.objects.get(title="DEMO-Today-1")
            teacher = User.objects.get(email=f"demo-teacher@{self.config.domain_url}")
            self.assertIn(User.UserRole.TEACHER, teacher.roles)
            self.assertTrue(
                UserCourse.objects.filter(
                    user=teacher,
                    course=course,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                ).exists()
            )
            events = Event.objects.filter(course=course, title__startswith="DEMO-Today-1 / ")
            self.assertEqual(events.count(), 2)
            for event in events:
                self.assertEqual(event.date.date(), self.config.demo_date)

    def test_unpaid_students_creates_course_and_student_enrollments(self):
        result = run_pack(
            "unpaid-students",
            schema_name=self.schema_name,
            config=self.config,
            pack_ctx={},
        )

        self.assertEqual(result["status"], "applied")
        with schema_context(self.schema_name):
            course = Course.objects.get(title="DEMO-Unpaid-Math-L2")
            enrollments = UserCourse.objects.filter(
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            self.assertGreaterEqual(enrollments.count(), 5)

    def test_attendance_story_seeds_mixed_attendance_statuses(self):
        result = run_pack(
            "attendance-story",
            schema_name=self.schema_name,
            config=self.config,
            pack_ctx={},
        )

        self.assertEqual(result["status"], "applied")
        with schema_context(self.schema_name):
            course = Course.objects.get(title="DEMO-Attendance-Story")
            events = Event.objects.filter(course=course, title__startswith="DEMO-Attendance-Story")
            self.assertEqual(events.count(), 3)
            statuses = set(
                UserEvent.objects.filter(event__course=course).values_list(
                    "attendance_status",
                    flat=True,
                )
            )
            self.assertSetEqual(
                statuses,
                {
                    UserEvent.AttendanceStatus.PRESENT,
                    UserEvent.AttendanceStatus.LATE,
                    UserEvent.AttendanceStatus.ABSENT,
                },
            )

    def test_intake_launch_creates_intake_and_planned_course_stubs(self):
        result = run_pack(
            "intake-launch",
            schema_name=self.schema_name,
            config=self.config,
            pack_ctx={},
        )

        self.assertEqual(result["status"], "applied")
        with schema_context(self.schema_name):
            intake = Intake.objects.get(name="DEMO-K12 Intake 2026")
            self.assertEqual(intake.program.course_creation_method, Program.CourseCreationMethod.INTAKE_BASED)
            self.assertEqual(intake.program.subject_strategy, Program.SubjectStrategy.REQUIRED)
            self.assertEqual(intake.courses.count(), 3)
            self.assertSetEqual(
                set(intake.courses.values_list("title", flat=True)),
                {
                    "DEMO-K12-G7-A-Math",
                    "DEMO-K12-G7-B-Science",
                    "DEMO-K12-G8-A-English",
                },
            )

    def test_enrollment_pipeline_seeds_leads_when_crm_available(self):
        if not _has_crm_app():
            self.skipTest("app_crm not installed")

        with schema_context(self.schema_name):
            if not _crm_tables_ready():
                self.skipTest("app_crm tables not migrated in tenant")

        result = run_pack(
            "enrollment-pipeline",
            schema_name=self.schema_name,
            config=self.config,
            pack_ctx={},
        )
        self.assertEqual(result["status"], "applied")

        with schema_context(self.schema_name):
            from app_crm.models import Lead

            self.assertGreaterEqual(Lead.objects.filter(name__startswith="DEMO Lead").count(), 6)

    def test_enrollment_pipeline_skips_with_clear_message_when_crm_unavailable(self):
        with patch(
            "app_demo.scenario_packs.enrollment_pipeline._crm_tables_ready",
            return_value=False,
        ):
            result = run_pack(
                "enrollment-pipeline",
                schema_name=self.schema_name,
                config=self.config,
                pack_ctx={},
            )

        self.assertEqual(result["status"], "skipped")
        self.assertIn("not migrated", result["message"])

    def test_child_tuition_payments_seeds_ymec_courses_and_payments(self):
        config = ResolvedDemoConfig(
            school_name="YMEC",
            slug="ymec-test",
            schema_name=self.schema_name,
            domain_url=f"ymec-{uuid4().hex[:8]}.demo.test",
            demo_date=date(2026, 6, 30),
            terminology={"student": "Child"},
            org_toggles={"currency_iso4217": "MMK"},
            academic_structure={
                "categories": [
                    {"name": "Montessori", "sort_order": 1},
                    {"name": "Whole Brain", "sort_order": 2},
                    {"name": "Half Day", "sort_order": 3},
                    {"name": "Mom & Tots", "sort_order": 4},
                ]
            },
            scenario_pack_ids=[],
            demo_stops=[],
            physical_campuses=[],
        )
        result = run_pack(
            "child-tuition-payments",
            schema_name=self.schema_name,
            config=config,
            pack_ctx={},
        )
        self.assertEqual(result["status"], "applied")
        with schema_context(self.schema_name):
            from app_finance.models import PaymentMethod, UserPayment

            self.assertTrue(Course.objects.filter(title="Montessori — Toddler").exists())
            self.assertTrue(User.objects.filter(name="Swan Ko Ko").exists())
            self.assertTrue(User.objects.filter(name="Shwe Yee Htoo Aung").exists())
            self.assertTrue(PaymentMethod.objects.filter(name="Kpay").exists())
            self.assertTrue(PaymentMethod.objects.filter(name="Ko Aung Ko Kpay").exists())
            swan = User.objects.get(name="Swan Ko Ko")
            shwe = User.objects.get(name="Shwe Yee Htoo Aung")
            self.assertTrue(
                UserPayment.objects.filter(
                    user=swan,
                    status=UserPayment.Status.VERIFIED,
                ).exists()
            )
            self.assertFalse(UserPayment.objects.filter(user=shwe).exists())

    def test_campus_staff_attendance_seeds_building_checkins(self):
        domain = f"campus-{uuid4().hex[:8]}.demo.test"
        config = ResolvedDemoConfig(
            school_name="YMEC",
            slug="ymec-campus",
            schema_name=self.schema_name,
            domain_url=domain,
            demo_date=date(2026, 6, 30),
            terminology={},
            org_toggles={},
            academic_structure={},
            scenario_pack_ids=[],
            demo_stops=[],
            physical_campuses=[
                {
                    "name": "Yangon Montessori Main Campus",
                    "latitude": 16.8661,
                    "longitude": 96.1951,
                    "geofence_radius_meters": 150,
                }
            ],
        )
        result = run_pack(
            "campus-staff-attendance",
            schema_name=self.schema_name,
            config=config,
            pack_ctx={},
        )
        self.assertEqual(result["status"], "applied")
        with schema_context(self.schema_name):
            from app_course.models import Campus
            from app_hr.models import BuildingCheckin

            campus = Campus.objects.get(name="Yangon Montessori Main Campus")
            self.assertGreaterEqual(
                BuildingCheckin.objects.filter(campus=campus).count(),
                10,
            )
            teacher = User.objects.get(email=f"demo-teacher@{domain}")
            self.assertEqual(teacher.name, "Class Advisory")

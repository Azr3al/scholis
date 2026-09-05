import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.id_card_expiry import resolve_id_card_expiry_date, resolve_id_card_expiry_dates
from app_auth.models import User
from app_auth.serializers import UserSerializer
from app_course.models import Category, Course, Program, UserCourse
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ResolveIdCardExpiryDateTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_course_id_card_expiry_enabled=False
            )
            self.tenant = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            self.cat = Category.objects.create(name=f"Cat-{suffix}", sort_order=1)
            self.program = Program.objects.create(name=f"P-exp-{suffix}")
            self.student = User.objects.create_user(
                email=f"exp-{suffix}@example.com",
                password="x",
                name="Expiry Student",
                phone_number="1",
                date_of_birth=date(2010, 1, 1),
                communication_email=f"exp-{suffix}@example.com",
                code=f"EXP-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            self.course_a = Course.objects.create(
                title=f"Course A-{suffix}",
                start_date=date(2026, 1, 1),
                end_date=date(2030, 1, 1),
                status=Course.CourseStatus.ACTIVE,
                category=self.cat,
                program=self.program,
                id_card_expiry_date=date(2026, 6, 30),
            )
            self.course_b = Course.objects.create(
                title=f"Course B-{suffix}",
                start_date=date(2026, 1, 1),
                end_date=date(2030, 1, 1),
                status=Course.CourseStatus.ACTIVE,
                category=self.cat,
                program=self.program,
                id_card_expiry_date=date(2027, 1, 15),
            )
            self.course_no_expiry = Course.objects.create(
                title=f"Course C-{suffix}",
                start_date=date(2026, 1, 1),
                end_date=date(2030, 1, 1),
                status=Course.CourseStatus.ACTIVE,
                category=self.cat,
                program=self.program,
            )

    def _enable_flag(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_course_id_card_expiry_enabled=True
            )
            self.tenant = Organization.objects.get(schema_name=self.schema_name)

    def _enroll(self, course):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def test_flag_off_returns_none(self):
        self._enroll(self.course_a)
        with schema_context(self.schema_name):
            fresh = User.objects.get(pk=self.student.pk)
            self.assertIsNone(
                resolve_id_card_expiry_date(fresh, tenant=self.tenant)
            )

    def test_single_enrollment_with_date_returns_iso(self):
        self._enable_flag()
        self._enroll(self.course_a)
        with schema_context(self.schema_name):
            fresh = User.objects.get(pk=self.student.pk)
            self.assertEqual(
                resolve_id_card_expiry_date(fresh, tenant=self.tenant),
                "2026-06-30",
            )

    def test_two_enrollments_with_different_dates_returns_none(self):
        self._enable_flag()
        self._enroll(self.course_a)
        self._enroll(self.course_b)
        with schema_context(self.schema_name):
            fresh = User.objects.get(pk=self.student.pk)
            self.assertIsNone(
                resolve_id_card_expiry_date(fresh, tenant=self.tenant)
            )

    def test_two_enrollments_with_same_date_returns_date(self):
        self._enable_flag()
        with schema_context(self.schema_name):
            self.course_b.id_card_expiry_date = date(2026, 6, 30)
            self.course_b.save(update_fields=["id_card_expiry_date"])
        self._enroll(self.course_a)
        self._enroll(self.course_b)
        with schema_context(self.schema_name):
            fresh = User.objects.get(pk=self.student.pk)
            self.assertEqual(
                resolve_id_card_expiry_date(fresh, tenant=self.tenant),
                "2026-06-30",
            )

    def test_course_id_filter_uses_filtered_course(self):
        self._enable_flag()
        self._enroll(self.course_a)
        self._enroll(self.course_b)
        with schema_context(self.schema_name):
            fresh = User.objects.get(pk=self.student.pk)
            result = resolve_id_card_expiry_dates(
                [fresh],
                course_id=self.course_a.pk,
                tenant=self.tenant,
            )
        self.assertEqual(result[fresh.pk], "2026-06-30")

    def test_serializer_exposes_id_card_expiry_display_for_student(self):
        self._enable_flag()
        self._enroll(self.course_a)
        with schema_context(self.schema_name):
            fresh = User.objects.get(pk=self.student.pk)
            data = UserSerializer(
                fresh,
                context={"request": type("R", (), {"tenant": self.tenant})()},
            ).data
        self.assertIn("id_card_expiry_display", data)
        self.assertEqual(data["id_card_expiry_display"], "2026-06-30")

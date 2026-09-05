import unittest
from datetime import date, timedelta
from uuid import uuid4

from django.db import connection
from django.test import override_settings
from django.utils import timezone
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.tools.list_user_courses import run_list_user_courses
from app_ai.tools.search_users import run_search_users
from app_ai.tests.test_count_tools import _CountToolsTestBase
from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class PrimaryEmailToolPayloadTests(_CountToolsTestBase):
    def setUp(self):
        self._create_admin_and_teacher()
        self.today = timezone.localdate()
        suffix = uuid4().hex[:6]
        self.primary = f"bruce-primary-{suffix}@yopmail.com"
        self.communication = f"parent+{suffix}@gmail.com"
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            self.student = User.objects.create_user(
                email=self.primary,
                password="x",
                name="Bruce",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                communication_email=self.communication,
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            course = Course.objects.create(
                title="test course 3",
                category=cat,
                program=prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
                status=Course.CourseStatus.ACTIVE,
                created_by=self.admin,
            )
            UserCourse.objects.create(
                user=self.student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def test_search_by_communication_email_returns_primary_email_only(self):
        with schema_context(self.schema_name):
            rows = run_search_users({"query": self.communication}, self.admin)
        self.assertTrue(rows)
        row = rows[0]
        self.assertEqual(row["primary_email"], self.primary)
        self.assertNotIn("communication_email", row)
        self.assertNotIn("email", row)

    def test_search_by_name_returns_primary_email_only(self):
        with schema_context(self.schema_name):
            rows = run_search_users({"query": "Bruce"}, self.admin)
        self.assertTrue(rows)
        self.assertEqual(rows[0]["primary_email"], self.primary)
        self.assertNotIn(self.communication, rows[0])

    def test_list_user_courses_resolve_by_comm_email_uses_primary(self):
        with schema_context(self.schema_name):
            result = run_list_user_courses({"query": self.communication}, self.admin)
        user = result["user"]
        self.assertEqual(user["primary_email"], self.primary)
        self.assertNotIn("communication_email", user)
        self.assertNotIn("email", user)
        self.assertEqual(len(result["courses"]), 1)

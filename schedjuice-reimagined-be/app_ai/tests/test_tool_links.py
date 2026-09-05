import unittest
from datetime import date, timedelta
from unittest.mock import MagicMock, patch
from uuid import uuid4

from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.links import get_current_org
from app_ai.tests.test_count_tools import _CountToolsTestBase
from app_ai.tools.count_course_roster import run_count_course_roster
from app_ai.tools.list_user_courses import run_list_user_courses
from app_ai.tools.query_courses import run_query_courses
from app_ai.tools.search_courses import run_search_courses
from app_ai.tools.search_users import run_search_users
from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _organization_query_count(queries) -> int:
    return sum(
        1
        for q in queries
        if "app_organization_organization" in q["sql"].lower()
    )


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class ToolPayloadLinkFieldsTests(_CountToolsTestBase):
    def setUp(self):
        self._create_admin_and_teacher()
        self.today = timezone.localdate()
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            self.student = User.objects.create_user(
                email=f"bruce-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Bruce",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.cat = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            self.prog = Program.objects.create(
                name=f"P {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title="test course 3",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
                status=Course.CourseStatus.ACTIVE,
                created_by=self.admin,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def test_search_users_includes_profile_url(self):
        with schema_context(self.schema_name):
            rows = run_search_users({"query": "Bruce"}, self.admin)
        self.assertTrue(rows)
        self.assertEqual(
            rows[0]["profile_url"],
            f"https://{self.org.domain_url}/users/{self.student.id}",
        )

    def test_search_courses_includes_url(self):
        with schema_context(self.schema_name):
            rows = run_search_courses({"query": "test course 3"}, self.admin)
        self.assertTrue(rows)
        self.assertEqual(
            rows[0]["url"],
            f"https://{self.org.domain_url}/courses/{self.course.id}",
        )

    def test_list_user_courses_includes_user_and_course_urls(self):
        with schema_context(self.schema_name):
            result = run_list_user_courses(
                {"user_id": self.student.id},
                self.admin,
            )
        self.assertEqual(
            result["user"]["profile_url"],
            f"https://{self.org.domain_url}/users/{self.student.id}",
        )
        self.assertEqual(len(result["courses"]), 1)
        self.assertEqual(
            result["courses"][0]["url"],
            f"https://{self.org.domain_url}/courses/{self.course.id}",
        )

    def test_count_course_roster_includes_url(self):
        with schema_context(self.schema_name):
            result = run_count_course_roster(
                {"course_id": self.course.id, "member_type": "all"},
                self.admin,
            )
        self.assertEqual(
            result["course"]["url"],
            f"https://{self.org.domain_url}/courses/{self.course.id}",
        )


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class ToolOrgLookupQueryCountTests(_CountToolsTestBase):
    """Organization is resolved once per tool call, not once per result row."""

    def setUp(self):
        self._create_admin_and_teacher()
        self.today = timezone.localdate()
        self.shared_name = f"LinkBatch {uuid4().hex[:4]}"
        with schema_context(self.schema_name):
            self.students = [
                User.objects.create_user(
                    email=f"link-{i}-{uuid4().hex[:6]}@e.com",
                    password="x",
                    name=self.shared_name,
                    phone_number="-",
                    date_of_birth=date(2010, 1, 1),
                    roles=[User.UserRole.STUDENT],
                )
                for i in range(3)
            ]
            self.cat = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            self.prog = Program.objects.create(
                name=f"P {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.courses = [
                Course.objects.create(
                    title=f"{self.shared_name} course {i}",
                    category=self.cat,
                    program=self.prog,
                    start_date=self.today,
                    end_date=self.today + timedelta(days=30),
                    status=Course.CourseStatus.ACTIVE,
                    created_by=self.admin,
                )
                for i in range(3)
            ]
            for student in self.students:
                UserCourse.objects.create(
                    user=student,
                    course=self.courses[0],
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                )

    def test_search_users_org_lookup_at_most_once(self):
        with schema_context(self.schema_name):
            with CaptureQueriesContext(connection) as ctx:
                rows = run_search_users({"query": self.shared_name, "limit": 20}, self.admin)
        self.assertGreaterEqual(len(rows), 3)
        self.assertLessEqual(_organization_query_count(ctx.captured_queries), 1)

    def test_search_courses_org_lookup_at_most_once(self):
        with schema_context(self.schema_name):
            with CaptureQueriesContext(connection) as ctx:
                rows = run_search_courses(
                    {"query": self.shared_name, "limit": 20},
                    self.admin,
                )
        self.assertGreaterEqual(len(rows), 3)
        self.assertLessEqual(_organization_query_count(ctx.captured_queries), 1)

    def test_list_user_courses_org_lookup_at_most_once(self):
        target = self.students[0]
        with schema_context(self.schema_name):
            with CaptureQueriesContext(connection) as ctx:
                result = run_list_user_courses({"user_id": target.id}, self.admin)
        self.assertGreaterEqual(len(result["courses"]), 1)
        self.assertIn("profile_url", result["user"])
        self.assertLessEqual(_organization_query_count(ctx.captured_queries), 1)

    @patch("app_ai.tools.query_courses.org_today")
    def test_query_courses_org_lookup_at_most_once(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            with CaptureQueriesContext(connection) as ctx:
                result = run_query_courses({}, self.admin)
        self.assertGreaterEqual(result["count"], 3)
        self.assertLessEqual(_organization_query_count(ctx.captured_queries), 1)


class GetCurrentOrgCacheTests(TestCase):
    def test_get_current_org_queries_database_once_per_schema(self):
        org = MagicMock()
        mock_filter = MagicMock()
        mock_filter.first.return_value = org
        mock_connection = MagicMock()
        mock_connection.schema_name = "tenant_test"
        mock_connection._ai_current_org_cache = None

        with patch("app_ai.links.connection", mock_connection):
            with patch("app_ai.links.get_public_schema_name", return_value="public"):
                with patch("app_ai.links.schema_context"):
                    with patch(
                        "app_ai.links.Organization.objects.filter",
                        return_value=mock_filter,
                    ) as org_filter:
                        first = get_current_org()
                        second = get_current_org()

        self.assertIs(first, org)
        self.assertIs(second, org)
        org_filter.assert_called_once_with(schema_name="tenant_test")
        mock_filter.first.assert_called_once()

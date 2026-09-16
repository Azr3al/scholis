"""Course roster endpoints must not require Teams when creation is disabled."""

from datetime import date
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM
from app_auth.models import User
from app_course.models import Category, Course, UserCourse
from app_course.program_helpers import get_default_program
from app_organization.models import Organization


class CourseStudentTeamsGateTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        ensure_public_schema()
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=cls.schema_name).update(
                is_microsoft_on=True,
                is_teams_creation_enabled=False,
                timezone="UTC",
            )
        with schema_context(cls.schema_name):
            cls.cat = Category.objects.first() or Category.objects.create(
                name=f"TeamsGateCat-{uuid4().hex[:6]}"
            )
            cls.course = Course.objects.create(
                title=f"Teams Gate Course {uuid4().hex[:6]}",
                description="Course",
                code=f"TG-{uuid4().hex[:6]}",
                category=cls.cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )
            cls.admin = User.objects.create_user(
                email=f"admin-teams-{uuid4().hex[:6]}@teams-gate.example",
                password="pw-test-123",
                phone_number="1",
                communication_email=f"admin-teams-{uuid4().hex[:6]}@teams-gate.example",
                name="Admin",
                date_of_birth=date(1990, 1, 1),
                code=f"tg-admin-{uuid4().hex[:6]}",
                roles=[User.UserRole.ADMIN],
            )
            cls.student = User.objects.create_user(
                email=f"student-teams-{uuid4().hex[:6]}@teams-gate.example",
                password="pw-test-123",
                phone_number="2",
                communication_email=f"student-teams-{uuid4().hex[:6]}@teams-gate.example",
                name="Student",
                date_of_birth=date(1990, 1, 1),
                code=f"tg-student-{uuid4().hex[:6]}",
                roles=[User.UserRole.STUDENT],
                microsoft_id=None,
            )

    def setUp(self):
        self.org = Organization.objects.get(schema_name=self.schema_name)
        self.cat = type(self).cat
        self.course = type(self).course
        self.admin = type(self).admin
        self.student = type(self).student

    def _client(self, user: User) -> APIClient:
        token = AccessToken.for_user(user)
        token[JWT_TENANT_SCHEMA_CLAIM] = self.schema_name
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        return client

    @patch("app_course.views.MSGroup.add_member")
    def test_add_student_succeeds_when_teams_creation_disabled(self, mock_add_member):
        client = self._client(self.admin)
        res = client.post(
            f"/api/v1/courses/{self.course.id}/students",
            {"user_id": self.student.id},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        payload = res.json()
        self.assertFalse(payload.get("isError"))
        with schema_context(self.schema_name):
            self.assertTrue(
                UserCourse.objects.filter(
                    course_id=self.course.id,
                    user_id=self.student.id,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                ).exists()
            )
        mock_add_member.assert_not_called()

    @patch("app_course.views.MSGroup.add_member")
    def test_add_student_requires_team_when_teams_creation_enabled(self, mock_add_member):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_teams_creation_enabled=True
            )
        client = self._client(self.admin)
        res = client.post(
            f"/api/v1/courses/{self.course.id}/students",
            {"user_id": self.student.id},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        details = res.json().get("details", "")
        self.assertIn("Microsoft", str(details))
        with schema_context(self.schema_name):
            self.assertFalse(
                UserCourse.objects.filter(
                    course_id=self.course.id,
                    user_id=self.student.id,
                ).exists()
            )
        mock_add_member.assert_not_called()

    @patch("app_course.views.MSGroup.add_member")
    def test_bulk_management_skips_teams_when_creation_disabled(self, mock_add_member):
        client = self._client(self.admin)
        res = client.post(
            "/api/v1/user-courses/management",
            [
                {
                    "user": self.student.id,
                    "course": self.course.id,
                    "assigned_as": UserCourse.AssignedAs.STUDENT,
                }
            ],
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        payload = res.json()
        self.assertFalse(payload.get("isError"))
        with schema_context(self.schema_name):
            self.assertTrue(
                UserCourse.objects.filter(
                    course_id=self.course.id,
                    user_id=self.student.id,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                ).exists()
            )
        mock_add_member.assert_not_called()

    def test_list_students_with_stateless_jwt_returns_enrolled_student(self):
        """Regression: stateless JWT sets request.user.id to email, not pk."""
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
        client = self._client(self.admin)
        res = client.get(f"/api/v1/courses/{self.course.id}/students")
        self.assertEqual(res.status_code, 200, res.content)
        payload = res.json()
        self.assertFalse(payload.get("isError"))
        student_ids = {row["id"] for row in payload["data"]}
        self.assertIn(self.student.id, student_ids)

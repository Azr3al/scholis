"""Regression: roster management must not commit removals when create validation fails."""

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
from app_rbac.seeding import seed_rbac


class RosterManagementAtomicTests(TestCase):
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
                is_teams_creation_enabled=True,
                timezone="UTC",
            )
        with schema_context(cls.schema_name):
            seed_rbac()
            cls.cat = Category.objects.first() or Category.objects.create(
                name=f"RosterAtomicCat-{uuid4().hex[:6]}"
            )
            cls.course = Course.objects.create(
                title=f"Roster Atomic Course {uuid4().hex[:6]}",
                description="Course",
                code=f"RA-{uuid4().hex[:6]}",
                category=cls.cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
                microsoft_group_id=f"ms-group-{uuid4().hex[:8]}",
            )
            cls.admin = User.objects.create_user(
                email=f"admin-roster-{uuid4().hex[:6]}@roster.example",
                password="pw-test-123",
                phone_number="1",
                communication_email=f"admin-roster-{uuid4().hex[:6]}@roster.example",
                name="Admin",
                date_of_birth=date(1990, 1, 1),
                code=f"ra-admin-{uuid4().hex[:6]}",
                roles=[User.UserRole.ADMIN],
            )
            cls.student_a = User.objects.create_user(
                email=f"student-a-{uuid4().hex[:6]}@roster.example",
                password="pw-test-123",
                phone_number="2",
                communication_email=f"student-a-{uuid4().hex[:6]}@roster.example",
                name="Student A",
                date_of_birth=date(1990, 1, 1),
                code=f"ra-a-{uuid4().hex[:6]}",
                roles=[User.UserRole.STUDENT],
                microsoft_id=f"ms-a-{uuid4().hex[:8]}",
            )
            cls.student_b = User.objects.create_user(
                email=f"student-b-{uuid4().hex[:6]}@roster.example",
                password="pw-test-123",
                phone_number="3",
                communication_email=f"student-b-{uuid4().hex[:6]}@roster.example",
                name="Student B",
                date_of_birth=date(1990, 1, 1),
                code=f"ra-b-{uuid4().hex[:6]}",
                roles=[User.UserRole.STUDENT],
                microsoft_id=None,
            )
            UserCourse.objects.create(
                user=cls.student_a,
                course=cls.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def setUp(self):
        self.course = type(self).course
        self.admin = type(self).admin
        self.student_a = type(self).student_a
        self.student_b = type(self).student_b
        with schema_context(self.schema_name):
            UserCourse.objects.get_or_create(
                user=self.student_a,
                course=self.course,
                defaults={"assigned_as": UserCourse.AssignedAs.STUDENT},
            )
            UserCourse.objects.filter(
                user=self.student_b, course=self.course
            ).delete()

    def _client(self, user: User) -> APIClient:
        token = AccessToken.for_user(user)
        token[JWT_TENANT_SCHEMA_CLAIM] = self.schema_name
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        return client

    def test_invalid_create_after_remove_does_not_commit_removals(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_microsoft_on=True,
                is_teams_creation_enabled=True,
            )
        client = self._client(self.admin)
        res = client.post(
            "/api/v1/user-courses/management",
            [
                {
                    "user": self.student_a.id,
                    "course": self.course.id,
                    "assigned_as": UserCourse.AssignedAs.STUDENT,
                    "isRemoved": True,
                },
                {
                    "user": self.student_b.id,
                    "course": self.course.id,
                    "assigned_as": UserCourse.AssignedAs.STUDENT,
                },
            ],
            format="json",
        )
        self.assertEqual(res.status_code, 400, res.content)
        with schema_context(self.schema_name):
            self.assertTrue(
                UserCourse.objects.filter(
                    user_id=self.student_a.id, course_id=self.course.id
                ).exists()
            )
            self.assertFalse(
                UserCourse.objects.filter(
                    user_id=self.student_b.id, course_id=self.course.id
                ).exists()
            )

    @patch("app_course.views.MSGroup")
    def test_valid_remove_and_add_commits(self, mock_ms_group_cls):
        mock_ms_group_cls.return_value.add_member.return_value = None
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_microsoft_on=True,
                is_teams_creation_enabled=True,
            )
        with schema_context(self.schema_name):
            self.student_b.microsoft_id = f"ms-b-{uuid4().hex[:8]}"
            self.student_b.save(update_fields=["microsoft_id"])
        client = self._client(self.admin)
        res = client.post(
            "/api/v1/user-courses/management",
            [
                {
                    "user": self.student_a.id,
                    "course": self.course.id,
                    "assigned_as": UserCourse.AssignedAs.STUDENT,
                    "isRemoved": True,
                },
                {
                    "user": self.student_b.id,
                    "course": self.course.id,
                    "assigned_as": UserCourse.AssignedAs.STUDENT,
                },
            ],
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertFalse(res.json().get("isError"))
        with schema_context(self.schema_name):
            self.assertFalse(
                UserCourse.objects.filter(
                    user_id=self.student_a.id, course_id=self.course.id
                ).exists()
            )
            self.assertTrue(
                UserCourse.objects.filter(
                    user_id=self.student_b.id,
                    course_id=self.course.id,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                ).exists()
            )
        mock_ms_group_cls.return_value.add_member.assert_called()

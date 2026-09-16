"""Tests that admin account activation also enrolls pending join requests."""

from datetime import date
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM
from app_auth.models import User
from app_course.models import (
    Category,
    Course,
    CourseJoinRequest,
    UserCourse,
)
from app_course.program_helpers import get_default_program
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac

class StudentActivationEnrollmentTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        ensure_public_schema()
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=cls.schema_name).update(
                is_microsoft_on=False,
                is_teams_creation_enabled=False,
                timezone="UTC",
            )
        with schema_context(cls.schema_name):
            seed_rbac()
            cls.cat = Category.objects.first() or Category.objects.create(
                name=f"ActCat-{uuid4().hex[:6]}"
            )
            cls.course = Course.objects.create(
                title=f"Activation Course {uuid4().hex[:6]}",
                description="Course",
                code=f"AC-{uuid4().hex[:6]}",
                category=cls.cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )
            cls.admin = User.objects.create_user(
                email=f"admin-act-{uuid4().hex[:6]}@act.example",
                password="pw-test-123",
                phone_number="1",
                communication_email=f"admin-act-{uuid4().hex[:6]}@act.example",
                name="Admin",
                date_of_birth=date(1990, 1, 1),
                code=f"act-admin-{uuid4().hex[:6]}",
                roles=[User.UserRole.ADMIN],
            )

    def _client(self, user: User) -> APIClient:
        token = AccessToken.for_user(user)
        token[JWT_TENANT_SCHEMA_CLAIM] = self.schema_name
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        return client

    @patch("app_course.join_request_approval.async_task")
    def test_activate_account_creates_user_course_for_pending_join_request(
        self, _mock_mail
    ):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            pending_student = User.objects.create_user(
                email=f"pending-act-{suffix}@act.example",
                password="pw-test-123",
                phone_number="2",
                communication_email=f"pending-act-{suffix}@act.example",
                name="Pending Student",
                date_of_birth=date(2010, 1, 1),
                code=f"act-pending-{suffix}",
                roles=[User.UserRole.STUDENT],
                is_active=False,
                is_waiting_for_activation=True,
            )
            join_request = CourseJoinRequest.objects.create(
                course=self.course,
                user=pending_student,
                status=CourseJoinRequest.Status.PENDING,
            )

        client = self._client(type(self).admin)
        with schema_context(self.schema_name):
            resp = client.get(
                reverse(
                    "activate-account",
                    kwargs={"user_id": str(pending_student.id)},
                )
            )
            self.assertEqual(resp.status_code, 200)

            pending_student.refresh_from_db()
            join_request.refresh_from_db()

            self.assertTrue(pending_student.is_active)
            self.assertFalse(pending_student.is_waiting_for_activation)
            self.assertEqual(join_request.status, CourseJoinRequest.Status.APPROVED)
            self.assertTrue(
                UserCourse.objects.filter(
                    user_id=pending_student.id,
                    course_id=self.course.id,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                ).exists()
            )


"""Tests for public student self-registration (course_id validation, join dedup)."""

from datetime import date
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User, VerificationCode
from app_course.models import Category, Course, CourseJoinRequest
from app_course.program_helpers import get_default_program
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac


class StudentSelfRegisterTest(TestCase):
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
                is_student_login_disabled=False,
                timezone="UTC",
            )
        with schema_context(cls.schema_name):
            seed_rbac()
            cls.cat = Category.objects.first() or Category.objects.create(
                name=f"SelfRegCat-{uuid4().hex[:6]}"
            )
            cls.course = Course.objects.create(
                title=f"Self Register Course {uuid4().hex[:6]}",
                description="Course",
                code=f"SR-{uuid4().hex[:6]}",
                category=cls.cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )

    def _public_client(self) -> APIClient:
        client = APIClient()
        client.credentials(HTTP_X_DTS_SCHEMA=self.schema_name)
        return client

    def _student_payload(self, suffix: str, *, course_id=None, password="SecurePass123!") -> dict:
        email = f"selfreg-{suffix}@selfreg.example"
        payload = {
            "name": f"Student {suffix}",
            "email": email,
            "password": password,
            "confirm_password": password,
            "communication_email": email,
            "phone_number": "1234567890",
            "roles": [User.UserRole.STUDENT],
            "is_waiting_for_activation": True,
        }
        if course_id is not None:
            payload["course_id"] = course_id
        return payload

    def _seed_verified_otp(self, email: str) -> None:
        with schema_context(self.schema_name):
            VerificationCode.objects.create(
                email=email,
                digit_code="123456",
                source=VerificationCode.Source.EMAIL_VERIFICATION,
                is_used=True,
            )

    def test_self_register_without_verified_otp_returns_400(self):
        suffix = uuid4().hex[:6]
        payload = self._student_payload(suffix)
        client = self._public_client()

        resp = client.post(
            reverse("self-register"),
            payload,
            format="json",
        )

        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data.get("message"), "email_not_verified")

    @patch("app_auth.serializers.async_task")
    def test_self_register_rejects_unknown_course_id(self, _mock_mail):
        suffix = uuid4().hex[:6]
        payload = self._student_payload(suffix, course_id=999999999)
        self._seed_verified_otp(payload["email"])
        client = self._public_client()

        resp = client.post(
            reverse("self-register"),
            payload,
            format="json",
        )

        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data.get("message"), "invalid_course")
        self.assertIn("course_id", str(resp.data))

    @patch("app_auth.serializers.async_task")
    def test_self_register_does_not_duplicate_pending_join_request(self, _mock_mail):
        suffix = uuid4().hex[:6]
        payload = self._student_payload(suffix, course_id=self.course.id)
        self._seed_verified_otp(payload["email"])
        client = self._public_client()

        resp1 = client.post(reverse("self-register"), payload, format="json")
        self.assertEqual(resp1.status_code, 200, resp1.data)

        resp2 = client.post(reverse("self-register"), payload, format="json")
        self.assertEqual(resp2.status_code, 400)

        with schema_context(self.schema_name):
            user = User.objects.get(email=payload["email"])
            pending_count = CourseJoinRequest.objects.filter(
                user=user,
                course=self.course,
                status=CourseJoinRequest.Status.PENDING,
            ).count()
            self.assertEqual(pending_count, 1)

    @patch("app_auth.serializers.async_task")
    def test_self_register_always_sets_waiting_for_activation(self, _mock_mail):
        suffix = uuid4().hex[:6]
        payload = self._student_payload(suffix)
        payload["is_waiting_for_activation"] = False
        payload["is_active"] = True
        payload["roles"] = [User.UserRole.ADMIN]
        self._seed_verified_otp(payload["email"])
        client = self._public_client()

        resp = client.post(reverse("self-register"), payload, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)

        with schema_context(self.schema_name):
            user = User.objects.get(email=payload["email"])
            self.assertFalse(user.is_active)
            self.assertTrue(user.is_waiting_for_activation)
            self.assertFalse(user.is_staff)
            self.assertEqual(user.roles, [User.UserRole.STUDENT])

    @patch("app_auth.serializers.async_task")
    def test_self_register_rejects_weak_password(self, _mock_mail):
        suffix = uuid4().hex[:6]
        payload = self._student_payload(suffix, password="short")
        self._seed_verified_otp(payload["email"])
        client = self._public_client()

        resp = client.post(reverse("self-register"), payload, format="json")

        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data.get("message"), "invalid_data")
        self.assertIn("password", str(resp.data))

    @patch("app_auth.serializers.CreateUserFlow")
    @patch("app_auth.serializers.async_task")
    def test_self_register_skips_microsoft_provisioning(self, _mock_mail, mock_flow):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_microsoft_on=True,
                available_domains=["selfreg.example"],
            )
        suffix = uuid4().hex[:6]
        payload = self._student_payload(suffix)
        self._seed_verified_otp(payload["email"])
        client = self._public_client()

        resp = client.post(reverse("self-register"), payload, format="json")

        self.assertEqual(resp.status_code, 200, resp.data)
        mock_flow.assert_not_called()

        with schema_context(self.schema_name):
            user = User.objects.get(email=payload["email"])
            self.assertIsNone(user.microsoft_id)

        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_microsoft_on=False,
                available_domains=[],
            )

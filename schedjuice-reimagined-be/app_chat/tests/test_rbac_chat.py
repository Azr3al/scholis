import unittest
from datetime import date, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

def _jwt_token_user(email: str):
    return type(
        "TokenUser",
        (),
        {"id": email, "is_authenticated": True},
    )()

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class ChatRBACTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        today = timezone.localdate()
        with schema_context(self.schema_name):
            seed_rbac()
            self.student = User.objects.create_user(
                email=f"stu-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.admin = User.objects.create_user(
                email=f"adm-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C {suffix}",
                category=cat,
                program=prog,
                start_date=today,
                end_date=today + timedelta(days=30),
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as="student",
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=_jwt_token_user(user.email))
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_admin_without_participate_permission_denied(self, mock_authenticate):
        mock_authenticate.return_value = (_jwt_token_user(self.admin.email), None)
        with schema_context(self.schema_name):
            from app_chat.services import get_or_create_course_chat_thread

            thread_id = get_or_create_course_chat_thread(self.course.id).id
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.admin).get(
                f"/api/v1/chat/threads/{thread_id}/messages"
            )
        self.assertEqual(resp.status_code, 403)

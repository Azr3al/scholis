import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_rbac.seeding import seed_rbac
from app_userlog import models

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class ReportTypeViewTest(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"ul-admin-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"ul-admin-{suffix}@example.com",
                code=f"ul-admin-{suffix}",
                roles=[User.UserRole.ADMIN],
            )

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class UserLogEntryViewTest(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _user(self, roles, prefix):
        s = uuid4().hex[:6]
        return User.objects.create_user(
            email=f"{prefix}-{s}@example.com",
            password="x",
            name=prefix,
            phone_number="1",
            date_of_birth=date(2000, 1, 1),
            communication_email=f"{prefix}-{s}@example.com",
            code=f"{prefix}-{s}",
            roles=roles,
        )

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def setUp(self):
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = self._user([User.UserRole.ADMIN], "ul-admin")
            self.teacher = self._user([User.UserRole.TEACHER], "ul-teach")
            self.student = self._user([User.UserRole.STUDENT], "ul-stu")
            self.rt = models.ReportType.objects.create(
                name=f"Behavioural-{uuid4().hex[:6]}",
                applies_to=models.ReportType.AppliesTo.STUDENT,
            )

    def test_subject_cannot_see_own_logs(self):
        with schema_context(self.schema_name):
            self._client(self.admin).post(
                f"{self.api_prefix}/users/{self.student.id}/logs",
                {"report_type": self.rt.id, "title": "Late"},
                format="json",
            )
            res = self._client(self.student).get(
                f"{self.api_prefix}/users/{self.student.id}/logs"
            )
            self.assertEqual(res.status_code, 403)

    def test_teacher_cannot_edit_others_entry(self):
        with schema_context(self.schema_name):
            created = self._client(self.admin).post(
                f"{self.api_prefix}/users/{self.student.id}/logs",
                {"report_type": self.rt.id, "title": "Late"},
                format="json",
            ).json()["data"]
            res = self._client(self.teacher).patch(
                f"{self.api_prefix}/logs/{created['id']}",
                {"title": "Edited"},
                format="json",
            )
            self.assertEqual(res.status_code, 403)

    def test_author_can_edit_and_timeline_has_levels(self):
        with schema_context(self.schema_name):
            created = self._client(self.teacher).post(
                f"{self.api_prefix}/users/{self.student.id}/logs",
                {"report_type": self.rt.id, "title": "Late"},
                format="json",
            ).json()["data"]
            self._client(self.teacher).patch(
                f"{self.api_prefix}/logs/{created['id']}",
                {"title": "Edited"},
                format="json",
            )
            res = self._client(self.admin).get(
                f"{self.api_prefix}/logs/{created['id']}/timeline"
            )
            levels = {i["level"] for i in res.json()["data"]}
            self.assertEqual(levels, {"MAJOR", "DETAIL"})

import unittest
from datetime import date, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class ReportsRBACTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.today = timezone.localdate()
        with schema_context(self.schema_name):
            seed_rbac()
            self.manager = User.objects.create_user(
                email=f"mgr-{suffix}@example.com",
                password="x",
                name="Manager",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.MANAGER],
            )
            self.teacher = User.objects.create_user(
                email=f"tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _date_range(self):
        end = self.today
        start = end - timedelta(days=7)
        return start.isoformat(), end.isoformat()

    def test_teacher_forbidden_on_analytics_time_series(self):
        start, end = self._date_range()
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).get(
                f"/api/v1/reports/analytics/time-series?start={start}&end={end}"
            )
        self.assertEqual(resp.status_code, 403)

    def test_teacher_forbidden_on_user_activity_login_trends(self):
        start, end = self._date_range()
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).get(
                f"/api/v1/reports/user-activity/login-trends?start={start}&end={end}"
            )
        self.assertEqual(resp.status_code, 403)

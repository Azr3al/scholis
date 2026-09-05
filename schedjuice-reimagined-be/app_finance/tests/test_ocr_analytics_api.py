import unittest
from datetime import date
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.models import OcrExtractionEvent
from app_auth.models import User
from app_finance.ocr_event_log import record_ocr_extraction_event
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class OcrAnalyticsApiTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.teacher = User.objects.create_user(
                email=f"teacher-ocr-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.superadmin = User.objects.filter(
                roles__contains=[User.UserRole.SUPERADMIN]
            ).first()
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_teacher_forbidden(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).get("/api/v1/management/ocr-analytics")
        self.assertEqual(resp.status_code, 403)

    @patch("app_finance.ocr_analytics_reporting.get_cached_ocr_space_conversions")
    def test_superadmin_ok(self, mock_vendor):
        mock_vendor.return_value = {"available": True, "total": 0}
        record_ocr_extraction_event(
            event_id=str(uuid4()),
            schema_name=self.schema_name,
            source=OcrExtractionEvent.Source.IMAGE_UPLOAD,
            trigger=OcrExtractionEvent.Trigger.PREVIEW,
            outcome=OcrExtractionEvent.Outcome.SUCCESS,
            extracted_transaction_id="12345678901234567890",
            extracted_amount="50000",
        )
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.superadmin).get("/api/v1/management/ocr-analytics")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertFalse(body.get("isError"))
        self.assertIn("summary", body.get("data", {}))
        self.assertIn("by_source", body.get("data", {}))

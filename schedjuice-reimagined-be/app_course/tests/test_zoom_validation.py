"""Course serializer / manual Zoom meeting id resolution tests."""

from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

from cryptography.fernet import Fernet
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone as django_timezone
from rest_framework.test import APIRequestFactory
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import Category
from app_course.program_helpers import get_default_program
from app_course.serializers import CourseSerializer
from app_organization.models import Organization, ZoomAccount


@override_settings(ZOOM_TOKEN_ENCRYPTION_KEY=Fernet.generate_key().decode())
class ZoomManualMeetingValidationTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        ensure_public_schema()
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        cls.org = Organization.objects.get(schema_name=cls.schema_name)
        with schema_context(get_public_schema_name()):
            cls.za = ZoomAccount.objects.create(
                organization=cls.org,
                account_id=f"ACCT1-{uuid4().hex[:8]}",
                expires_at=django_timezone.now() + timedelta(hours=1),
            )
            cls.za.set_tokens(access_token="AT", refresh_token="RT")
        with schema_context(cls.schema_name):
            cls.cat = Category.objects.first()
            if cls.cat is None:
                cls.cat = Category.objects.create(name="Zoom validation category")

    def _request(self):
        from rest_framework.request import Request

        factory = APIRequestFactory()
        wsgi = factory.get("/")
        wsgi.tenant = self.org
        return Request(wsgi)

    @patch("app_course.zoom_manual_meeting.get_meeting")
    def test_resolves_when_single_match(self, mock_get):
        mock_get.return_value = {
            "id": 12345,
            "uuid": "U==",
            "host_id": "H",
        }
        request = self._request()
        data = {
            "title": "T",
            "description": "D",
            "code": "ZM1",
            "category": self.cat.id,
            "start_date": "2026-05-01",
            "end_date": "2026-06-01",
            "zoom_meeting_id": "12345",
        }
        with schema_context(self.schema_name):
            program = get_default_program()
            ser = CourseSerializer(
                data={
                    **data,
                    "program": program.id,
                },
                context={"request": request},
            )
            self.assertTrue(ser.is_valid(), ser.errors)
            self.assertEqual(ser.validated_data["zoom_account_id"], self.za.account_id)
            self.assertEqual(ser.validated_data["zoom_meeting_uuid"], "U==")

    @patch("app_course.zoom_manual_meeting.get_meeting")
    def test_multiple_matches_need_account(self, mock_get):
        with schema_context(get_public_schema_name()):
            za2 = ZoomAccount.objects.create(
                organization=self.org,
                account_id=f"ACCT2-{uuid4().hex[:8]}",
                expires_at=django_timezone.now() + timedelta(hours=1),
            )
            za2.set_tokens(access_token="AT2", refresh_token="RT2")
        mock_get.return_value = {"id": 12345, "uuid": "U==", "host_id": "H"}
        request = self._request()
        data = {
            "title": "T2",
            "description": "D",
            "code": "ZM2",
            "category": self.cat.id,
            "start_date": "2026-05-01",
            "end_date": "2026-06-01",
            "zoom_meeting_id": "12345",
        }
        with schema_context(self.schema_name):
            program = get_default_program()
            ser = CourseSerializer(
                data={
                    **data,
                    "program": program.id,
                },
                context={"request": request},
            )
            self.assertFalse(ser.is_valid())
            self.assertIn("zoom_account_id", ser.errors)

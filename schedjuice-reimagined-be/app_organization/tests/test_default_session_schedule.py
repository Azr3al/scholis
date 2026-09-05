from datetime import time

from django.db import connection
from django.test import TestCase

from app_organization.models import Organization
from app_organization.serializers import OrganizationSerializer

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

class DefaultSessionScheduleSerializerTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if not _database_reachable():
            raise AssertionError("PostgreSQL not available")

    def setUp(self):
        self.org = Organization.objects.filter(schema_name="xschedjuice").first()
        if self.org is None:
            self.skipTest("xschedjuice tenant not bootstrapped")

    def test_serializer_rejects_zero_duration(self):
        ser = OrganizationSerializer(
            self.org,
            data={"default_session_duration_minutes": 0},
            partial=True,
        )
        self.assertFalse(ser.is_valid())
        self.assertIn("default_session_duration_minutes", ser.errors)


import base64
import json
import unittest
from datetime import date
from decimal import Decimal
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from tenant_schemas.utils import schema_context

from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM
from app_auth.models import User

RATE_FIELDS = [
    "id",
    "name",
    "email",
    "per_hour_rate",
    "student_bonus_hourly_rate",
    "per_session_rate",
]


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _encode_query_param(value) -> str:
    raw = base64.urlsafe_b64encode(json.dumps(value).encode()).decode()
    return raw.rstrip("=")


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class UserSearchRateFieldsTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _client(self, user: User) -> APIClient:
        token = AccessToken.for_user(user)
        token[JWT_TENANT_SCHEMA_CLAIM] = self.schema_name
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_TENANT=self.schema_name,
        )
        return client

    def _admin(self) -> User:
        with schema_context(self.schema_name):
            return User.objects.create_user(
                email=f"admin-{uuid4().hex[:8]}@usqc.example",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )

    def test_search_returns_rate_fields_when_requested(self):
        email = f"teacher-rates-{uuid4().hex[:8]}@usqc.example"

        with schema_context(self.schema_name):
            User.objects.create_user(
                email=email,
                password="x",
                name="Teacher With Rates",
                phone_number="09-123-4567",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
                per_hour_rate=Decimal("1500.00"),
                student_bonus_hourly_rate=Decimal("200.00"),
                per_session_rate=Decimal("5000.00"),
            )

        admin = self._admin()
        client = self._client(admin)
        params = (
            f"?size=-1"
            f"&sorts={_encode_query_param(['email'])}"
            f"&fields={_encode_query_param(RATE_FIELDS)}"
        )
        res = client.post(
            f"/api/v1/users/search{params}",
            {
                "filter_params": [
                    {
                        "field_name": "email",
                        "operator": "in",
                        "value": email,
                    },
                    {
                        "field_name": "roles",
                        "operator": "contained_by",
                        "value": "{teacher}",
                    },
                ],
            },
            format="json",
        )

        self.assertEqual(res.status_code, 200, res.content)
        payload = res.json()
        self.assertFalse(payload.get("isError"))
        rows = [row for row in payload["data"] if row["email"] == email]
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["name"], "Teacher With Rates")
        self.assertEqual(Decimal(str(row["per_hour_rate"])), Decimal("1500.00"))
        self.assertEqual(
            Decimal(str(row["student_bonus_hourly_rate"])), Decimal("200.00")
        )
        self.assertEqual(Decimal(str(row["per_session_rate"])), Decimal("5000.00"))

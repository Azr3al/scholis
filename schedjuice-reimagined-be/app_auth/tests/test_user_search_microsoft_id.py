import base64
import json
import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from tenant_schemas.utils import schema_context

from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM
from app_auth.models import User


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
class UserSearchMicrosoftIdTest(TestCase):
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

    def test_search_returns_microsoft_id_for_linked_student(self):
        ms_id = f"ms-{uuid4()}"
        email = f"linked-student-{uuid4().hex[:8]}@usqc.example"

        with schema_context(self.schema_name):
            User.objects.create_user(
                email=email,
                password="x",
                name="Linked Student",
                phone_number="09-123-4567",
                date_of_birth=date(2000, 1, 1),
                roles=[User.UserRole.STUDENT],
                microsoft_id=ms_id,
            )

        admin = self._admin()
        client = self._client(admin)
        res = client.post(
            f"/api/v1/users/search?size=-1&sorts={_encode_query_param(['email'])}",
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
                        "value": "{student}",
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
        self.assertEqual(rows[0]["microsoft_id"], ms_id)

    def test_search_returns_null_microsoft_id_for_unlinked_student(self):
        email = f"unlinked-student-{uuid4().hex[:8]}@usqc.example"

        with schema_context(self.schema_name):
            User.objects.create_user(
                email=email,
                password="x",
                name="Unlinked Student",
                phone_number="09-123-4567",
                date_of_birth=date(2000, 1, 1),
                roles=[User.UserRole.STUDENT],
            )

        admin = self._admin()
        client = self._client(admin)
        res = client.post(
            f"/api/v1/users/search?size=-1&sorts={_encode_query_param(['email'])}",
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
                        "value": "{student}",
                    },
                ],
            },
            format="json",
        )

        self.assertEqual(res.status_code, 200, res.content)
        payload = res.json()
        rows = [row for row in payload["data"] if row["email"] == email]
        self.assertEqual(len(rows), 1)
        self.assertIsNone(rows[0]["microsoft_id"])

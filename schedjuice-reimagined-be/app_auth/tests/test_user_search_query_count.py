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

HUB_FIELDS = [
    "id",
    "name",
    "alternative_name",
    "email",
    "phone_number",
    "roles",
    "is_active",
    "profile_image",
    "profile_completeness",
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
class UserSearchQueryCountTest(TestCase):
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

    def _create_students(self, count: int) -> None:
        with schema_context(self.schema_name):
            for i in range(count):
                User.objects.create_user(
                    email=f"student-{uuid4().hex[:8]}@usqc.example",
                    password="x",
                    name=f"Student {i}",
                    phone_number="09-123-4567",
                    date_of_birth=date(2000, 1, 1),
                    roles=[User.UserRole.STUDENT],
                )

    def _hub_search(self, client: APIClient):
        params = (
            f"?page=1&size=24"
            f"&sorts={_encode_query_param(['name'])}"
            f"&expand={_encode_query_param([])}"
            f"&csv=false&group_by=all&range_group_by=day"
            f"&fields={_encode_query_param(HUB_FIELDS)}"
        )
        return client.post(
            f"/api/v1/users/search{params}",
            {
                "filter_params": [
                    {
                        "field_name": "roles",
                        "operator": "contained_by",
                        "value": "{student}",
                    },
                    {
                        "field_name": "is_active",
                        "operator": "exact",
                        "value": "true",
                    },
                ],
            },
            format="json",
        )


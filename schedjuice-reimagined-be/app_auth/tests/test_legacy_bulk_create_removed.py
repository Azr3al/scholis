import unittest
import uuid
from datetime import date

from django.db import connection
from django.test import TransactionTestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from tenant_schemas.utils import schema_context

from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM
from app_auth.models import User
from app_auth.tests.import_test_helpers import TEST_SCHEMA, ensure_import_test_tenant


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class LegacyBulkCreateRemovedTest(TransactionTestCase):
    schema_name = TEST_SCHEMA

    @classmethod
    def setUpClass(cls):
        ensure_import_test_tenant()
        super().setUpClass()

    def setUp(self):
        ensure_import_test_tenant()
        connection.set_schema_to_public()

    def tearDown(self):
        connection.set_schema_to_public()

    def _client(self, user: User) -> APIClient:
        token = AccessToken.for_user(user)
        token[JWT_TENANT_SCHEMA_CLAIM] = self.schema_name
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_TENANT=self.schema_name,
        )
        return client

    def _admin_user(self) -> User:
        with schema_context(self.schema_name):
            return User.objects.create_user(
                email=f"admin-bulk-removed-{uuid.uuid4().hex[:8]}@ru.example",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )

    def test_users_bulk_create_endpoint_removed(self):
        admin = self._admin_user()
        res = self._client(admin).post(
            "/api/v1/users/bulk-create",
            {"objects": [{"email": "x@ru.example", "name": "X", "roles": ["student"]}]},
            format="json",
        )
        self.assertEqual(res.status_code, 404)

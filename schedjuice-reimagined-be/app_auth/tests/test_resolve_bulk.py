import unittest
from datetime import date

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from tenant_schemas.utils import schema_context

from app_auth.import_resolve import resolve_users_by_email
from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM
from app_auth.models import User


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ResolveUsersBulkTest(TestCase):
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
                email="admin@ru.example",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )

    def test_found_and_missing(self):
        admin = self._admin()
        with schema_context(self.schema_name):
            User.objects.create_user(
                email="known@ru.example",
                password="x",
                name="Known",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
        res = self._client(admin).post(
            "/api/v1/users/resolve-bulk",
            {"emails": ["Known@ru.example", "missing@ru.example"]},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()["data"]
        self.assertIsNotNone(data["Known@ru.example"])
        self.assertEqual(data["Known@ru.example"]["email"], "known@ru.example")
        self.assertIsNone(data["missing@ru.example"])

    def test_single_query_no_n_plus_one(self):
        self._admin()
        with schema_context(self.schema_name):
            for i in range(5):
                User.objects.create_user(
                    email=f"u{i}@ru.example",
                    password="x",
                    name=f"U{i}",
                    phone_number="-",
                    date_of_birth=date(1990, 1, 1),
                    roles=[User.UserRole.STUDENT],
                )
            emails = [f"u{i}@ru.example" for i in range(5)]
            with self.assertNumQueries(1):
                resolve_users_by_email(emails)

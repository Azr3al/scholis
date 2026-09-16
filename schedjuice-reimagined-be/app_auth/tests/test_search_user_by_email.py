"""Tests for SearchUserByEmailView (registration email lookup)."""

from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac


class SearchUserByEmailTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        ensure_public_schema()
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=cls.schema_name).update(
                is_microsoft_on=False,
                is_teams_creation_enabled=False,
                is_student_login_disabled=False,
                timezone="UTC",
            )
        with schema_context(cls.schema_name):
            seed_rbac()

    def _public_client(self) -> APIClient:
        client = APIClient()
        client.credentials(HTTP_X_DTS_SCHEMA=self.schema_name)
        return client

    def test_search_user_not_found_returns_200(self):
        client = self._public_client()
        resp = client.get(
            reverse("search-user-by-email", kwargs={"email": "newuser@example.com"})
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data.get("message"), "not_found")

    def test_search_user_active_returns_201(self):
        suffix = uuid4().hex[:6]
        email = f"active-search-{suffix}@example.com"
        with schema_context(self.schema_name):
            User.objects.create_user(
                email=email,
                password="SecurePass123!",
                phone_number="1234567890",
                communication_email=email,
                name="Active User",
                date_of_birth=date(1990, 1, 1),
                code=f"active-{suffix}",
                roles=[User.UserRole.STUDENT],
                is_active=True,
            )

        client = self._public_client()
        resp = client.get(reverse("search-user-by-email", kwargs={"email": email}))
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data.get("message"), "found")

    def test_search_user_pending_activation_returns_202(self):
        suffix = uuid4().hex[:6]
        email = f"pending-search-{suffix}@example.com"
        with schema_context(self.schema_name):
            User.objects.create_user(
                email=email,
                password="SecurePass123!",
                phone_number="1234567890",
                communication_email=email,
                name="Pending User",
                date_of_birth=date(2010, 1, 1),
                code=f"pending-{suffix}",
                roles=[User.UserRole.STUDENT],
                is_active=False,
                is_waiting_for_activation=True,
            )

        client = self._public_client()
        resp = client.get(reverse("search-user-by-email", kwargs={"email": email}))
        self.assertEqual(resp.status_code, 202)
        self.assertEqual(resp.data.get("message"), "pending_activation")

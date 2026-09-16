import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_custom_fields.models import FieldDefinition
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class ProfilePartialCustomDataTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:8]
        self.field_a = f"sect_a_{suffix}"
        self.field_b = f"sect_b_{suffix}"
        with schema_context(self.schema_name):
            seed_rbac()
            FieldDefinition.objects.create(
                source="custom",
                entity_type="app_auth.User",
                field_key=self.field_a,
                field_label=f"Section A {suffix}",
                field_type=FieldDefinition.FieldType.TEXT,
                required_at="never",
                roles=[],
                filled_by="both",
                is_active=True,
            )
            FieldDefinition.objects.create(
                source="custom",
                entity_type="app_auth.User",
                field_key=self.field_b,
                field_label=f"Section B {suffix}",
                field_type=FieldDefinition.FieldType.TEXT,
                required_at="never",
                roles=[],
                filled_by="both",
                is_active=True,
            )
            self.admin = User.objects.create_user(
                email=f"partial-cd-adm-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"partial-cd-adm-{suffix}@example.com",
                code=f"PCD-ADM-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.subject = User.objects.create_user(
                email=f"partial-cd-sub-{suffix}@example.com",
                password="x",
                name="Subject",
                phone_number="2",
                date_of_birth=date(2005, 1, 1),
                communication_email=f"partial-cd-sub-{suffix}@example.com",
                code=f"PCD-SUB-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            self.subject_id = self.subject.id

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_X_DTS_SCHEMA=self.schema_name)
        return client

    def test_partial_custom_data_preserves_other_section_keys(self):
        with schema_context(self.schema_name):
            self.subject.custom_data = {self.field_a: "A1"}
            self.subject.save(update_fields=["custom_data"])

        response = self._client(self.admin).put(
            f"{self.api_prefix}/users/{self.subject_id}",
            {"custom_data": {self.field_b: "B1"}},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)

        with schema_context(self.schema_name):
            refreshed = User.objects.get(id=self.subject_id)
            self.assertEqual(refreshed.custom_data.get(self.field_a), "A1")
            self.assertEqual(refreshed.custom_data.get(self.field_b), "B1")

    def test_sequential_section_puts_persist_both_keys(self):
        client = self._client(self.admin)
        url = f"{self.api_prefix}/users/{self.subject_id}"

        first = client.put(
            url,
            {"custom_data": {self.field_a: "A-new"}},
            format="json",
        )
        self.assertEqual(first.status_code, 200, first.content)

        second = client.put(
            url,
            {"custom_data": {self.field_b: "B-new"}},
            format="json",
        )
        self.assertEqual(second.status_code, 200, second.content)

        with schema_context(self.schema_name):
            refreshed = User.objects.get(id=self.subject_id)
            self.assertEqual(refreshed.custom_data.get(self.field_a), "A-new")
            self.assertEqual(refreshed.custom_data.get(self.field_b), "B-new")

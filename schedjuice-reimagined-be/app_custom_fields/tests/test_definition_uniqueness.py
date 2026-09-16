import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_custom_fields.constants import ENTITY_TYPE_COURSE, ENTITY_TYPE_USER
from app_custom_fields.models import FieldDefinition
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class DefinitionUniquenessTests(TestCase):
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
            self.admin = User.objects.create_user(
                email=f"adm-uniq-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )

    def _client(self) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=self.admin)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _create_def(self, **over):
        payload = {
            "entity_type": ENTITY_TYPE_USER,
            "field_key": f"k_{uuid4().hex[:8]}",
            "field_label": f"Label {uuid4().hex[:6]}",
            "field_type": "text",
        }
        payload.update(over)
        resp = self._client().post(
            "/api/v1/custom-field-definitions", payload, format="json"
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        return resp.json()["data"]

    def test_duplicate_label_rejected_on_create(self):
        self._create_def(field_label="Shared Label", field_key="shared_a")
        resp = self._client().post(
            "/api/v1/custom-field-definitions",
            {
                "entity_type": ENTITY_TYPE_USER,
                "field_key": "shared_b",
                "field_label": "Shared Label",
                "field_type": "text",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        body = resp.json()
        details = body.get("details", body)
        self.assertIn("field_label", details)

    def test_duplicate_key_rejected_on_create(self):
        self._create_def(field_label="One", field_key="same_key")
        resp = self._client().post(
            "/api/v1/custom-field-definitions",
            {
                "entity_type": ENTITY_TYPE_USER,
                "field_key": "same_key",
                "field_label": "Two",
                "field_type": "text",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        body = resp.json()
        details = body.get("details", body)
        self.assertIn("field_key", details)

    def test_update_label_to_existing_rejected(self):
        a = self._create_def(field_label="Alpha", field_key="alpha")
        b = self._create_def(field_label="Beta", field_key="beta")
        resp = self._client().put(
            f"/api/v1/custom-field-definitions/{b['id']}",
            {"field_label": "Alpha"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        body = resp.json()
        details = body.get("details", body)
        self.assertIn("field_label", details)
        with schema_context(self.schema_name):
            self.assertEqual(
                FieldDefinition.objects.get(pk=a["id"]).field_label, "Alpha"
            )
            self.assertEqual(
                FieldDefinition.objects.get(pk=b["id"]).field_label, "Beta"
            )

    def test_same_label_allowed_across_entity_types(self):
        self._create_def(
            entity_type=ENTITY_TYPE_USER,
            field_label="Notes",
            field_key="notes_user",
        )
        resp = self._client().post(
            "/api/v1/custom-field-definitions",
            {
                "entity_type": ENTITY_TYPE_COURSE,
                "field_key": "notes_course",
                "field_label": "Notes",
                "field_type": "text",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)

    def test_same_label_allowed_when_other_inactive(self):
        created = self._create_def(field_label="Retired", field_key="retired_a")
        del_resp = self._client().delete(
            f"/api/v1/custom-field-definitions/{created['id']}"
        )
        self.assertIn(del_resp.status_code, (200, 204))
        resp = self._client().post(
            "/api/v1/custom-field-definitions",
            {
                "entity_type": ENTITY_TYPE_USER,
                "field_key": "retired_b",
                "field_label": "Retired",
                "field_type": "text",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)

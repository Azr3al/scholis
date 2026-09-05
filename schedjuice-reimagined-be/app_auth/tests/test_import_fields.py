import unittest
import uuid

from django.core.management import call_command
from django.db import connection
from django.test import TransactionTestCase
from tenant_schemas.utils import schema_context

from app_auth.import_fields import build_import_fields
from app_auth.tests.import_test_helpers import TEST_SCHEMA, ensure_import_test_tenant
from app_custom_fields.models import FieldDefinition


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class BuildImportFieldsTest(TransactionTestCase):
    schema_name = TEST_SCHEMA

    @classmethod
    def setUpClass(cls):
        ensure_import_test_tenant()
        super().setUpClass()

    def setUp(self):
        ensure_import_test_tenant()
        connection.set_schema_to_public()
        self._created_field_keys: list[str] = []

    def tearDown(self):
        if self._created_field_keys:
            with schema_context(self.schema_name):
                FieldDefinition.objects.filter(
                    field_key__in=self._created_field_keys
                ).delete()
        connection.set_schema_to_public()

    def test_includes_identity_floor_builtins_and_custom(self):
        uid = uuid.uuid4().hex[:8]
        field_key = f"guardian_{uid}"
        with schema_context(self.schema_name):
            call_command("sync_builtin_fields")
            FieldDefinition.objects.create(
                source="custom",
                entity_type="app_auth.User",
                field_key=field_key,
                field_label=f"Guardian {uid}",
                field_type=FieldDefinition.FieldType.TEXT,
                required_at="registration",
                roles=["student"],
                filled_by="both",
            )
            self._created_field_keys.append(field_key)
            fields = build_import_fields(role="student")

        by_key = {f["field_key"]: f for f in fields}
        self.assertEqual(by_key["email"]["special"], "user")
        self.assertTrue(by_key["email"]["required_for_role"])
        self.assertEqual(by_key["courses"]["special"], "course")
        self.assertIn("name", by_key)
        self.assertEqual(by_key["gender"]["field_type"], "choice")
        self.assertTrue(by_key["gender"]["choices"])
        self.assertEqual(by_key["date_of_birth"]["field_type"], "date")
        self.assertEqual(by_key[field_key]["source"], "custom")
        self.assertFalse(by_key[field_key]["required_for_role"])

    def test_custom_required_for_other_role_not_flagged(self):
        uid = uuid.uuid4().hex[:8]
        field_key = f"staff_id_{uid}"
        with schema_context(self.schema_name):
            FieldDefinition.objects.create(
                source="custom",
                entity_type="app_auth.User",
                field_key=field_key,
                field_label="Staff ID",
                field_type=FieldDefinition.FieldType.TEXT,
                required_at="registration",
                roles=["teacher"],
                filled_by="both",
            )
            self._created_field_keys.append(field_key)
            fields = build_import_fields(role="student")
        by_key = {f["field_key"]: f for f in fields}
        self.assertFalse(by_key[field_key]["required_for_role"])

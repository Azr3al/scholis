import os
import unittest
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_custom_fields.constants import ENTITY_TYPE_USER, SOURCE_BUILTIN
from app_custom_fields.models import FieldDefinition
from app_custom_fields.validation import validate_user_custom_data_for_write


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(
    os.environ.get("SCHEDJUICE_RUN_FIELD_POLICY_INTEGRATION") == "1"
    and _database_reachable(),
    "Heavy test (migrate_schemas + load-tenants). "
    "Set SCHEDJUICE_RUN_FIELD_POLICY_INTEGRATION=1 and DATABASE_URL to run.",
)
class FieldPolicyMigrationIntegrationTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def test_builtin_rows_seeded_by_migration(self):
        with schema_context(self.schema_name):
            dob = FieldDefinition.objects.filter(
                entity_type=ENTITY_TYPE_USER,
                source=SOURCE_BUILTIN,
                field_key="date_of_birth",
            ).first()
            self.assertIsNotNone(dob)
            self.assertIsNone(dob.field_type)  # registry is authoritative
            self.assertFalse(dob.show_on_create)
            self.assertEqual(dob.required_at, "never")

    def test_sync_builtin_fields_is_idempotent(self):
        with schema_context(self.schema_name):
            before = FieldDefinition.objects.filter(source=SOURCE_BUILTIN).count()
            call_command("sync_builtin_fields", verbosity=0)
            after = FieldDefinition.objects.filter(source=SOURCE_BUILTIN).count()
            self.assertEqual(before, after)
            self.assertGreater(after, 0)

    def test_registration_stage_ignores_completion_fields(self):
        with schema_context(self.schema_name):
            FieldDefinition.objects.create(
                source="custom",
                entity_type=ENTITY_TYPE_USER,
                field_key="bio_integration",
                field_label="Bio",
                field_type="text",
                required_at="profile_completion",
                roles=["student"],
                is_active=True,
            )
            out = validate_user_custom_data_for_write(
                incoming={},
                existing={},
                partial=False,
                stage="registration",
                subject_roles=["student"],
                actor="user",
            )
            self.assertEqual(out, {})

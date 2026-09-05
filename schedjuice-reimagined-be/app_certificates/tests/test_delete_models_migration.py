import unittest

from django.core.management import call_command
from django.db import connection
from django.db.migrations.loader import MigrationLoader
from django.test import TestCase
from tenant_schemas.utils import schema_context


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CertificateDeleteModelsMigrationTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def test_0003_succeeds_when_certificate_tables_are_missing(self):
        with schema_context(self.schema_name):
            with connection.cursor() as cursor:
                cursor.execute(
                    "DROP TABLE IF EXISTS app_certificates_certificatetemplate CASCADE"
                )
                cursor.execute(
                    "DROP TABLE IF EXISTS app_certificates_certificatetemplatecategory CASCADE"
                )
            loader = MigrationLoader(connection)
            migration = loader.get_migration(
                "app_certificates", "0003_delete_certificate_models"
            )
            state = loader.project_state(
                [("app_certificates", "0002_certificatetemplatecategory_and_more")]
            )
            with connection.schema_editor() as editor:
                migration.apply(state, editor)

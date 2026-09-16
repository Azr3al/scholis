"""Shared tenant bootstrap for import integration tests (no load-tenants flush)."""

from __future__ import annotations

from django.core.management import call_command
from django.db import connection
from tenant_schemas.utils import get_public_schema_name, schema_context, schema_exists

from app_organization.models import Organization

TEST_SCHEMA = "xschedjuice"
_SCHEMA_MIGRATED = False


def ensure_import_test_tenant() -> str:
    """Ensure shared + tenant schema and Organization row exist. Safe to call per test."""
    global _SCHEMA_MIGRATED

    if not _SCHEMA_MIGRATED:
        call_command("migrate_schemas", shared=True, verbosity=0)
        if not schema_exists(TEST_SCHEMA):
            cursor = connection.cursor()
            cursor.execute(f"CREATE SCHEMA {TEST_SCHEMA}")
            call_command(
                "migrate_schemas",
                schema_name=TEST_SCHEMA,
                interactive=False,
                verbosity=0,
            )
        _SCHEMA_MIGRATED = True

    with schema_context(get_public_schema_name()):
        if not Organization.objects.filter(schema_name=TEST_SCHEMA).exists():
            org = Organization(
                name="Schedjuice Test",
                domain_url="test.schedjuice.local",
                schema_name=TEST_SCHEMA,
                tagline="test",
                is_admin=True,
                is_microsoft_on=False,
                available_domains=[],
            )
            org.auto_create_schema = False
            org.save()

    return TEST_SCHEMA

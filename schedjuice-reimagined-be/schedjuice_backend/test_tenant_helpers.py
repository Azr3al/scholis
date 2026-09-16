"""Shared helpers for backend tests that need isolated tenant schemas."""

from __future__ import annotations

from django.core.management import call_command
from django.db import connection
from tenant_schemas.utils import schema_context

from app_course.program_helpers import create_default_general_program
from app_organization.models import Organization


def ensure_public_schema() -> None:
    connection.set_schema_to_public()


def _reset_organization_id_sequence() -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT setval(
                pg_get_serial_sequence('app_organization_organization', 'id'),
                COALESCE((SELECT MAX(id) FROM app_organization_organization), 1),
                true
            )
            """
        )


def provision_test_tenant(**fields) -> Organization:
    """Create a tenant, migrate its schema, and seed the default program."""
    ensure_public_schema()
    schema_name = fields["schema_name"]
    org = Organization.objects.filter(schema_name=schema_name).first()
    if org is None:
        _reset_organization_id_sequence()
        org = Organization.objects.create(**fields)
        org.create_schema(check_if_exists=True)
    call_command("migrate_schemas", schema_name=org.schema_name, verbosity=0)
    with schema_context(org.schema_name):
        create_default_general_program()
    return org

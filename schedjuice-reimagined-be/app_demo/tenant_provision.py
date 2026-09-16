from __future__ import annotations

import os

from django.core.management import call_command
from django.db import connection

from app_demo.config import ResolvedDemoConfig
from app_organization.models import Organization


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


def reset_demo_tenant(org: Organization) -> None:
    connection.set_schema_to_public()
    org.delete()
    _reset_organization_id_sequence()


def ensure_demo_tenant(*, config: ResolvedDemoConfig, reset: bool) -> Organization:
    connection.set_schema_to_public()
    existing = Organization.objects.filter(schema_name=config.schema_name).first()
    if existing is not None:
        if not reset:
            raise RuntimeError(
                f"Demo tenant {config.schema_name} exists; pass --reset to rebuild."
            )
        reset_demo_tenant(existing)

    _reset_organization_id_sequence()
    org = Organization.objects.create(
        name=config.school_name,
        domain_url=config.domain_url,
        schema_name=config.schema_name,
        tagline=f"Demo environment for {config.school_name}",
        is_demo=True,
        available_domains=[],
    )
    org.create_schema(check_if_exists=True, sync_schema=False)

    # The test harness can set this to skip expensive full-schema migration runs.
    # For a brand-new demo schema we must still migrate this specific tenant.
    previous_ready_flag = os.environ.pop("SCHEDJUICE_TEST_TENANTS_READY", None)
    try:
        call_command(
            "migrate_schemas",
            schema_name=org.schema_name,
            interactive=False,
            verbosity=0,
        )
    finally:
        if previous_ready_flag is not None:
            os.environ["SCHEDJUICE_TEST_TENANTS_READY"] = previous_ready_flag
    return org

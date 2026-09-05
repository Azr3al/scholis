"""Custom Django test runner with local Postgres preflight and non-interactive mode."""

from __future__ import annotations

import csv
import os
import sys

from django.core import management
from django.core.management import call_command as django_call_command
from django.db import connection
from django.test.runner import DiscoverRunner
from tenant_schemas.utils import schema_context

from app_organization.models import Organization

_DB_SETUP_HELP = """
Backend tests require the local Docker Postgres container.

Ensure Docker is running, then:

  docker run -d --name schedjuice-test-db \\
    -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=db \\
    -p 55432:5432 postgres:15 2>/dev/null || docker start schedjuice-test-db

  until docker exec schedjuice-test-db pg_isready -U user -d db >/dev/null 2>&1; do sleep 1; done

Or run tests via:

  ./scripts/run_backend_tests.sh <test-target>
"""

TEST_TENANT_SCHEMAS = ("xschedjuice", "xteachersu")
# Migrated at bootstrap for platform access tests; no dummy CSV data directory.
MIGRATED_TEST_TENANT_SCHEMAS = ("xschedjuicethihanet",)
ALL_BOOTSTRAPPED_TEST_TENANT_SCHEMAS = TEST_TENANT_SCHEMAS + MIGRATED_TEST_TENANT_SCHEMAS


def ensure_postgres_extensions() -> None:
    with connection.cursor() as cursor:
        cursor.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public;")
        cursor.execute("CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA public;")


def bootstrap_test_tenants(*, verbosity: int = 0) -> None:
    """Pre-migrate shared + tenant schemas and load dummy data once for standard test tenants."""
    cc = django_call_command
    cc("migrate_schemas", shared=True, verbosity=verbosity)

    org_csv = os.path.join("app_data", "dummydata", "organization.csv")
    with open(org_csv, "r", encoding="utf-8") as handle:
        rows = [
            row
            for row in csv.DictReader(handle)
            if row.get("schema_name") in ALL_BOOTSTRAPPED_TEST_TENANT_SCHEMAS
        ]

    for row in rows:
        schema_name = row["schema_name"]
        tenant = Organization.objects.filter(schema_name=schema_name).first()
        if tenant is None:
            tenant = Organization.objects.create(
                id=int(row["id"]),
                name=row["name"],
                domain_url=row["domain_url"],
                schema_name=schema_name,
                tagline=row.get("tagline") or "",
                is_admin=str(row.get("is_admin", "")).lower() == "true",
                is_microsoft_on=str(row.get("is_microsoft_on", "")).lower() == "true",
                available_domains=[],
            )
            tenant.create_schema(check_if_exists=True)

        cc("migrate_schemas", schema_name=schema_name, verbosity=verbosity)

        if schema_name not in TEST_TENANT_SCHEMAS:
            Organization.objects.filter(schema_name=schema_name).update(timezone="UTC")
            continue

        from app_auth.models import User

        with schema_context(schema_name):
            if not User.objects.exists():
                cc("load-data", schema=schema_name, verbosity=verbosity)

        Organization.objects.filter(schema_name=schema_name).update(timezone="UTC")


def _should_skip_test_bootstrap_command(command_name: str, **kwargs) -> bool:
    if os.environ.get("SCHEDJUICE_TEST_TENANTS_READY") != "1":
        return False
    if command_name == "load-tenants":
        return True
    if command_name == "load-data":
        schema = kwargs.get("schema")
        return schema is None or schema in TEST_TENANT_SCHEMAS
    if command_name != "migrate_schemas":
        return False
    if kwargs.get("shared"):
        return True
    schema_name = kwargs.get("schema_name")
    if schema_name in ALL_BOOTSTRAPPED_TEST_TENANT_SCHEMAS:
        return True
    # Bare migrate_schemas (all bootstrapped tenants) is redundant after setup_databases.
    return schema_name is None


def _patch_call_command_for_bootstrapped_tests():
    """Skip redundant bootstrap commands; still migrate ad-hoc test tenant schemas."""

    def patched_call_command(command_name, *args, **kwargs):
        if _should_skip_test_bootstrap_command(command_name, **kwargs):
            return None
        return django_call_command(command_name, *args, **kwargs)

    return patched_call_command


class SchedjuiceTestRunner(DiscoverRunner):
    """Fail fast when the local test database is unavailable; never prompt interactively."""

    interactive = False

    def setup_databases(self, **kwargs):
        try:
            connection.ensure_connection()
        except Exception as exc:
            sys.stderr.write(
                f"PostgreSQL is not reachable for backend tests: {exc}\n{_DB_SETUP_HELP}"
            )
            sys.exit(1)

        result = super().setup_databases(**kwargs)

        # Bootstrap tenants outside test transactions so CONCURRENTLY migrations succeed.
        connection.close()
        connection.ensure_connection()
        ensure_postgres_extensions()
        bootstrap_test_tenants(verbosity=max(0, self.verbosity - 1))
        connection.set_schema_to_public()
        os.environ["SCHEDJUICE_TEST_TENANTS_READY"] = "1"
        return result

    def run_suite(self, suite, **kwargs):
        connection.set_schema_to_public()
        return super().run_suite(suite, **kwargs)

    def run_tests(self, test_labels, extra_tests=None, **kwargs):
        original_call_command = management.call_command
        management.call_command = _patch_call_command_for_bootstrapped_tests()
        try:
            return super().run_tests(test_labels, extra_tests, **kwargs)
        finally:
            management.call_command = original_call_command
            os.environ.pop("SCHEDJUICE_TEST_TENANTS_READY", None)

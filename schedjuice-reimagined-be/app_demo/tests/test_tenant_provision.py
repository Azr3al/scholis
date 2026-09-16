from datetime import date
from uuid import uuid4

from django.db import connection
from django.test import TransactionTestCase

from app_demo.config import ResolvedDemoConfig
from app_demo.tenant_provision import ensure_demo_tenant
from app_organization.models import Organization


class EnsureDemoTenantTests(TransactionTestCase):
    def test_provisions_demo_tenant_with_reset(self):
        suffix = uuid4().hex[:8]
        schema_name = f"xdemo_test_{suffix}"
        slug = f"test-{suffix}"
        config = ResolvedDemoConfig(
            school_name=f"Demo School {suffix}",
            slug=slug,
            schema_name=schema_name,
            domain_url=f"{slug}.demo.test",
            demo_date=date(2026, 6, 30),
            terminology={},
            org_toggles={},
            academic_structure={},
            scenario_pack_ids=[],
            demo_stops=[],
            physical_campuses=[],
        )
        org = ensure_demo_tenant(config=config, reset=True)

        self.assertEqual(org.schema_name, schema_name)
        self.assertTrue(org.is_demo)
        self.assertEqual(org.available_domains, [])
        self.assertTrue(
            Organization.objects.filter(schema_name=schema_name, is_demo=True).exists()
        )

    @staticmethod
    def _cleanup_org(schema_name: str) -> None:
        connection.set_schema_to_public()
        org = Organization.objects.filter(schema_name=schema_name).first()
        if org is not None:
            org.delete()

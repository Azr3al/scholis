from datetime import date
from uuid import uuid4

from django.db import connection
from django.test import TestCase

from app_demo.config import ResolvedDemoConfig
from app_demo.org_config import apply_org_toggles
from app_organization.models import Organization


class ApplyOrgTogglesTests(TestCase):
    def test_applies_timezone_from_org_toggles(self):
        suffix = uuid4().hex[:8]
        org = Organization.objects.get(schema_name="xschedjuice")
        previous_name = org.name
        previous_timezone = org.timezone
        previous_is_demo = org.is_demo
        previous_homepage_toggle = org.is_homepage_disabled
        self.addCleanup(
            self._restore_org,
            org.id,
            previous_name,
            previous_timezone,
            previous_is_demo,
            previous_homepage_toggle,
        )

        config = ResolvedDemoConfig(
            school_name=f"Updated Name {suffix}",
            slug="xschedjuice",
            schema_name=org.schema_name,
            domain_url=org.domain_url,
            demo_date=date(2026, 6, 30),
            terminology={},
            org_toggles={
                "timezone": "Asia/Bangkok",
                "is_homepage_disabled": True,
                "not_allowed_flag": True,
            },
            academic_structure={},
            scenario_pack_ids=[],
            demo_stops=[],
            physical_campuses=[],
        )

        apply_org_toggles(org, config)
        org.refresh_from_db()

        self.assertEqual(org.timezone, "Asia/Bangkok")
        self.assertTrue(org.is_homepage_disabled)
        self.assertEqual(org.name, f"Updated Name {suffix}")
        self.assertTrue(org.is_demo)

    @staticmethod
    def _restore_org(
        org_id: int,
        name: str,
        timezone: str,
        is_demo: bool,
        is_homepage_disabled: bool,
    ) -> None:
        connection.set_schema_to_public()
        org = Organization.objects.filter(id=org_id).first()
        if org is not None:
            org.name = name
            org.timezone = timezone
            org.is_demo = is_demo
            org.is_homepage_disabled = is_homepage_disabled
            org.save(
                update_fields=[
                    "name",
                    "timezone",
                    "is_demo",
                    "is_homepage_disabled",
                    "updated_at",
                ]
            )

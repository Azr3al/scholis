import unittest
from datetime import date

from django.db import connection
from django.test import TransactionTestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_auth.tests.import_test_helpers import TEST_SCHEMA, ensure_import_test_tenant
from app_course.models import Category, Course
from app_course.program_helpers import get_default_program
from app_demo.config import ResolvedDemoConfig
from app_demo.import_merge import run_import_merge

_ROSTER_EMAILS = [
    "avery.hart+demo@sunrise.example",
    "mila.rowan+demo@sunrise.example",
    "noah.quinn+demo@sunrise.example",
]


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _config_for_mode(mode: str) -> ResolvedDemoConfig:
    return ResolvedDemoConfig(
        school_name="Sunrise Test Center",
        slug="sunrise",
        schema_name=TEST_SCHEMA,
        domain_url="sunrise-demo.thiha.net",
        demo_date=date(2026, 6, 30),
        terminology={},
        org_toggles={},
        academic_structure={},
        scenario_pack_ids=[],
        demo_stops=[],
        physical_campuses=[],
        import_spec={
            "file": "demo-artifacts/imports/sunrise-roster.csv",
            "mode": mode,
        },
    )


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class RunImportMergeTests(TransactionTestCase):
    schema_name = TEST_SCHEMA

    @classmethod
    def setUpClass(cls):
        ensure_import_test_tenant()
        super().setUpClass()

    def setUp(self):
        ensure_import_test_tenant()
        connection.set_schema_to_public()
        with schema_context(self.schema_name):
            User.objects.filter(email__in=_ROSTER_EMAILS).delete()
            User.objects.filter(email="demo-legacy@sunrise.example").delete()
            Course.objects.filter(
                title__in=["DEMO-Unpaid-Math-L2", "Fiction Biology A1"]
            ).delete()
            self._create_course("DEMO-Unpaid-Math-L2")

    def tearDown(self):
        connection.set_schema_to_public()

    @staticmethod
    def _create_course(title: str) -> Course:
        category, _ = Category.objects.get_or_create(name="Math")
        program = get_default_program()
        return Course.objects.create(
            title=title,
            category=category,
            program=program,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
        )

    def _run(self, mode: str) -> dict:
        return run_import_merge(
            config=_config_for_mode(mode),
            schema_name=self.schema_name,
            structure_ctx={},
            pack_ctx={},
        )

    def test_merge_mode_imports_students_and_preserves_demo_course(self):
        result = self._run("merge")
        self.assertFalse(result["skipped"])
        self.assertEqual(result["imported_count"], 3)
        self.assertEqual(result["errors"], [])

        with schema_context(self.schema_name):
            self.assertEqual(User.objects.filter(email__in=_ROSTER_EMAILS).count(), 3)
            self.assertTrue(Course.objects.filter(title="DEMO-Unpaid-Math-L2").exists())

    def test_replace_fiction_mode_deletes_fiction_data_and_keeps_demo_anchor(self):
        with schema_context(self.schema_name):
            self._create_course("Fiction Biology A1")
            User.objects.create_user(
                email="demo-legacy@sunrise.example",
                password="x",
                name="Demo Legacy",
                phone_number="-",
                communication_email="demo-legacy@sunrise.example",
                date_of_birth=date(2005, 1, 1),
                roles=[User.UserRole.STUDENT],
                code="demo-legacy",
            )

        result = self._run("replace_fiction")
        self.assertFalse(result["skipped"])
        self.assertEqual(result["imported_count"], 3)

        with schema_context(self.schema_name):
            self.assertFalse(User.objects.filter(email="demo-legacy@sunrise.example").exists())
            self.assertFalse(Course.objects.filter(title="Fiction Biology A1").exists())
            self.assertTrue(Course.objects.filter(title="DEMO-Unpaid-Math-L2").exists())

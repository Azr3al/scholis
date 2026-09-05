import unittest

from django.db import connection
from django.test import TransactionTestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Course
from app_demo.paths import ARTIFACTS_ROOT
from app_demo.provision import provision_demo
from app_demo.artifacts import load_blueprint, load_brief
from app_demo.config import resolve_demo_config
from app_finance.models import PaymentMethod, UserPayment
from app_hr.models import BuildingCheckin
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ProvisionDemoIntegrationTests(TransactionTestCase):
    def test_provisions_sunrise_tutoring_tenant(self):
        result = provision_demo(
            blueprint_id="tutoring-center",
            brief_path=ARTIFACTS_ROOT / "briefs" / "sunrise-tutoring.yaml",
            reset=True,
        )

        self.assertEqual(result["schema_name"], "xdemo_sunrise")
        self.assertEqual(result["import_result"]["skipped"], False)
        self.assertEqual(result["import_result"]["imported_count"], 3)
        org = Organization.objects.get(schema_name="xdemo_sunrise")
        self.assertTrue(org.is_demo)

        with schema_context(org.schema_name):
            self.assertTrue(User.objects.filter(email__startswith="demo-admin@").exists())
            self.assertTrue(Course.objects.filter(title__startswith="DEMO-").exists())
            self.assertTrue(
                User.objects.filter(email="avery.hart+demo@sunrise.example").exists()
            )
            self.assertTrue(
                User.objects.filter(email="mila.rowan+demo@sunrise.example").exists()
            )
            self.assertTrue(
                User.objects.filter(email="noah.quinn+demo@sunrise.example").exists()
            )

    def test_provisions_yangon_montessori_tenant(self):
        result = provision_demo(
            blueprint_id="montessori",
            brief_path=ARTIFACTS_ROOT / "briefs" / "yangon-montessori.yaml",
            reset=True,
            skip_import=True,
        )

        self.assertEqual(result["schema_name"], "xdemo_yangon_montessori")
        org = Organization.objects.get(schema_name="xdemo_yangon_montessori")
        self.assertTrue(org.is_demo)
        self.assertTrue(org.is_building_checkin_enabled)
        self.assertFalse(org.use_teacher_session_checkin)
        self.assertEqual(org.campus_checkin_verification_mode, "selfie_only")
        self.assertEqual(org.currency_iso4217, "MMK")
        self.assertEqual(org.timezone, "Asia/Rangoon")

        with schema_context(org.schema_name):
            self.assertTrue(Course.objects.filter(title="Montessori — Toddler").exists())
            self.assertTrue(PaymentMethod.objects.filter(name="Kpay").exists())
            swan = User.objects.get(name="Swan Ko Ko")
            shwe = User.objects.get(name="Shwe Yee Htoo Aung")
            self.assertTrue(
                UserPayment.objects.filter(
                    user=swan,
                    status=UserPayment.Status.VERIFIED,
                ).exists()
            )
            self.assertFalse(UserPayment.objects.filter(user=shwe).exists())
            self.assertGreaterEqual(BuildingCheckin.objects.count(), 10)
            teacher = User.objects.filter(email__startswith="demo-teacher@").first()
            self.assertIsNotNone(teacher)
            self.assertEqual(teacher.name, "Class Advisory")

        brief_path = ARTIFACTS_ROOT / "briefs" / "yangon-montessori.yaml"
        config = resolve_demo_config(load_blueprint("montessori"), load_brief(brief_path))
        routes = [stop["route"] for stop in config.demo_stops]
        self.assertIn("/finances/student-payments", routes)
        self.assertIn("/services/campus-checkins", routes)
        self.assertNotIn("/attendances/god-view", routes)

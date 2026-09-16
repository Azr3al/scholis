import unittest
from datetime import date, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context
from djmoney.money import Money

from app_auth.models import User
from app_course.models import Category, Program
from app_finance.models import PaymentPlan
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class PaymentPlanMandatoryTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        self.today = timezone.localdate()
        suffix = uuid4().hex[:6]
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_payment_plan_mandatory=False
            )
        with schema_context(self.schema_name):
            seed_rbac()
            self.manager = User.objects.create_user(
                email=f"mgr-{suffix}@example.com",
                password="x",
                name="Manager",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.MANAGER],
            )
            self.cat = Category.objects.create(name=f"Cat {suffix}")
            self.prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.plan = PaymentPlan.objects.create(
                name=f"plan-{suffix}",
                price=Money(500, "USD"),
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _course_payload(self, title: str, *, payment_plan=None):
        payload = {
            "title": title,
            "category": self.cat.id,
            "program": self.prog.id,
            "start_date": self.today.isoformat(),
            "end_date": (self.today + timedelta(days=30)).isoformat(),
            "create_microsoft_team": False,
        }
        if payment_plan is not None:
            payload["payment_plan"] = payment_plan
        return payload

    def test_create_course_without_plan_rejected_when_flag_on(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_payment_plan_mandatory=True
            )
        resp = self._client(self.manager).post(
            "/api/v1/courses",
            self._course_payload(f"NeedPlan {uuid4().hex[:4]}"),
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)
        body = resp.content.decode()
        self.assertIn("payment_plan", body)

    def test_patch_unrelated_field_ok_on_legacy_course_when_flag_on(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_payment_plan_mandatory=False
            )
        create_resp = self._client(self.manager).post(
            "/api/v1/courses",
            self._course_payload(f"Legacy {uuid4().hex[:4]}"),
            format="json",
        )
        self.assertEqual(create_resp.status_code, 201, create_resp.content)
        course_id = create_resp.json()["data"]["id"]

        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_payment_plan_mandatory=True
            )
        resp = self._client(self.manager).put(
            f"/api/v1/courses/{course_id}",
            {"title": f"Renamed {uuid4().hex[:4]}"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_patch_clearing_payment_plan_rejected_when_flag_on(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_payment_plan_mandatory=False
            )
        create_resp = self._client(self.manager).post(
            "/api/v1/courses",
            self._course_payload(
                f"WithPlan {uuid4().hex[:4]}",
                payment_plan=self.plan.id,
            ),
            format="json",
        )
        self.assertEqual(create_resp.status_code, 201, create_resp.content)
        course_id = create_resp.json()["data"]["id"]

        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_payment_plan_mandatory=True
            )
        resp = self._client(self.manager).patch(
            f"/api/v1/courses/{course_id}",
            {"payment_plan": None},
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertIn("payment_plan", resp.content.decode())


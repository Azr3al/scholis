import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.disambiguation import get_active_pending
from app_ai.tools.adjust_staff_points import run_adjust_staff_points
from app_ai.tools.get_staff_point_balances import run_get_staff_point_balances
from app_auth.models import User
from app_organization.models import Organization
from app_points import models as point_models
from app_points import services
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class PointsReadToolTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_staff_points_enabled = True
            org.save(update_fields=["is_staff_points_enabled"])
            self.org = org
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"pa-{suffix}@e.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"pt-{suffix}@e.com",
                password="x",
                name="Teacher One",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.pt = point_models.PointType.objects.create(name=f"Merit-{suffix}")

    def test_get_balances_by_user_id(self):
        with schema_context(self.schema_name):
            services.post_transaction(
                subject=self.teacher,
                actor=self.admin,
                point_type=self.pt,
                delta=4,
                note="Seed balance",
            )
            result = run_get_staff_point_balances(
                {"user_id": self.teacher.id}, self.admin
            )
        self.assertEqual(result["balances"][str(self.pt.id)], 4)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class AdjustStaffPointsWriteTests(PointsReadToolTests):
    def test_unambiguous_add_calls_post_transaction(self):
        with schema_context(self.schema_name):
            result = run_adjust_staff_points(
                {
                    "user_id": self.teacher.id,
                    "point_type_id": self.pt.id,
                    "direction": "add",
                    "amount": 5,
                    "note": "Great teamwork",
                },
                self.admin,
                channel_key="web:1",
                org=self.org,
            )
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["transaction"]["delta"], 5)

    def test_ambiguous_subject_stores_pending(self):
        with schema_context(self.schema_name):
            User.objects.create_user(
                email=f"j1-{uuid4().hex[:4]}@e.com",
                password="x",
                name="James",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            User.objects.create_user(
                email=f"j2-{uuid4().hex[:4]}@e.com",
                password="x",
                name="Jamesy",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            result = run_adjust_staff_points(
                {
                    "query": "James",
                    "point_type_id": self.pt.id,
                    "direction": "add",
                    "amount": 2,
                    "note": "Nice work",
                },
                self.admin,
                channel_key="telegram:99",
                org=self.org,
            )
            pending = get_active_pending(user=self.admin, channel_key="telegram:99")
        self.assertEqual(result["status"], "ambiguous_subject")
        self.assertIsNotNone(pending)
        self.assertEqual(pending.pending_field, "subject")

    def test_deduct_negative_delta(self):
        with schema_context(self.schema_name):
            result = run_adjust_staff_points(
                {
                    "user_id": self.teacher.id,
                    "point_type_id": self.pt.id,
                    "direction": "deduct",
                    "amount": 3,
                    "note": "Late arrival",
                },
                self.admin,
                channel_key="web:1",
                org=self.org,
            )
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["transaction"]["delta"], -3)

    def test_feature_disabled(self):
        with schema_context(get_public_schema_name()):
            self.org.is_staff_points_enabled = False
            self.org.save(update_fields=["is_staff_points_enabled"])
        with schema_context(self.schema_name):
            result = run_adjust_staff_points(
                {
                    "user_id": self.teacher.id,
                    "point_type_id": self.pt.id,
                    "direction": "add",
                    "amount": 1,
                    "note": "Test",
                },
                self.admin,
                org=self.org,
            )
        self.assertEqual(result["error"], "feature_disabled")

    def test_query_resolves_staff_with_custom_rbac_role(self):
        with schema_context(self.schema_name):
            custom_staff = User.objects.create_user(
                email=f"neki-{uuid4().hex[:4]}@e.com",
                password="x",
                name="Neki Points Target",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[
                    User.UserRole.TEACHER,
                    User.UserRole.ADMIN,
                    "telegram-beta-tester",
                ],
            )
            result = run_adjust_staff_points(
                {
                    "query": "Neki Points",
                    "point_type_id": self.pt.id,
                    "direction": "add",
                    "amount": 1,
                    "note": "Extra merit",
                },
                self.admin,
                channel_key="telegram:neki",
                org=self.org,
            )
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["subject"]["id"], custom_staff.id)

    def test_student_query_returns_subject_not_staff(self):
        with schema_context(self.schema_name):
            student = User.objects.create_user(
                email=f"stu-{uuid4().hex[:4]}@e.com",
                password="x",
                name="Student Points Target",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            result = run_adjust_staff_points(
                {
                    "query": "Student Points",
                    "point_type_id": self.pt.id,
                    "direction": "add",
                    "amount": 1,
                    "note": "Should fail",
                },
                self.admin,
                channel_key="telegram:student",
                org=self.org,
            )
        self.assertEqual(result["error"], "subject_not_staff")
        self.assertEqual(result["subject"]["id"], student.id)

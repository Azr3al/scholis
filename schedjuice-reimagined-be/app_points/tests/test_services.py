import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_points import models, services

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ServicesTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _user(self, roles, prefix):
        s = uuid4().hex[:6]
        return User.objects.create_user(
            email=f"{prefix}-{s}@example.com",
            password="x",
            name=prefix,
            phone_number="1",
            date_of_birth=date(2000, 1, 1),
            communication_email=f"{prefix}-{s}@example.com",
            code=f"{prefix}-{s}",
            roles=roles,
        )

    def test_post_transaction_delta_zero_raises(self):
        with schema_context(self.schema_name):
            staff = self._user([User.UserRole.TEACHER], "staff")
            actor = self._user([User.UserRole.ADMIN], "actor")
            pt = models.PointType.objects.create(name=f"Gold-{uuid4().hex[:6]}")

            with self.assertRaises(ValidationError) as ctx:
                services.post_transaction(
                    subject=staff,
                    actor=actor,
                    point_type=pt,
                    delta=0,
                    note="No change",
                )
            self.assertIn("delta", ctx.exception.detail)

    def test_post_transaction_short_note_raises(self):
        with schema_context(self.schema_name):
            staff = self._user([User.UserRole.TEACHER], "staff")
            actor = self._user([User.UserRole.ADMIN], "actor")
            pt = models.PointType.objects.create(name=f"Gold-{uuid4().hex[:6]}")

            with self.assertRaises(ValidationError) as ctx:
                services.post_transaction(
                    subject=staff,
                    actor=actor,
                    point_type=pt,
                    delta=1,
                    note="  ab ",
                )
            self.assertIn("note", ctx.exception.detail)

    def test_post_transaction_inactive_type_raises(self):
        with schema_context(self.schema_name):
            staff = self._user([User.UserRole.TEACHER], "staff")
            actor = self._user([User.UserRole.ADMIN], "actor")
            pt = models.PointType.objects.create(
                name=f"Retired-{uuid4().hex[:6]}",
                is_active=False,
            )

            with self.assertRaises(ValidationError) as ctx:
                services.post_transaction(
                    subject=staff,
                    actor=actor,
                    point_type=pt,
                    delta=1,
                    note="Should fail",
                )
            self.assertIn("point_type", ctx.exception.detail)

    def test_post_transaction_student_subject_raises(self):
        with schema_context(self.schema_name):
            student = self._user([User.UserRole.STUDENT], "stu")
            actor = self._user([User.UserRole.ADMIN], "actor")
            pt = models.PointType.objects.create(name=f"Gold-{uuid4().hex[:6]}")

            with self.assertRaises(ValidationError) as ctx:
                services.post_transaction(
                    subject=student,
                    actor=actor,
                    point_type=pt,
                    delta=1,
                    note="Not allowed",
                )
            self.assertIn("subject", ctx.exception.detail)

    def test_get_balances_multi_type_and_negative(self):
        with schema_context(self.schema_name):
            staff = self._user([User.UserRole.TEACHER], "staff")
            actor = self._user([User.UserRole.ADMIN], "actor")
            gold = models.PointType.objects.create(name=f"Gold-{uuid4().hex[:6]}")
            silver = models.PointType.objects.create(name=f"Silver-{uuid4().hex[:6]}")

            services.post_transaction(
                subject=staff,
                actor=actor,
                point_type=gold,
                delta=10,
                note="Award gold",
            )
            services.post_transaction(
                subject=staff,
                actor=actor,
                point_type=gold,
                delta=-3,
                note="Deduct gold",
            )
            services.post_transaction(
                subject=staff,
                actor=actor,
                point_type=silver,
                delta=2,
                note="Award silver",
            )

            balances = services.get_balances(staff)
            self.assertEqual(balances[gold.id], 7)
            self.assertEqual(balances[silver.id], 2)

    def test_get_balances_inactive_type_with_non_zero_balance(self):
        with schema_context(self.schema_name):
            staff = self._user([User.UserRole.TEACHER], "staff")
            actor = self._user([User.UserRole.ADMIN], "actor")
            pt = models.PointType.objects.create(name=f"Legacy-{uuid4().hex[:6]}")

            services.post_transaction(
                subject=staff,
                actor=actor,
                point_type=pt,
                delta=4,
                note="Legacy points",
            )
            pt.is_active = False
            pt.save(update_fields=["is_active"])

            balances = services.get_balances(staff)
            self.assertEqual(balances[pt.id], 4)

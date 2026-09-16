import unittest

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_finance.models import PaymentBank, PaymentInfo
from app_finance.serializers import PaymentInfoSerializer

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class PaymentInfoModelTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(self.schema_name):
            self.teacher = User.objects.filter(
                roles__contains=[User.UserRole.TEACHER]
            ).exclude(roles__contains=[User.UserRole.MANAGER]).first()
            self.other_teacher = (
                User.objects.filter(roles__contains=[User.UserRole.TEACHER])
                .exclude(roles__contains=[User.UserRole.MANAGER])
                .exclude(pk=self.teacher.pk if self.teacher else None)
                .first()
            )
            self.student = User.objects.filter(
                roles=[User.UserRole.STUDENT]
            ).first()

    def test_only_one_default_per_user(self):
        with schema_context(self.schema_name):
            self.assertIsNotNone(self.teacher)
            first = PaymentInfo.objects.create(
                user=self.teacher,
                account_name="Teacher One",
                description="Default KBZ",
                bank_type=PaymentBank.KBZ,
                is_default=True,
            )
            second = PaymentInfo.objects.create(
                user=self.teacher,
                account_name="Teacher One",
                description="New default KPAY",
                bank_type=PaymentBank.KPAY,
                is_default=True,
            )
            first.refresh_from_db()
            second.refresh_from_db()
            self.assertFalse(first.is_default)
            self.assertTrue(second.is_default)
            defaults = PaymentInfo.objects.filter(
                user=self.teacher, is_default=True
            )
            self.assertEqual(defaults.count(), 1)

    def test_different_users_can_each_have_default(self):
        with schema_context(self.schema_name):
            self.assertIsNotNone(self.teacher)
            self.assertIsNotNone(self.other_teacher)
            a = PaymentInfo.objects.create(
                user=self.teacher,
                account_name="Teacher A",
                description="Teacher A default",
                bank_type=PaymentBank.KBZ,
                is_default=True,
            )
            b = PaymentInfo.objects.create(
                user=self.other_teacher,
                account_name="Teacher B",
                description="Teacher B default",
                bank_type=PaymentBank.AYA,
                is_default=True,
            )
            self.assertTrue(a.is_default)
            self.assertTrue(b.is_default)

    def test_serializer_rejects_student_only_user(self):
        with schema_context(self.schema_name):
            self.assertIsNotNone(self.student)
            serializer = PaymentInfoSerializer(
                data={
                    "user": self.student.id,
                    "account_name": "Student Account",
                    "description": "Should fail",
                    "bank_type": PaymentBank.CASH,
                    "is_default": False,
                }
            )
            self.assertFalse(serializer.is_valid())
            self.assertIn("user", serializer.errors)

    def test_serializer_requires_account_number_for_non_cash(self):
        with schema_context(self.schema_name):
            self.assertIsNotNone(self.teacher)
            serializer = PaymentInfoSerializer(
                data={
                    "user": self.teacher.id,
                    "account_name": "Teacher One",
                    "description": "",
                    "bank_type": PaymentBank.KBZ,
                    "is_default": False,
                }
            )
            self.assertFalse(serializer.is_valid())
            self.assertIn("description", serializer.errors)


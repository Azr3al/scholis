import unittest
from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_finance.models import PaymentBank, PaymentMethod, UserPayment
from app_finance.payment_group import (
    _admin_report_group_row,
    create_user_payment_group_with_parts,
)
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class PaymentDateTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.today = timezone.localdate()
        self.month_start = timezone.make_aware(
            datetime(self.today.year, self.today.month, 1, 0, 0, 0)
        )
        with schema_context(self.schema_name):
            seed_rbac()
            self.finance = User.objects.create_user(
                email=f"fin-paydate-{suffix}@example.com",
                password="x",
                name="Finance",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            self.student = User.objects.create_user(
                email=f"stu-paydate-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.create(name=f"Cat paydate {suffix}")
            prog = Program.objects.create(
                name=f"P paydate {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C paydate {suffix}",
                category=cat,
                program=prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            self.kpay = PaymentMethod.objects.create(
                name=f"KPay paydate {suffix}",
                payment_bank=PaymentBank.KPAY,
            )
            self.cash = PaymentMethod.objects.create(
                name=f"Cash paydate {suffix}",
                payment_bank=PaymentBank.CASH,
            )

    def _screenshot(self, name: str = "ss.gif") -> SimpleUploadedFile:
        return SimpleUploadedFile(
            name,
            (
                b"GIF87a\x01\x00\x01\x00\x80\x01\x00\x00\x00\x00"
                b"\xff\xff\xff,\x00\x00\x00\x00\x01\x00\x01\x00"
                b"\x00\x02\x02D\x01\x00;"
            ),
            content_type="image/gif",
        )

    def test_create_without_payment_date_sets_non_null_default(self):
        with schema_context(self.schema_name):
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                created_by=self.finance,
                payment_method=self.kpay,
                parsed_amount=Decimal("10000"),
            )
            payment.refresh_from_db()
            self.assertIsNotNone(payment.payment_date)

    def test_multipart_create_stores_per_part_payment_date(self):
        explicit = timezone.make_aware(datetime(2026, 3, 15, 0, 0, 0))
        later = timezone.make_aware(datetime(2026, 3, 20, 0, 0, 0))
        png = self._screenshot("part-a.gif")
        with schema_context(self.schema_name):
            group = create_user_payment_group_with_parts(
                actor=self.finance,
                user=self.student,
                course=self.course,
                plan_fields={"issued_at": self.month_start},
                coverage=None,
                parts=[
                    {
                        "screenshot": png,
                        "parsed_amount": Decimal("100"),
                        "payment_method": self.kpay,
                        "payment_date": explicit,
                    },
                    {
                        "screenshot": png,
                        "parsed_amount": Decimal("200"),
                        "payment_method": self.cash,
                        "payment_date": later,
                    },
                ],
            )
            dates = list(
                group.parts.order_by("id").values_list("payment_date", flat=True)
            )
            self.assertEqual(dates[0], explicit)
            self.assertEqual(dates[1], later)

    def test_group_row_payment_date_is_earliest_part(self):
        early = timezone.make_aware(datetime(2026, 1, 5, 0, 0, 0))
        late = timezone.make_aware(datetime(2026, 1, 20, 0, 0, 0))
        png = self._screenshot("group.gif")
        with schema_context(self.schema_name):
            group = create_user_payment_group_with_parts(
                actor=self.finance,
                user=self.student,
                course=self.course,
                plan_fields={"issued_at": self.month_start},
                coverage=None,
                parts=[
                    {
                        "screenshot": png,
                        "parsed_amount": Decimal("100"),
                        "payment_method": self.kpay,
                        "payment_date": late,
                    },
                    {
                        "screenshot": png,
                        "parsed_amount": Decimal("200"),
                        "payment_method": self.cash,
                        "payment_date": early,
                    },
                ],
            )
            parts = list(group.parts.select_related("user", "course", "payment_method"))
            row = _admin_report_group_row(group, parts)
            self.assertEqual(row["payment_date"], early.isoformat())

    def test_patch_updates_payment_date(self):
        with schema_context(self.schema_name):
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                created_by=self.finance,
                payment_method=self.kpay,
                payment_date=timezone.now(),
            )
            new_dt = timezone.make_aware(datetime(2025, 12, 1, 0, 0, 0))
            payment.payment_date = new_dt
            payment.save(update_fields=["payment_date"])
            payment.refresh_from_db()
            self.assertEqual(payment.payment_date, new_dt)

    def test_multipart_upload_accepts_part_payment_date(self):
        early = timezone.make_aware(datetime(2026, 2, 10, 0, 0, 0))
        late = timezone.make_aware(datetime(2026, 2, 20, 0, 0, 0))
        client = APIClient()
        client.force_authenticate(user=self.finance)
        client.credentials(HTTP_TENANT=self.schema_name)
        payload = {
            "user": self.student.id,
            "course": self.course.id,
            "issued_at": self.month_start.isoformat(),
            "billing_start_date": self.month_start.isoformat(),
            "billing_end_date": (self.month_start + timedelta(days=30)).isoformat(),
            "parts_count": "2",
            "part_0_screenshot": self._screenshot("p0.gif"),
            "part_0_parsed_amount": "12000",
            "part_0_payment_method": self.kpay.id,
            "part_0_payment_date": early.isoformat(),
            "part_1_screenshot": self._screenshot("p1.gif"),
            "part_1_parsed_amount": "8000",
            "part_1_payment_method": self.cash.id,
            "part_1_payment_date": late.isoformat(),
        }
        resp = client.post(
            "/api/v1/scan-transaction-screenshots",
            payload,
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        with schema_context(self.schema_name):
            group_id = resp.json()["data"]["group_id"]
            dates = list(
                UserPayment.objects.filter(group_id=group_id)
                .order_by("id")
                .values_list("payment_date", flat=True)
            )
            self.assertEqual(dates[0], early)
            self.assertEqual(dates[1], late)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class StudentSubmitPaymentDateTests(PaymentDateTests):
    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_student_make_payment_single_sets_payment_date(self, _mock_delay):
        with schema_context(self.schema_name):
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                status=UserPayment.Status.PENDING_PAYMENT,
                invoiced_amount=Decimal("10000"),
            )
            UserPayment.objects.filter(pk=payment.pk).update(payment_date=None)
            payment.refresh_from_db()
            self.assertIsNone(payment.payment_date)

        client = APIClient()
        client.force_authenticate(user=self.student)
        client.credentials(HTTP_TENANT=self.schema_name)
        resp = client.post(
            reverse("make-payment"),
            {
                "id": payment.id,
                "screenshot": self._screenshot(),
                "parsed_amount": "10000",
            },
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        with schema_context(self.schema_name):
            payment.refresh_from_db()
            self.assertIsNotNone(payment.payment_date)

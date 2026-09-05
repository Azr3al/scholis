import unittest
from datetime import date, datetime, timedelta
from decimal import Decimal
import json
from unittest.mock import patch
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from djmoney.money import Money

from app_finance.models import (
    Discount,
    EnrollmentDiscount,
    PaymentBank,
    PaymentInfo,
    PaymentMethod,
    PaymentPlan,
    StaffPayment,
    UserPayment,
    UserPaymentDiscount,
    UserPaymentGroup,
)
from app_finance.payment_group import (
    create_user_payment_group_with_parts,
    project_admin_report_rows,
    rollup_payment_group_status,
)
from app_finance.services import preview_kpay_screenshot
from app_rbac.seeding import seed_rbac

# Mirrors app_finance/migrations/0063_drop_userpayment_billing_window_unique.py
LEGACY_BILLING_UNIQUE = "app_finance_userpayment_user_id_course_id_billin_300fd943_uniq"
DROP_LEGACY_BILLING_UNIQUE_SQL = f"""
ALTER TABLE app_finance_userpayment
DROP CONSTRAINT IF EXISTS {LEGACY_BILLING_UNIQUE};
"""


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class RollupPaymentGroupStatusTests(SimpleTestCase):
    def test_all_verified(self):
        self.assertEqual(
            rollup_payment_group_status(
                [
                    UserPayment.Status.VERIFIED,
                    UserPayment.Status.VERIFIED,
                ]
            ),
            UserPayment.Status.VERIFIED,
        )

    def test_duplicated_wins(self):
        self.assertEqual(
            rollup_payment_group_status(
                [
                    UserPayment.Status.VERIFIED,
                    UserPayment.Status.DUPLICATED,
                    UserPayment.Status.PENDING_VERIFICATION,
                ]
            ),
            UserPayment.Status.DUPLICATED,
        )

    def test_priority_order(self):
        self.assertEqual(
            rollup_payment_group_status(
                [
                    UserPayment.Status.PENDING_PAYMENT,
                    UserPayment.Status.CANNOT_EXTRACT,
                ]
            ),
            UserPayment.Status.CANNOT_EXTRACT,
        )

    def test_empty_defaults_pending_payment(self):
        self.assertEqual(
            rollup_payment_group_status([]),
            UserPayment.Status.PENDING_PAYMENT,
        )


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class OcrPaymentScreenshotViewTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.finance = User.objects.create_user(
                email=f"fin-ocr-{suffix}@example.com",
                password="x",
                name="Finance",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            self.hr = User.objects.create_user(
                email=f"hr-ocr-{suffix}@example.com",
                password="x",
                name="HR OCR",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.HR],
            )
            self.teacher = User.objects.create_user(
                email=f"tch-ocr-{suffix}@example.com",
                password="x",
                name="Teacher OCR",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            teacher_info = PaymentInfo.objects.create(
                user=self.teacher,
                account_name="Teacher OCR",
                description="09111111111",
                bank_type=PaymentBank.KBZ,
                is_default=True,
            )
            paid_at = timezone.now()
            self.staff_payment = StaffPayment.objects.create(
                user=self.teacher,
                payment_info=teacher_info,
                amount="50000",
                amount_currency="USD",
                paid_at=paid_at,
                pay_period_year=paid_at.year,
                pay_period_month=paid_at.month,
                transaction_id="12345678901234567890",
                created_by=self.hr,
            )
            self.student = User.objects.create_user(
                email=f"stu-ocr-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _screenshot(self) -> SimpleUploadedFile:
        return SimpleUploadedFile(
            "kpay.jpg",
            b"fake-jpeg-bytes",
            content_type="image/jpeg",
        )

    @patch("app_finance.views.preview_kpay_screenshot", create=True)
    def test_success_returns_preview_fields_without_creating_payment(
        self, mock_preview
    ):
        mock_preview.return_value = {
            "ok": True,
            "transaction_id": "12345678901234567890",
            "parsed_amount": "12000",
            "date_on_screenshot": None,
            "duplicate_of_payment_id": None,
            "json_ocr_data": {
                "transaction_id": "12345678901234567890",
                "amount": [12000],
            },
        }
        before_count = UserPayment.objects.count()

        resp = self._client(self.finance).post(
            "/api/v1/ocr-payment-screenshot",
            {"screenshot": self._screenshot()},
            format="multipart",
        )

        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()["data"]
        self.assertEqual(data["transaction_id"], "12345678901234567890")
        self.assertEqual(data["parsed_amount"], "12000")
        self.assertIsNone(data["duplicate_of_payment_id"])
        self.assertEqual(UserPayment.objects.count(), before_count)
        mock_preview.assert_called_once()

    def test_missing_screenshot_returns_400(self):
        resp = self._client(self.finance).post(
            "/api/v1/ocr-payment-screenshot",
            {},
            format="multipart",
        )

        self.assertEqual(resp.status_code, 400, resp.content)

    @patch("app_finance.views.preview_kpay_screenshot", create=True)
    def test_user_without_payment_record_returns_403(self, mock_preview):
        resp = self._client(self.student).post(
            "/api/v1/ocr-payment-screenshot",
            {"screenshot": self._screenshot()},
            format="multipart",
        )

        self.assertEqual(resp.status_code, 403, resp.content)
        mock_preview.assert_not_called()

    @patch("app_finance.views.preview_kpay_screenshot", create=True)
    def test_hr_with_payroll_manage_can_preview(self, mock_preview):
        mock_preview.return_value = {
            "ok": True,
            "transaction_id": "12345678901234567890",
            "parsed_amount": "12000",
            "date_on_screenshot": None,
            "duplicate_of_payment_id": None,
            "json_ocr_data": {},
        }

        resp = self._client(self.hr).post(
            "/api/v1/ocr-payment-screenshot",
            {
                "screenshot": self._screenshot(),
                "payment_kind": "staff",
            },
            format="multipart",
        )

        self.assertEqual(resp.status_code, 200, resp.content)
        mock_preview.assert_called_once()
        _, kwargs = mock_preview.call_args
        self.assertEqual(kwargs.get("payment_kind"), "staff")

    @patch("app_finance.views.preview_kpay_screenshot", create=True)
    def test_staff_payment_kind_passes_to_preview(self, mock_preview):
        mock_preview.return_value = {
            "ok": True,
            "transaction_id": "12345678901234567890",
            "parsed_amount": "12000",
            "date_on_screenshot": None,
            "duplicate_of_payment_id": self.staff_payment.id,
            "json_ocr_data": {},
        }

        resp = self._client(self.finance).post(
            "/api/v1/ocr-payment-screenshot",
            {
                "screenshot": self._screenshot(),
                "payment_kind": "staff",
            },
            format="multipart",
        )

        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(
            resp.json()["data"]["duplicate_of_payment_id"],
            self.staff_payment.id,
        )
        mock_preview.assert_called_once()
        _, kwargs = mock_preview.call_args
        self.assertEqual(kwargs.get("payment_kind"), "staff")

    @patch("app_finance.services.image_file_to_text")
    def test_staff_duplicate_lookup_uses_staff_payment(self, mock_ocr):
        mock_ocr.return_value = {
            "ParsedResults": [
                {
                    "TextOverlay": {
                        "Lines": [
                            {"LineText": "12345678901234567890"},
                            {"LineText": "50,000.00 ks"},
                        ]
                    }
                }
            ]
        }

        with schema_context(self.schema_name):
            result = preview_kpay_screenshot(
                self._screenshot(),
                filename="kpay.jpg",
                payment_kind="staff",
            )

        self.assertTrue(result["ok"])
        self.assertEqual(result["duplicate_of_payment_id"], self.staff_payment.id)

    @patch("app_finance.views.preview_kpay_screenshot", create=True)
    def test_preview_failure_returns_422(self, mock_preview):
        mock_preview.return_value = {
            "ok": False,
            "error": "Could not extract payment details.",
            "json_ocr_data": {"ParsedResults": []},
        }

        resp = self._client(self.finance).post(
            "/api/v1/ocr-payment-screenshot",
            {"screenshot": self._screenshot()},
            format="multipart",
        )

        self.assertEqual(resp.status_code, 422, resp.content)
        self.assertEqual(
            resp.json()["data"]["error"], "Could not extract payment details."
        )


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class MultiPartPaymentCreateTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.today = timezone.localdate()
        self.month_start = timezone.make_aware(
            datetime(self.today.year, self.today.month, 1, 0, 0, 0)
        )
        self.month_end = self.month_start + timedelta(days=30)
        with schema_context(self.schema_name):
            seed_rbac()
            self.finance = User.objects.create_user(
                email=f"fin-multi-{suffix}@example.com",
                password="x",
                name="Finance",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            self.student = User.objects.create_user(
                email=f"stu-multi-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.create(name=f"Cat multi {suffix}")
            prog = Program.objects.create(
                name=f"P multi {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C multi {suffix}",
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
                name=f"KPay multi {suffix}",
                payment_bank=PaymentBank.KPAY,
            )
            self.cash = PaymentMethod.objects.create(
                name=f"Cash multi {suffix}",
                payment_bank=PaymentBank.CASH,
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _screenshot(self, name: str) -> SimpleUploadedFile:
        return SimpleUploadedFile(
            name,
            (
                b"GIF87a\x01\x00\x01\x00\x80\x01\x00\x00\x00\x00"
                b"\xff\xff\xff,\x00\x00\x00\x00\x01\x00\x01\x00"
                b"\x00\x02\x02D\x01\x00;"
            ),
            content_type="image/gif",
        )

    def _base_payload(self):
        return {
            "user": self.student.id,
            "course": self.course.id,
            "issued_at": self.month_start.isoformat(),
            "billing_start_date": self.month_start.isoformat(),
            "billing_end_date": self.month_end.isoformat(),
        }

    def _admin_report_payload(self):
        return {
            "filter_params": [
                {
                    "field_name": "course_id",
                    "operator": "exact",
                    "value": str(self.course.id),
                },
                {
                    "field_name": "issued_at",
                    "operator": "gte",
                    "value": self.month_start.isoformat(),
                },
                {
                    "field_name": "issued_at",
                    "operator": "lte",
                    "value": self.month_end.isoformat(),
                },
            ]
        }

    def _admin_report_rows_for_student_course(self):
        resp = self._client(self.finance).post(
            "/api/v1/user-payments/admin-report",
            self._admin_report_payload(),
            format="json",
        )

        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()["data"]
        rows = data["data"] if isinstance(data, dict) else data
        return [
            row
            for row in rows
            if "new" not in str(row["id"])
            and row["user"]["id"] == self.student.id
            and row["course"]["id"] == self.course.id
        ]

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_single_part_still_group_null(self, mock_ocr):
        prefilled = {
            **self._base_payload(),
            "screenshot": self._screenshot("single-prefilled.jpg"),
            "parsed_amount": "12000",
            "payment_method": self.kpay.id,
            "transaction_id": "11111111111111111111",
        }

        resp = self._client(self.finance).post(
            "/api/v1/scan-transaction-screenshots",
            prefilled,
            format="multipart",
        )

        self.assertEqual(resp.status_code, 200, resp.content)
        with schema_context(self.schema_name):
            payment = UserPayment.objects.get(transaction_id="11111111111111111111")
            self.assertIsNone(payment.group_id)
        self.assertIsNone(resp.json()["data"]["group_id"])
        mock_ocr.assert_not_called()

        screenshot_only = {
            **self._base_payload(),
            "screenshot": self._screenshot("single-ocr.jpg"),
            "payment_method": self.kpay.id,
        }

        resp = self._client(self.finance).post(
            "/api/v1/scan-transaction-screenshots",
            screenshot_only,
            format="multipart",
        )

        self.assertEqual(resp.status_code, 200, resp.content)
        created_id = resp.json()["data"]["id"]
        with schema_context(self.schema_name):
            payment = UserPayment.objects.get(id=created_id)
            self.assertIsNone(payment.group_id)
        mock_ocr.assert_called_once_with(created_id, self.schema_name)

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_two_parts_create_group(self, mock_ocr):
        payload = {
            **self._base_payload(),
            "parts_count": "2",
            "part_0_screenshot": self._screenshot("part-0.jpg"),
            "part_0_parsed_amount": "12000",
            "part_0_payment_method": self.kpay.id,
            "part_0_transaction_id": "22222222222222222222",
            "part_1_screenshot": self._screenshot("part-1.jpg"),
            "part_1_parsed_amount": "8000",
            "part_1_payment_method": self.cash.id,
            "part_1_transaction_id": "33333333333333333333",
        }

        resp = self._client(self.finance).post(
            "/api/v1/scan-transaction-screenshots",
            payload,
            format="multipart",
        )

        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()["data"]
        with schema_context(self.schema_name):
            self.assertEqual(UserPaymentGroup.objects.count(), 1)
            group = UserPaymentGroup.objects.get(id=data["group_id"])
            parts = list(group.parts.order_by("id"))
            self.assertEqual(len(parts), 2)
            self.assertEqual(
                sum(part.parsed_amount.amount for part in parts),
                20000,
            )
            self.assertEqual({part.group_id for part in parts}, {group.id})
        self.assertEqual(len(data["part_ids"]), 2)
        mock_ocr.assert_not_called()

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_two_parts_prices_all_covered_months_not_one(self, mock_ocr):
        """Regression: split-screenshot groups must price from covered_months span."""
        course_start = date(2026, 1, 1)
        course_end = date(2026, 3, 31)
        covered = [
            {"year": 2026, "month_index": 1},
            {"year": 2026, "month_index": 2},
            {"year": 2026, "month_index": 3},
        ]
        with schema_context(self.schema_name):
            plan = PaymentPlan.objects.create(
                name=f"plan-multi-3m-{uuid4().hex[:6]}",
                price=Money(130000, "USD"),
                billing_type=PaymentPlan.BillingType.PER_PERIOD,
            )
            self.course.start_date = course_start
            self.course.end_date = course_end
            self.course.payment_plan = plan
            self.course.save(
                update_fields=["start_date", "end_date", "payment_plan", "updated_at"]
            )

        payload = {
            **self._base_payload(),
            "parts_count": "2",
            "covered_months": json.dumps(covered),
            "part_0_screenshot": self._screenshot("part-0-3m.jpg"),
            "part_0_parsed_amount": "120000",
            "part_0_payment_method": self.kpay.id,
            "part_0_transaction_id": "77777777777777777771",
            "part_1_screenshot": self._screenshot("part-1-3m.jpg"),
            "part_1_parsed_amount": "90000",
            "part_1_payment_method": self.cash.id,
            "part_1_transaction_id": "77777777777777777772",
        }

        resp = self._client(self.finance).post(
            "/api/v1/scan-transaction-screenshots",
            payload,
            format="multipart",
        )

        self.assertEqual(resp.status_code, 200, resp.content)
        with schema_context(self.schema_name):
            group = UserPaymentGroup.objects.get(id=resp.json()["data"]["group_id"])
            parts = list(group.parts.order_by("id"))
            self.assertEqual(len(parts), 2)
            first = parts[0]
            self.assertEqual(first.base_amount, Money(390000, "USD"))
            self.assertEqual(first.invoiced_amount, Money(390000, "USD"))
            self.assertIsNone(parts[1].base_amount)
            for part in parts:
                self.assertEqual(part.covered_months.count(), 3)
        mock_ocr.assert_not_called()

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_two_parts_prefilled_amount_without_transaction_id(self, mock_ocr):
        """Upload-phase OCR fills amount; parts should not stay awaiting_extraction."""
        payload = {
            **self._base_payload(),
            "parts_count": "2",
            "part_0_screenshot": self._screenshot("part-0-no-txn.jpg"),
            "part_0_parsed_amount": "12000",
            "part_0_payment_method": self.kpay.id,
            "part_1_screenshot": self._screenshot("part-1-no-txn.jpg"),
            "part_1_parsed_amount": "8000",
            "part_1_payment_method": self.cash.id,
        }

        resp = self._client(self.finance).post(
            "/api/v1/scan-transaction-screenshots",
            payload,
            format="multipart",
        )

        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()["data"]
        with schema_context(self.schema_name):
            group = UserPaymentGroup.objects.get(id=data["group_id"])
            parts = list(group.parts.order_by("id"))
            self.assertEqual(len(parts), 2)
            for part in parts:
                self.assertEqual(
                    part.status,
                    UserPayment.Status.PENDING_VERIFICATION,
                )
            self.assertEqual(
                rollup_payment_group_status([p.status for p in parts]),
                UserPayment.Status.PENDING_VERIFICATION,
            )
        mock_ocr.assert_not_called()

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_two_parts_ok_after_dropping_legacy_billing_unique(self, mock_ocr):
        """Orphan UNIQUE(user, course, billing_*) blocks multi-part inserts until dropped."""
        with schema_context(self.schema_name):
            with connection.cursor() as cursor:
                cursor.execute(
                    f"ALTER TABLE app_finance_userpayment "
                    f"DROP CONSTRAINT IF EXISTS {LEGACY_BILLING_UNIQUE}"
                )
                cursor.execute(
                    f"ALTER TABLE app_finance_userpayment "
                    f"ADD CONSTRAINT {LEGACY_BILLING_UNIQUE} "
                    f"UNIQUE (user_id, course_id, billing_start_date, billing_end_date)"
                )

            from django.db.utils import IntegrityError

            with self.assertRaises(IntegrityError):
                create_user_payment_group_with_parts(
                    actor=self.finance,
                    user=self.student,
                    course=self.course,
                    plan_fields={
                        "issued_at": self.month_start,
                        "billing_start_date": self.month_start,
                        "billing_end_date": self.month_end,
                        "is_installment": False,
                        "installment_percent": None,
                    },
                    coverage=None,
                    parts=[
                        {
                            "parsed_amount": "12000",
                            "payment_method": self.kpay,
                            "transaction_id": "44444444444444444441",
                        },
                        {
                            "parsed_amount": "8000",
                            "payment_method": self.cash,
                            "transaction_id": "44444444444444444442",
                        },
                    ],
                )

            with connection.cursor() as cursor:
                cursor.execute(DROP_LEGACY_BILLING_UNIQUE_SQL)

            group = create_user_payment_group_with_parts(
                actor=self.finance,
                user=self.student,
                course=self.course,
                plan_fields={
                    "issued_at": self.month_start,
                    "billing_start_date": self.month_start,
                    "billing_end_date": self.month_end,
                    "is_installment": False,
                    "installment_percent": None,
                },
                coverage=None,
                parts=[
                    {
                        "parsed_amount": "12000",
                        "payment_method": self.kpay,
                        "transaction_id": "44444444444444444443",
                    },
                    {
                        "parsed_amount": "8000",
                        "payment_method": self.cash,
                        "transaction_id": "44444444444444444444",
                    },
                ],
            )
            self.assertEqual(group.parts.count(), 2)
        mock_ocr.assert_not_called()

    def test_rejects_duplicate_txn_within_submit(self):
        payload = {
            **self._base_payload(),
            "parts_count": "2",
            "part_0_screenshot": self._screenshot("dup-0.jpg"),
            "part_0_parsed_amount": "12000",
            "part_0_payment_method": self.kpay.id,
            "part_0_transaction_id": "44444444444444444444",
            "part_1_screenshot": self._screenshot("dup-1.jpg"),
            "part_1_parsed_amount": "8000",
            "part_1_payment_method": self.cash.id,
            "part_1_transaction_id": "44444444444444444444",
        }

        resp = self._client(self.finance).post(
            "/api/v1/scan-transaction-screenshots",
            payload,
            format="multipart",
        )

        self.assertEqual(resp.status_code, 400, resp.content)
        with schema_context(self.schema_name):
            self.assertEqual(UserPaymentGroup.objects.count(), 0)
            self.assertFalse(
                UserPayment.objects.filter(
                    transaction_id="44444444444444444444"
                ).exists()
            )

    def test_admin_report_includes_amount_and_discount_fields(self):
        discount_name = f"Sibling-{uuid4().hex[:6]}"
        with schema_context(self.schema_name):
            discount = Discount.objects.create(
                name=discount_name,
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("10"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            enrollment = UserCourse.objects.get(
                user=self.student, course=self.course
            )
            ed = EnrollmentDiscount.objects.create(
                user_course=enrollment,
                discount=discount,
                snapshot_discount_type=Discount.DiscountType.PERCENT,
                snapshot_scope=Discount.Scope.WHOLE_ENROLLMENT,
                snapshot_percent_value=Decimal("10"),
                applied_by=self.finance,
                is_active=True,
            )
            UserPayment.objects.create(
                user=self.student,
                course=self.course,
                created_by=self.finance,
                issued_at=self.month_start,
                billing_start_date=self.month_start,
                billing_end_date=self.month_end,
                payment_method=self.kpay,
                transaction_id="RECEIPT-AMT-1",
                status=UserPayment.Status.VERIFIED,
                parsed_amount=Money(450, "USD"),
                actual_amount=Money(450, "USD"),
                base_amount=Money(500, "USD"),
                discount_amount=Money(50, "USD"),
                invoiced_amount=Money(450, "USD"),
                enrollment_discount=ed,
            )
            payment = UserPayment.objects.get(transaction_id="RECEIPT-AMT-1")
            UserPaymentDiscount.objects.create(
                user_payment=payment,
                enrollment_discount=ed,
                label=discount_name,
                amount=Money(50, "USD"),
            )

        rows = self._admin_report_rows_for_student_course()
        row = next(
            r
            for r in rows
            if r.get("kind") == "payment"
            and r.get("transaction_id") == "RECEIPT-AMT-1"
        )
        self.assertEqual(Decimal(str(row["base_amount"])), Decimal("500"))
        self.assertEqual(Decimal(str(row["discount_amount"])), Decimal("50"))
        self.assertEqual(Decimal(str(row["invoiced_amount"])), Decimal("450"))
        self.assertEqual(Decimal(str(row["actual_amount"])), Decimal("450"))
        self.assertEqual(row["discount_label"], discount_name)
        self.assertEqual(len(row["discount_lines"]), 1)
        self.assertEqual(row["discount_lines"][0]["label"], discount_name)
        self.assertEqual(Decimal(str(row["discount_lines"][0]["amount"])), Decimal("50"))

    def test_admin_report_reads_receipt_number_from_the_receipt(self):
        with schema_context(self.schema_name):
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                created_by=self.finance,
                issued_at=self.month_start,
                billing_start_date=self.month_start,
                billing_end_date=self.month_end,
                payment_method=self.kpay,
                transaction_id="RECEIPT-NUM-7",
                status=UserPayment.Status.PENDING_VERIFICATION,
                parsed_amount=Money(100, "USD"),
                actual_amount=Money(100, "USD"),
            )
            payment.status = UserPayment.Status.VERIFIED
            payment.save(update_fields=["status"])
            payment.refresh_from_db()
            expected = payment.receipt.number

        rows = self._admin_report_rows_for_student_course()
        row = next(
            r
            for r in rows
            if r.get("kind") == "payment"
            and r.get("transaction_id") == "RECEIPT-NUM-7"
        )
        self.assertEqual(row["receipt_number"], expected)

    def test_group_row_exposes_the_shared_receipt_number(self):
        with schema_context(self.schema_name):
            group = UserPaymentGroup.objects.create(
                user=self.student,
                course=self.course,
                group_kind=UserPaymentGroup.GroupKind.SPLIT_SCREENSHOTS,
            )
            parts = [
                UserPayment.objects.create(
                    group=group,
                    user=self.student,
                    course=self.course,
                    transaction_id=f"GRP-ROW-{index}",
                    parsed_amount=Money(50, "USD"),
                    status=UserPayment.Status.PENDING_VERIFICATION,
                )
                for index in range(2)
            ]
            for part in parts:
                part.status = UserPayment.Status.VERIFIED
                part.save(update_fields=["status"])
            refreshed = list(
                UserPayment.objects.filter(group_id=group.id).select_related(
                    "receipt", "user", "course", "payment_method"
                )
            )
            expected = refreshed[0].receipt.number
            rows = project_admin_report_rows(refreshed)

        group_row = next(r for r in rows if r.get("kind") == "group")
        self.assertEqual(group_row["receipt_number"], expected)
        self.assertEqual(
            {p["receipt_number"] for p in group_row["parts"]},
            {expected},
        )

    def test_admin_report_includes_stacked_discount_lines(self):
        early_name = f"Early-{uuid4().hex[:6]}"
        loyalty_name = f"Loyalty-{uuid4().hex[:6]}"
        with schema_context(self.schema_name):
            early = Discount.objects.create(
                name=early_name,
                discount_type=Discount.DiscountType.FIXED_AMOUNT,
                fixed_amount=Money(180000, "USD"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            loyalty = Discount.objects.create(
                name=loyalty_name,
                discount_type=Discount.DiscountType.FIXED_AMOUNT,
                fixed_amount=Money(40000, "USD"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            enrollment = UserCourse.objects.get(
                user=self.student, course=self.course
            )
            ed_early = EnrollmentDiscount.objects.create(
                user_course=enrollment,
                discount=early,
                snapshot_discount_type=Discount.DiscountType.FIXED_AMOUNT,
                snapshot_scope=Discount.Scope.WHOLE_ENROLLMENT,
                snapshot_fixed_amount=Money(180000, "USD"),
                applied_by=self.finance,
                is_active=True,
            )
            ed_loyalty = EnrollmentDiscount.objects.create(
                user_course=enrollment,
                discount=loyalty,
                snapshot_discount_type=Discount.DiscountType.FIXED_AMOUNT,
                snapshot_scope=Discount.Scope.WHOLE_ENROLLMENT,
                snapshot_fixed_amount=Money(40000, "USD"),
                applied_by=self.finance,
                is_active=True,
            )
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                created_by=self.finance,
                issued_at=self.month_start,
                billing_start_date=self.month_start,
                billing_end_date=self.month_end,
                payment_method=self.kpay,
                transaction_id="RECEIPT-STACK-1",
                status=UserPayment.Status.VERIFIED,
                parsed_amount=Money(210000, "USD"),
                actual_amount=Money(210000, "USD"),
                base_amount=Money(430000, "USD"),
                discount_amount=Money(220000, "USD"),
                invoiced_amount=Money(210000, "USD"),
            )
            UserPaymentDiscount.objects.create(
                user_payment=payment,
                enrollment_discount=ed_early,
                label=early_name,
                amount=Money(180000, "USD"),
            )
            UserPaymentDiscount.objects.create(
                user_payment=payment,
                enrollment_discount=ed_loyalty,
                label=loyalty_name,
                amount=Money(40000, "USD"),
            )

        rows = self._admin_report_rows_for_student_course()
        row = next(
            r
            for r in rows
            if r.get("kind") == "payment"
            and r.get("transaction_id") == "RECEIPT-STACK-1"
        )
        self.assertEqual(len(row["discount_lines"]), 2)
        labels = {ln["label"] for ln in row["discount_lines"]}
        self.assertEqual(labels, {early_name, loyalty_name})
        amounts = {
            Decimal(str(ln["amount"])) for ln in row["discount_lines"]
        }
        self.assertEqual(amounts, {Decimal("180000"), Decimal("40000")})

    def test_admin_report_group_rolls_up_amounts_and_discount_label(self):
        discount_name = f"Sibling-grp-{uuid4().hex[:6]}"
        with schema_context(self.schema_name):
            discount = Discount.objects.create(
                name=discount_name,
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("10"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            enrollment = UserCourse.objects.get(
                user=self.student, course=self.course
            )
            ed = EnrollmentDiscount.objects.create(
                user_course=enrollment,
                discount=discount,
                snapshot_discount_type=Discount.DiscountType.PERCENT,
                snapshot_scope=Discount.Scope.WHOLE_ENROLLMENT,
                snapshot_percent_value=Decimal("10"),
                applied_by=self.finance,
                is_active=True,
            )
            group = create_user_payment_group_with_parts(
                actor=self.finance,
                user=self.student,
                course=self.course,
                plan_fields={
                    "issued_at": self.month_start,
                    "billing_start_date": self.month_start,
                    "billing_end_date": self.month_end,
                    "is_installment": False,
                    "installment_percent": None,
                },
                coverage=[
                    {
                        "year": self.today.year,
                        "month_index": self.today.month,
                    }
                ],
                parts=[
                    {
                        "parsed_amount": "200",
                        "payment_method": self.kpay,
                        "transaction_id": "RECEIPT-GRP-A",
                    },
                    {
                        "parsed_amount": "250",
                        "payment_method": self.cash,
                        "transaction_id": "RECEIPT-GRP-B",
                    },
                ],
            )
            for part in group.parts.all():
                part.base_amount = Money(500, "USD")
                part.discount_amount = Money(50, "USD")
                part.invoiced_amount = Money(450, "USD")
                part.actual_amount = Money(225, "USD")
                part.enrollment_discount = ed
                part.save(
                    update_fields=[
                        "base_amount",
                        "discount_amount",
                        "invoiced_amount",
                        "actual_amount",
                        "enrollment_discount",
                    ]
                )

        rows = self._admin_report_rows_for_student_course()
        row = next(r for r in rows if r.get("kind") == "group")
        self.assertEqual(Decimal(str(row["base_amount"])), Decimal("1000"))
        self.assertEqual(Decimal(str(row["discount_amount"])), Decimal("100"))
        self.assertEqual(row["discount_label"], discount_name)
        self.assertEqual(row["parts"][0]["discount_label"], discount_name)

        other_name = f"Loyalty-{uuid4().hex[:6]}"
        with schema_context(self.schema_name):
            other = Discount.objects.create(
                name=other_name,
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("5"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            EnrollmentDiscount.objects.filter(id=ed.id).update(is_active=False)
            ed2 = EnrollmentDiscount.objects.create(
                user_course=UserCourse.objects.get(
                    user=self.student, course=self.course
                ),
                discount=other,
                snapshot_discount_type=Discount.DiscountType.PERCENT,
                snapshot_scope=Discount.Scope.WHOLE_ENROLLMENT,
                snapshot_percent_value=Decimal("5"),
                applied_by=self.finance,
                is_active=True,
            )
            parts = list(
                UserPaymentGroup.objects.get(id=group.id).parts.order_by("id")
            )
            parts[0].enrollment_discount = ed
            parts[0].save(update_fields=["enrollment_discount"])
            parts[1].enrollment_discount = ed2
            parts[1].save(update_fields=["enrollment_discount"])

        rows = self._admin_report_rows_for_student_course()
        row = next(r for r in rows if r.get("kind") == "group")
        self.assertEqual(row["discount_label"], "Multiple")

    def test_admin_report_projects_group_as_one_logical_row(self):
        with schema_context(self.schema_name):
            group = create_user_payment_group_with_parts(
                actor=self.finance,
                user=self.student,
                course=self.course,
                plan_fields={
                    "issued_at": self.month_start,
                    "billing_start_date": self.month_start,
                    "billing_end_date": self.month_end,
                    "is_installment": True,
                    "installment_percent": Decimal("50"),
                },
                coverage=[
                    {
                        "year": self.today.year,
                        "month_index": self.today.month,
                    }
                ],
                parts=[
                    {
                        "parsed_amount": "12000",
                        "payment_method": self.kpay,
                        "transaction_id": "77777777777777777777",
                    },
                    {
                        "parsed_amount": "8000",
                        "payment_method": self.cash,
                        "transaction_id": "88888888888888888888",
                    },
                ],
            )
            expected_status = rollup_payment_group_status(
                list(group.parts.values_list("status", flat=True))
            )

        rows = self._admin_report_rows_for_student_course()

        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["id"], f"group-{group.id}")
        self.assertEqual(row["kind"], "group")
        self.assertEqual(row["group_id"], group.id)
        self.assertEqual(row["part_count"], 2)
        self.assertEqual(Decimal(str(row["parsed_amount"])), Decimal("20000"))
        self.assertEqual(row["status"], expected_status)
        self.assertEqual(row["payment_method"], {"id": None, "name": "Multiple"})
        self.assertFalse(row["month_overlap_duplicate_coverage"])
        self.assertEqual(row["month_overlap_peer_count"], 1)
        self.assertEqual(
            [part["kind"] for part in row["parts"]], ["payment", "payment"]
        )

    def test_admin_report_marks_two_standalone_payments_as_overlap(self):
        with schema_context(self.schema_name):
            UserPayment.objects.create(
                user=self.student,
                course=self.course,
                created_by=self.finance,
                issued_at=self.month_start,
                billing_start_date=self.month_start,
                billing_end_date=self.month_end,
                parsed_amount=Decimal("12000"),
                payment_method=self.kpay,
                transaction_id="99999999999999999991",
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            UserPayment.objects.create(
                user=self.student,
                course=self.course,
                created_by=self.finance,
                issued_at=self.month_start,
                billing_start_date=self.month_start,
                billing_end_date=self.month_end,
                parsed_amount=Decimal("8000"),
                payment_method=self.cash,
                transaction_id="99999999999999999992",
                status=UserPayment.Status.PENDING_VERIFICATION,
            )

        rows = self._admin_report_rows_for_student_course()

        self.assertEqual(len(rows), 2)
        self.assertEqual({row["kind"] for row in rows}, {"payment"})
        self.assertTrue(all(row["month_overlap_duplicate_coverage"] for row in rows))
        self.assertEqual({row["month_overlap_peer_count"] for row in rows}, {2})

    def test_all_or_nothing_on_invalid_part(self):
        payload = {
            **self._base_payload(),
            "parts_count": "2",
            "part_0_screenshot": self._screenshot("valid-0.jpg"),
            "part_0_parsed_amount": "12000",
            "part_0_payment_method": self.kpay.id,
            "part_0_transaction_id": "55555555555555555555",
            "part_1_screenshot": self._screenshot("invalid-1.jpg"),
            "part_1_payment_method": self.cash.id,
            "part_1_transaction_id": "66666666666666666666",
        }

        resp = self._client(self.finance).post(
            "/api/v1/scan-transaction-screenshots",
            payload,
            format="multipart",
        )

        self.assertEqual(resp.status_code, 400, resp.content)
        with schema_context(self.schema_name):
            self.assertEqual(UserPaymentGroup.objects.count(), 0)
            self.assertFalse(
                UserPayment.objects.filter(
                    transaction_id__in=[
                        "55555555555555555555",
                        "66666666666666666666",
                    ]
                ).exists()
            )

    def _create_group_for_detail_tests(self, *, first_status=None):
        with schema_context(self.schema_name):
            group = create_user_payment_group_with_parts(
                actor=self.finance,
                user=self.student,
                course=self.course,
                plan_fields={
                    "issued_at": self.month_start,
                    "billing_start_date": self.month_start,
                    "billing_end_date": self.month_end,
                    "is_installment": False,
                    "installment_percent": None,
                },
                coverage=[
                    {
                        "year": self.today.year,
                        "month_index": self.today.month,
                    }
                ],
                parts=[
                    {
                        "parsed_amount": "12000",
                        "payment_method": self.kpay,
                        "transaction_id": f"{uuid4().int % 10**20:020d}",
                    },
                    {
                        "parsed_amount": "8000",
                        "payment_method": self.cash,
                        "transaction_id": f"{uuid4().int % 10**20:020d}",
                    },
                ],
            )
            if first_status is not None:
                part = group.parts.order_by("id").first()
                part.status = first_status
                part.save(update_fields=["status"])
            return group.id

    def test_group_details_returns_group_and_parts(self):
        group_id = self._create_group_for_detail_tests()

        resp = self._client(self.finance).get(f"/api/v1/user-payment-groups/{group_id}")

        self.assertEqual(resp.status_code, 200, resp.content)
        row = resp.json()["data"]
        self.assertEqual(row["id"], f"group-{group_id}")
        self.assertEqual(row["kind"], "group")
        self.assertEqual(row["group_id"], group_id)
        self.assertEqual(row["part_count"], 2)
        self.assertEqual(Decimal(str(row["parsed_amount"])), Decimal("20000"))
        self.assertEqual(len(row["parts"]), 2)
        self.assertEqual(
            [part["kind"] for part in row["parts"]], ["payment", "payment"]
        )

    def test_group_details_returns_404_for_unknown_group(self):
        resp = self._client(self.finance).get("/api/v1/user-payment-groups/999999")

        self.assertEqual(resp.status_code, 404, resp.content)

    def test_group_coverage_put_succeeds_when_no_part_verified(self):
        group_id = self._create_group_for_detail_tests()
        payload = {
            "covered_months": [
                {"year": self.today.year, "month_index": self.today.month},
                {"year": self.today.year, "month_index": self.today.month + 1},
            ],
            "issued_at": self.month_start.isoformat(),
            "billing_start_date": self.month_start.isoformat(),
            "billing_end_date": self.month_end.isoformat(),
            "is_installment": True,
            "installment_percent": "50",
        }

        resp = self._client(self.finance).put(
            f"/api/v1/user-payment-groups/{group_id}",
            payload,
            format="json",
        )

        self.assertEqual(resp.status_code, 200, resp.content)
        row = resp.json()["data"]
        self.assertTrue(row["is_installment"])
        self.assertEqual(row["installment_percent"], "50.00")
        self.assertEqual(len(row["covered_months"]), 2)
        with schema_context(self.schema_name):
            for part in UserPaymentGroup.objects.get(id=group_id).parts.all():
                self.assertTrue(part.is_installment)
                self.assertEqual(part.installment_percent, Decimal("50"))
                self.assertEqual(part.covered_months.count(), 2)

    def test_group_coverage_put_reprices_first_part(self):
        """Updating group coverage must re-derive base from the new span."""
        course_start = date(2026, 1, 1)
        course_end = date(2026, 3, 31)
        with schema_context(self.schema_name):
            plan = PaymentPlan.objects.create(
                name=f"plan-grp-reprice-{uuid4().hex[:6]}",
                price=Money(130000, "USD"),
                billing_type=PaymentPlan.BillingType.PER_PERIOD,
            )
            self.course.start_date = course_start
            self.course.end_date = course_end
            self.course.payment_plan = plan
            self.course.save(
                update_fields=["start_date", "end_date", "payment_plan", "updated_at"]
            )

        group_id = self._create_group_for_detail_tests()
        with schema_context(self.schema_name):
            first = (
                UserPaymentGroup.objects.get(id=group_id)
                .parts.order_by("id")
                .first()
            )
            first.base_amount = Money(130000, "USD")
            first.discount_amount = Money(0, "USD")
            first.invoiced_amount = Money(130000, "USD")
            first.computed_invoiced_amount = Money(130000, "USD")
            first.save(
                update_fields=[
                    "base_amount",
                    "discount_amount",
                    "invoiced_amount",
                    "computed_invoiced_amount",
                    "updated_at",
                ]
            )

        resp = self._client(self.finance).put(
            f"/api/v1/user-payment-groups/{group_id}",
            {
                "covered_months": [
                    {"year": 2026, "month_index": 1},
                    {"year": 2026, "month_index": 2},
                    {"year": 2026, "month_index": 3},
                ],
            },
            format="json",
        )

        self.assertEqual(resp.status_code, 200, resp.content)
        with schema_context(self.schema_name):
            first.refresh_from_db()
            self.assertEqual(first.base_amount, Money(390000, "USD"))
            self.assertEqual(first.invoiced_amount, Money(390000, "USD"))

    def test_group_coverage_put_fails_when_any_part_verified(self):
        group_id = self._create_group_for_detail_tests(
            first_status=UserPayment.Status.VERIFIED
        )

        resp = self._client(self.finance).put(
            f"/api/v1/user-payment-groups/{group_id}",
            {
                "covered_months": [
                    {"year": self.today.year, "month_index": self.today.month}
                ],
            },
            format="json",
        )

        self.assertEqual(resp.status_code, 400, resp.content)

    def test_group_part_coverage_put_is_rejected(self):
        group_id = self._create_group_for_detail_tests()
        with schema_context(self.schema_name):
            part_id = (
                UserPaymentGroup.objects.get(id=group_id)
                .parts.order_by("id")
                .first()
                .id
            )

        resp = self._client(self.finance).put(
            f"/api/v1/user-payments/{part_id}",
            {
                "covered_months": [
                    {"year": self.today.year, "month_index": self.today.month}
                ],
            },
            format="json",
        )

        self.assertEqual(resp.status_code, 400, resp.content)

    def test_delete_payment_group_removes_group_and_all_parts(self):
        group_id = self._create_group_for_detail_tests()
        with schema_context(self.schema_name):
            part_ids = list(
                UserPaymentGroup.objects.get(id=group_id)
                .parts.order_by("id")
                .values_list("id", flat=True)
            )

        resp = self._client(self.finance).delete(
            f"/api/v1/user-payment-groups/{group_id}"
        )

        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.json()["data"]["id"], f"group-{group_id}")
        with schema_context(self.schema_name):
            self.assertFalse(UserPaymentGroup.objects.filter(id=group_id).exists())
            self.assertFalse(UserPayment.objects.filter(id__in=part_ids).exists())

    def test_delete_payment_group_forbidden_without_payment_record(self):
        group_id = self._create_group_for_detail_tests()
        with schema_context(self.schema_name):
            teacher = User.objects.create_user(
                email=f"tch-del-grp-{uuid4().hex[:6]}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )

        resp = self._client(teacher).delete(
            f"/api/v1/user-payment-groups/{group_id}"
        )

        self.assertEqual(resp.status_code, 403, resp.content)
        with schema_context(self.schema_name):
            self.assertTrue(UserPaymentGroup.objects.filter(id=group_id).exists())

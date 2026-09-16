import unittest
from datetime import date, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from djmoney.money import Money
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_finance.models import PaymentBank, PaymentMethod, UserPayment
from app_finance.tests.telegram_mixin import TelegramSignalTestMixin
from app_finance.ocr import (
    extract_cb,
    extract_cb_labeled_amount,
    extract_cb_transaction_id,
)
from app_finance.services import (
    detect_and_extract,
    extract_receiver_ss_text_data,
    preview_kpay_screenshot,
)
from app_finance.tests.test_cb_payment_ocr_fixtures import (
    CB_OCR_RESPONSE,
    CB_RECEIPT_INLINE_AMOUNT,
    CB_RECEIPT_TEXT_1,
    CB_RECEIPT_TEXT_2,
    KPAY_OCR_RESPONSE,
    KPAY_OCR_SPLIT_KS,
)
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class CbOcrExtractorTests(SimpleTestCase):
    def test_extract_cb_transaction_id_sample_receipts(self):
        self.assertEqual(
            extract_cb_transaction_id(CB_RECEIPT_TEXT_1),
            "FT26189161K4",
        )
        self.assertEqual(
            extract_cb_transaction_id(CB_RECEIPT_TEXT_2),
            "FT26131M13HZ",
        )

    def test_extract_cb_transaction_id_accepts_11_char_buffer(self):
        text = "Transaction ID FT26189161K"
        self.assertEqual(extract_cb_transaction_id(text), "FT26189161K")

    def test_extract_cb_labeled_amount_prefers_amount_not_fee(self):
        self.assertEqual(
            extract_cb_labeled_amount(CB_RECEIPT_INLINE_AMOUNT),
            165000.0,
        )

    def test_extract_cb_returns_txn_and_amount(self):
        result = extract_cb(CB_RECEIPT_INLINE_AMOUNT)
        self.assertEqual(result["transaction_id"], "FT26189161K4")
        self.assertEqual(result["amount"], [165000.0])

    def test_extract_cb_fallback_largest_number_when_label_missing(self):
        text = """
Transfer Complete!
165,000.00 MMK
Fee 41 MMK
Transaction ID FT26189161K4
""".strip()
        result = extract_cb(text)
        self.assertEqual(result["amount"], [165000.0])


class DetectAndExtractTests(SimpleTestCase):
    def test_detect_kpay_from_lines(self):
        result = detect_and_extract(KPAY_OCR_RESPONSE)
        self.assertEqual(result["bank"], "KPAY")
        self.assertEqual(result["transaction_id"], "12345678901234567890")
        self.assertEqual(result["amount"], [50000.0])

    def test_detect_cb_from_parsed_text(self):
        result = detect_and_extract(CB_OCR_RESPONSE)
        self.assertEqual(result["bank"], "CB")
        self.assertEqual(result["transaction_id"], "FT26189161K4")
        self.assertEqual(result["amount"], [165000.0])

    def test_kpay_split_ks_extracts_txn_and_amount(self):
        result = detect_and_extract(KPAY_OCR_SPLIT_KS)
        self.assertEqual(result["bank"], "KPAY")
        self.assertEqual(result["transaction_id"], "01004244071344917047")
        self.assertEqual(result["amount"], [260000.0])

    def test_kpay_amount_without_ks_token_does_not_extract(self):
        result = detect_and_extract(
            {
                "ParsedResults": [
                    {
                        "ParsedText": "01004244071344917047\n+260,000.00",
                        "TextOverlay": {
                            "Lines": [
                                {"LineText": "01004244071344917047"},
                                {"LineText": "+260,000.00"},
                            ]
                        },
                    }
                ]
            }
        )
        self.assertIsNone(result["bank"])
        self.assertEqual(result["amount"], [])

    def test_kpay_wins_when_both_patterns_present(self):
        mixed = {
            "ParsedResults": [
                {
                    "ParsedText": "12345678901234567890 FT26189161K4",
                    "TextOverlay": {
                        "Lines": [
                            {"LineText": "12345678901234567890"},
                            {"LineText": "50,000.00 ks"},
                        ]
                    },
                }
            ]
        }
        result = detect_and_extract(mixed)
        self.assertEqual(result["bank"], "KPAY")

    def test_unrecognized_returns_empty_amount(self):
        result = detect_and_extract(
            {
                "ParsedResults": [
                    {
                        "ParsedText": "Transfer Complete!",
                        "TextOverlay": {"Lines": []},
                    }
                ]
            }
        )
        self.assertIsNone(result["bank"])
        self.assertEqual(result["amount"], [])


class PreviewPaymentScreenshotTests(SimpleTestCase):
    @patch("app_finance.services.suggest_payment_method", return_value=None)
    @patch("app_finance.services.UserPayment.objects.filter")
    @patch("app_finance.services.image_file_to_text")
    def test_preview_cb_screenshot(self, mock_ocr, mock_filter, _mock_suggest):
        mock_ocr.return_value = CB_OCR_RESPONSE
        mock_filter.return_value.first.return_value = None
        result = preview_kpay_screenshot(b"fake", filename="cb.jpg")
        self.assertTrue(result["ok"])
        self.assertEqual(result["transaction_id"], "FT26189161K4")
        self.assertEqual(result["parsed_amount"], 165000.0)
        self.assertIsNone(result["date_on_screenshot"])


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class ExtractReceiverSsTextDataCbTests(TelegramSignalTestMixin, TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    @patch("app_finance.services.image_to_text")
    def test_cb_screenshot_sets_pending_verification(self, mock_ocr):
        mock_ocr.return_value = CB_OCR_RESPONSE
        suffix = uuid4().hex[:6]
        today = timezone.localdate()
        with schema_context(self.schema_name):
            seed_rbac()
            finance = User.objects.create_user(
                email=f"fin-cb-{suffix}@example.com",
                password="x",
                name="Finance CB",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            student = User.objects.create_user(
                email=f"stu-cb-{suffix}@example.com",
                password="x",
                name="Student CB",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.create(name=f"Cat cb {suffix}")
            prog = Program.objects.create(
                name=f"P cb {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            course = Course.objects.create(
                title=f"CB Course {suffix}",
                category=cat,
                program=prog,
                start_date=today,
                end_date=today + timedelta(days=30),
            )
            UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            method = PaymentMethod.objects.create(
                name=f"CB {suffix}",
                payment_bank=PaymentBank.CB,
            )
            up = UserPayment.objects.create(
                user=student,
                course=course,
                payment_method=method,
                screenshot="payments/test-cb.jpg",
                status=UserPayment.Status.AWAITING_EXTRACTION,
            )
            payment_id = up.id

        extract_receiver_ss_text_data(payment_id, self.schema_name)

        with schema_context(self.schema_name):
            up.refresh_from_db()
            self.assertEqual(up.transaction_id, "FT26189161K4")
            self.assertEqual(up.parsed_amount, Money(165000, "USD"))
            self.assertEqual(up.status, UserPayment.Status.PENDING_VERIFICATION)

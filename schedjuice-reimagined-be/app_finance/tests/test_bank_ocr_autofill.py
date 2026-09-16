import unittest
from datetime import date
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_finance.models import PaymentBank, PaymentMethod
from app_finance.ocr import (
    extract_aya_amount,
    extract_kbz_amount,
    looks_like_kbz,
)
from app_finance.payment_method_matching import suggest_payment_method
from app_finance.services import detect_and_extract, preview_kpay_screenshot
from app_finance.tests.test_bank_ocr_autofill_fixtures import (
    AYA_OCR_RESPONSE,
    AYA_RECEIPT_97500_TEXT,
    AYA_RECEIPT_TEXT,
    CB_OCR_NO_AMOUNT,
    KBZ_FAST_TRANSFER_TEXT,
    KBZ_INTERNAL_TRANSFER_TEXT,
    KBZ_OCR_RESPONSE,
    KPAY_OCR_WITH_15_DIGIT,
)
from app_finance.tests.test_cb_payment_ocr_fixtures import (
    CB_OCR_RESPONSE,
    KPAY_OCR_RESPONSE,
)
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class KbzAyaExtractorTests(SimpleTestCase):
    def test_extract_kbz_amount_normalizes_thousands(self):
        self.assertEqual(extract_kbz_amount("Amount\nMMK 165,000.00"), 165000.0)
        self.assertEqual(
            extract_kbz_amount(KBZ_FAST_TRANSFER_TEXT),
            967750.0,
        )

    def test_extract_kbz_amount_ignores_long_reference_after_mmk(self):
        self.assertIsNone(extract_kbz_amount("MMK\n267969850494"))

    def test_extract_aya_amount_picks_largest_over_fee(self):
        self.assertEqual(extract_aya_amount(AYA_RECEIPT_TEXT), 165000.0)
        self.assertEqual(extract_aya_amount(AYA_RECEIPT_97500_TEXT), 97500.0)

    def test_looks_like_kbz_detects_15_digit_reference(self):
        self.assertTrue(looks_like_kbz(KBZ_INTERNAL_TRANSFER_TEXT))
        self.assertFalse(looks_like_kbz("12345678901234567890"))


class DetectAndExtractBankTests(SimpleTestCase):
    def test_detect_kbz_from_internal_transfer(self):
        result = detect_and_extract(KBZ_OCR_RESPONSE)
        self.assertEqual(result["bank"], "KBZ")
        self.assertEqual(result["transaction_id"], "155259692209166")
        self.assertEqual(result["amount"], [165000.0])

    def test_detect_aya_from_receipt(self):
        result = detect_and_extract(AYA_OCR_RESPONSE)
        self.assertEqual(result["bank"], "AYA")
        self.assertIsNone(result["transaction_id"])
        self.assertEqual(result["amount"], [165000.0])

    def test_kpay_20_digit_not_classified_as_kbz(self):
        result = detect_and_extract(KPAY_OCR_RESPONSE)
        self.assertEqual(result["bank"], "KPAY")

    def test_cb_with_txn_id_not_reclassified_as_aya(self):
        result = detect_and_extract(CB_OCR_RESPONSE)
        self.assertEqual(result["bank"], "CB")

    def test_cb_with_txn_id_stays_cb_not_aya(self):
        result = detect_and_extract(CB_OCR_NO_AMOUNT)
        self.assertEqual(result["bank"], "CB")
        self.assertEqual(result["transaction_id"], "FT26211XJPF8")

    def test_kpay_with_20_digit_wins_over_15_digit_reference(self):
        result = detect_and_extract(KPAY_OCR_WITH_15_DIGIT)
        self.assertEqual(result["bank"], "KPAY")


class PreviewAmountOnlyTests(SimpleTestCase):
    @patch("app_finance.services.suggest_payment_method", return_value=None)
    @patch("app_finance.services.UserPayment.objects.filter")
    @patch("app_finance.services.image_file_to_text")
    def test_preview_kbz_amount_only_ok(self, mock_ocr, mock_filter, _mock_suggest):
        mock_ocr.return_value = KBZ_OCR_RESPONSE
        mock_filter.return_value.first.return_value = None
        result = preview_kpay_screenshot(b"fake", filename="kbz.jpg")
        self.assertTrue(result["ok"])
        self.assertEqual(result["transaction_id"], "155259692209166")
        self.assertEqual(result["parsed_amount"], 165000.0)
        self.assertEqual(result["bank"], "KBZ")


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class SuggestPaymentMethodTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_single_method_of_bank_wins_without_name_match(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            method = PaymentMethod.objects.create(
                name=f"Only KBZ {suffix}",
                payment_bank=PaymentBank.KBZ,
            )
            result = suggest_payment_method("KBZ", "some unrelated text")
            self.assertEqual(result, method.id)

    def test_name_match_selects_one_of_many_kpay(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            other = PaymentMethod.objects.create(
                name=f"Other {suffix}",
                payment_bank=PaymentBank.KPAY,
            )
            target_name = f"Aung Tun Tun {suffix}"
            target = PaymentMethod.objects.create(
                name=target_name,
                payment_bank=PaymentBank.KPAY,
            )
            text = f"Transfer To\nU {target_name.upper()} (******1571)"
            result = suggest_payment_method("KPAY", text)
            self.assertEqual(result, target.id)
            self.assertNotEqual(result, other.id)

    def test_two_name_matches_returns_none(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            PaymentMethod.objects.create(
                name=f"Aung Tun Tun A {suffix}",
                payment_bank=PaymentBank.KPAY,
            )
            PaymentMethod.objects.create(
                name=f"Aung Tun Tun B {suffix}",
                payment_bank=PaymentBank.KPAY,
            )
            text = "Beneficiary\nU AUNG TUN TUN"
            self.assertIsNone(suggest_payment_method("KPAY", text))

    def test_last4_match_when_name_misses(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            target = PaymentMethod.objects.create(
                name=f"Acct {suffix}",
                payment_bank=PaymentBank.KPAY,
                bank_account_number="09123451571",
            )
            PaymentMethod.objects.create(
                name=f"Other {suffix}",
                payment_bank=PaymentBank.KPAY,
                bank_account_number="09123459999",
            )
            text = "Transfer To U SOMEONE (******1571)"
            self.assertEqual(suggest_payment_method("KPAY", text), target.id)

    def test_kbz_never_selects_kpay_method(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            kpay = PaymentMethod.objects.create(
                name=f"KPay only {suffix}",
                payment_bank=PaymentBank.KPAY,
            )
            result = suggest_payment_method("KBZ", KBZ_INTERNAL_TRANSFER_TEXT)
            self.assertNotEqual(result, kpay.id)

    def test_unknown_bank_returns_none(self):
        self.assertIsNone(suggest_payment_method(None, "text"))
        self.assertIsNone(suggest_payment_method("YOMA", "text"))

    def test_retired_method_is_not_suggested(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            PaymentMethod.objects.create(
                name=f"Retired only KBZ {suffix}",
                payment_bank=PaymentBank.KBZ,
                is_retired=True,
            )
            self.assertIsNone(suggest_payment_method("KBZ", "some unrelated text"))


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class OcrAmountOnlyEndpointTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(cls.schema_name):
            seed_rbac()
            cls.finance = User.objects.create_user(
                email=f"fin-kbz-{uuid4().hex[:6]}@example.com",
                password="x",
                name="Finance KBZ",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )

    def _client(self) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=self.finance)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    @patch("app_finance.views.preview_kpay_screenshot", create=True)
    def test_amount_only_preview_returns_200(self, mock_preview):
        mock_preview.return_value = {
            "ok": True,
            "bank": "KBZ",
            "transaction_id": None,
            "parsed_amount": 165000.0,
            "date_on_screenshot": None,
            "duplicate_of_payment_id": None,
            "suggested_payment_method_id": 42,
            "json_ocr_data": {},
        }
        from django.core.files.uploadedfile import SimpleUploadedFile

        resp = self._client().post(
            "/api/v1/ocr-payment-screenshot",
            {
                "screenshot": SimpleUploadedFile(
                    "kbz.jpg", b"fake", content_type="image/jpeg"
                )
            },
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.data.get("data", resp.data)
        self.assertTrue(data["ok"])
        self.assertEqual(data["parsed_amount"], 165000.0)
        self.assertEqual(data["suggested_payment_method_id"], 42)

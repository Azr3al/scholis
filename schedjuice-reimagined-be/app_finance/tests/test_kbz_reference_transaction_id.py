from django.test import SimpleTestCase

from app_finance.ocr import extract_kbz, extract_kbz_reference_number
from app_finance.tests.test_bank_ocr_autofill_fixtures import (
    KBZ_FAST_TRANSFER_TEXT,
    KBZ_INTERNAL_TRANSFER_TEXT,
)


class KbzReferenceTransactionIdTests(SimpleTestCase):
    def test_extract_reference_from_labeled_text(self):
        text = (
            "Transaction with reference number 123690237910701 is in Accepted state."
        )
        self.assertEqual(extract_kbz_reference_number(text), "123690237910701")

    def test_extract_kbz_returns_reference_as_transaction_id(self):
        result = extract_kbz(KBZ_INTERNAL_TRANSFER_TEXT)
        self.assertEqual(result["transaction_id"], "155259692209166")

    def test_fast_transfer_fixture_reference(self):
        result = extract_kbz(KBZ_FAST_TRANSFER_TEXT)
        self.assertEqual(result["transaction_id"], "528195402100099")

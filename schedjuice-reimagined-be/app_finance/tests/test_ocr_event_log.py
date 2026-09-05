import unittest
from datetime import date
from decimal import Decimal
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.models import OcrExtractionEvent
from app_finance.ocr_analytics_reporting import build_ocr_analytics
from app_finance.ocr_event_log import (
    amounts_match,
    normalize_ocr_amount,
    record_ocr_extraction_event,
    resolve_ocr_correctness_on_create,
    resolve_ocr_correctness_on_payment_update,
    transaction_ids_match,
)
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class OcrEventLogUnitTests(TestCase):
    def test_normalize_ocr_amount_strips_commas(self):
        self.assertEqual(normalize_ocr_amount("175,000.00"), Decimal("175000.00"))

    def test_amounts_match_within_precision(self):
        self.assertTrue(amounts_match(Decimal("50000"), Decimal("50000.0000")))

    def test_transaction_ids_match_strips_whitespace(self):
        self.assertTrue(transaction_ids_match(" abc ", "abc"))


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class OcrExtractionEventModelTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)

    def test_record_ocr_extraction_event(self):
        event_id = str(uuid4())
        record_ocr_extraction_event(
            event_id=event_id,
            schema_name=self.schema_name,
            source=OcrExtractionEvent.Source.IMAGE_UPLOAD,
            trigger=OcrExtractionEvent.Trigger.PREVIEW,
            outcome=OcrExtractionEvent.Outcome.SUCCESS,
            extracted_transaction_id="12345678901234567890",
            extracted_amount=Decimal("50000"),
            extracted_bank="KPAY",
        )
        with schema_context(get_public_schema_name()):
            row = OcrExtractionEvent.objects.get(id=event_id)
            self.assertEqual(row.extracted_bank, "KPAY")
            self.assertEqual(row.correctness, OcrExtractionEvent.Correctness.PENDING)

    def test_resolve_ocr_correctness_on_create_unchanged(self):
        event_id = str(uuid4())
        record_ocr_extraction_event(
            event_id=event_id,
            schema_name=self.schema_name,
            source=OcrExtractionEvent.Source.IMAGE_UPLOAD,
            trigger=OcrExtractionEvent.Trigger.PREVIEW,
            outcome=OcrExtractionEvent.Outcome.SUCCESS,
            extracted_transaction_id="12345678901234567890",
            extracted_amount=Decimal("50000"),
        )
        resolve_ocr_correctness_on_create(
            event_id=event_id,
            schema_name=self.schema_name,
            user_payment_id=999,
            submitted_transaction_id="12345678901234567890",
            submitted_amount=Decimal("50000"),
        )
        with schema_context(get_public_schema_name()):
            row = OcrExtractionEvent.objects.get(id=event_id)
            self.assertEqual(row.correctness, OcrExtractionEvent.Correctness.CORRECT)

    def test_resolve_ocr_correctness_on_create_edited(self):
        event_id = str(uuid4())
        record_ocr_extraction_event(
            event_id=event_id,
            schema_name=self.schema_name,
            source=OcrExtractionEvent.Source.IMAGE_UPLOAD,
            trigger=OcrExtractionEvent.Trigger.PREVIEW,
            outcome=OcrExtractionEvent.Outcome.SUCCESS,
            extracted_transaction_id="12345678901234567890",
            extracted_amount=Decimal("50000"),
        )
        resolve_ocr_correctness_on_create(
            event_id=event_id,
            schema_name=self.schema_name,
            user_payment_id=999,
            submitted_transaction_id="12345678901234567890",
            submitted_amount=Decimal("51000"),
        )
        with schema_context(get_public_schema_name()):
            row = OcrExtractionEvent.objects.get(id=event_id)
            self.assertEqual(row.correctness, OcrExtractionEvent.Correctness.CORRECTED)

    def test_resolve_ocr_correctness_on_payment_update_verified(self):
        event_id = str(uuid4())
        record_ocr_extraction_event(
            event_id=event_id,
            schema_name=self.schema_name,
            source=OcrExtractionEvent.Source.MICROSOFT_PAYMENT_ASSIGNMENT,
            trigger=None,
            outcome=OcrExtractionEvent.Outcome.SUCCESS,
            extracted_transaction_id="12345678901234567890",
            extracted_amount=Decimal("50000"),
        )
        resolve_ocr_correctness_on_payment_update(
            event_id=event_id,
            transaction_id="12345678901234567890",
            parsed_amount=Decimal("50000"),
            status="verified",
        )
        with schema_context(get_public_schema_name()):
            row = OcrExtractionEvent.objects.get(id=event_id)
            self.assertEqual(row.correctness, OcrExtractionEvent.Correctness.CORRECT)

    def test_build_ocr_analytics_summary(self):
        event_id = str(uuid4())
        record_ocr_extraction_event(
            event_id=event_id,
            schema_name=self.schema_name,
            source=OcrExtractionEvent.Source.IMAGE_UPLOAD,
            trigger=OcrExtractionEvent.Trigger.PREVIEW,
            outcome=OcrExtractionEvent.Outcome.SUCCESS,
            extracted_transaction_id="12345678901234567890",
            extracted_amount=Decimal("50000"),
        )
        today = date.today()
        month_start = date(today.year, today.month, 1)
        payload = build_ocr_analytics(month=month_start)
        self.assertGreaterEqual(payload["summary"]["total"], 1)

    def test_build_ocr_analytics_query_budget(self):
        today = date.today()
        month_start = date(today.year, today.month, 1)
        with self.assertNumQueries(5):
            build_ocr_analytics(month=month_start)

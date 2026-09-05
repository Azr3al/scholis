"""Async OCR extraction event logging (public schema)."""

from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from uuid import UUID

from tenant_schemas.utils import get_public_schema_name, schema_context
from utilitas.async_tasks import django_q_task

from app_ai.models import OcrExtractionEvent
from app_organization.models import Organization

logger = logging.getLogger(__name__)


def normalize_ocr_amount(value) -> Decimal | None:
    if value is None or value == "":
        return None
    if isinstance(value, Decimal):
        return value
    text = str(value).replace(",", "").strip()
    if not text:
        return None
    try:
        return Decimal(text)
    except (InvalidOperation, ValueError):
        return None


def amounts_match(left, right) -> bool:
    a = normalize_ocr_amount(left)
    b = normalize_ocr_amount(right)
    if a is None or b is None:
        return a is None and b is None
    return a.quantize(Decimal("0.0001")) == b.quantize(Decimal("0.0001"))


def transaction_ids_match(left, right) -> bool:
    if left is None or right is None:
        return (left or "") == (right or "")
    return str(left).strip() == str(right).strip()


def outcome_from_extracted(transaction_id, amount) -> str:
    if transaction_id and amount is not None:
        return OcrExtractionEvent.Outcome.SUCCESS
    if transaction_id or amount is not None:
        return OcrExtractionEvent.Outcome.PARTIAL
    return OcrExtractionEvent.Outcome.ERROR


def _resolve_tenant(schema_name: str) -> Organization | None:
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=schema_name).first()


def enqueue_ocr_extraction_event(**payload) -> None:
    record_ocr_extraction_event.delay(**payload)


@django_q_task
def record_ocr_extraction_event(
    *,
    event_id: str,
    schema_name: str,
    source: str,
    trigger: str | None,
    outcome: str,
    extracted_transaction_id: str = "",
    extracted_amount=None,
    extracted_bank: str = "",
    ocr_endpoint: str = "",
    user_payment_id: int | None = None,
    correctness: str | None = None,
) -> None:
    try:
        tenant = _resolve_tenant(schema_name)
        if tenant is None:
            logger.warning("ocr_event_skip_no_tenant event_id=%s", event_id)
            return
        with schema_context(get_public_schema_name()):
            OcrExtractionEvent.objects.update_or_create(
                id=UUID(event_id),
                defaults={
                    "tenant": tenant,
                    "source": source,
                    "trigger": trigger or None,
                    "outcome": outcome,
                    "extracted_transaction_id": extracted_transaction_id or "",
                    "extracted_amount": normalize_ocr_amount(extracted_amount),
                    "extracted_bank": extracted_bank or "",
                    "ocr_endpoint": ocr_endpoint or "",
                    "user_payment_id": user_payment_id,
                    "user_payment_schema": schema_name if user_payment_id else "",
                    "correctness": correctness
                    or OcrExtractionEvent.Correctness.PENDING,
                },
            )
    except Exception:
        logger.exception("ocr_event_record_failed event_id=%s", event_id)


@django_q_task
def resolve_ocr_correctness_on_create(
    *,
    event_id: str,
    schema_name: str,
    user_payment_id: int,
    submitted_transaction_id: str | None,
    submitted_amount,
) -> None:
    try:
        with schema_context(get_public_schema_name()):
            event = OcrExtractionEvent.objects.filter(id=UUID(event_id)).first()
        if event is None:
            return
        unchanged = transaction_ids_match(
            event.extracted_transaction_id, submitted_transaction_id
        ) and amounts_match(event.extracted_amount, submitted_amount)
        correctness = (
            OcrExtractionEvent.Correctness.CORRECT
            if unchanged
            else OcrExtractionEvent.Correctness.CORRECTED
        )
        with schema_context(get_public_schema_name()):
            OcrExtractionEvent.objects.filter(id=event.id).update(
                user_payment_id=user_payment_id,
                user_payment_schema=schema_name,
                correctness=correctness,
            )
        from app_finance.models import UserPayment

        with schema_context(schema_name):
            UserPayment.objects.filter(id=user_payment_id).update(
                ocr_event_id=event.id
            )
    except Exception:
        logger.exception("ocr_correctness_create_failed event_id=%s", event_id)


@django_q_task
def resolve_ocr_correctness_on_payment_update(
    *,
    event_id: str,
    transaction_id: str | None,
    parsed_amount,
    status: str,
) -> None:
    try:
        with schema_context(get_public_schema_name()):
            event = OcrExtractionEvent.objects.filter(id=UUID(event_id)).first()
        if event is None:
            return
        if event.correctness == OcrExtractionEvent.Correctness.FAILED_EXTRACTION:
            return
        values_differ = not (
            transaction_ids_match(event.extracted_transaction_id, transaction_id)
            and amounts_match(event.extracted_amount, parsed_amount)
        )
        if values_differ:
            new_correctness = OcrExtractionEvent.Correctness.CORRECTED
        elif status == "verified":
            new_correctness = OcrExtractionEvent.Correctness.CORRECT
        else:
            new_correctness = event.correctness
        with schema_context(get_public_schema_name()):
            OcrExtractionEvent.objects.filter(id=event.id).update(
                correctness=new_correctness
            )
    except Exception:
        logger.exception("ocr_correctness_update_failed event_id=%s", event_id)


def schedule_ocr_payment_update_resolution(payment) -> None:
    if not payment.ocr_event_id:
        return
    parsed_amount = None
    if payment.parsed_amount is not None:
        parsed_amount = payment.parsed_amount.amount
    resolve_ocr_correctness_on_payment_update.delay(
        event_id=str(payment.ocr_event_id),
        transaction_id=payment.transaction_id,
        parsed_amount=parsed_amount,
        status=payment.status,
    )

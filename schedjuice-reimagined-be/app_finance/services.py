import logging
import re
from uuid import UUID, uuid4

from django.db import transaction

from app_finance.models import StaffPayment, UserPayment, UserPaymentGroup, ReceiverSideScreenshot
from app_finance.ocr import extract_aya, extract_cb, extract_kbz, looks_like_kbz, normalize_number
from app_finance.payment_method_matching import suggest_payment_method
from app_finance.ocr_client import (
    OcrError,
    image_file_to_text,
    image_to_text,
    image_to_text_v2,
)
from tenant_schemas.utils import schema_context
from djmoney.money import Money
from app_finance.ocr_event_log import (
    enqueue_ocr_extraction_event,
    outcome_from_extracted,
)
from utilitas.async_tasks import django_q_task

logger = logging.getLogger(__name__)


_KS_TOKEN = re.compile(r"^\(?ks\)?$", re.IGNORECASE)


def _is_kpay_ks_token(text: str) -> bool:
    return bool(_KS_TOKEN.match((text or "").strip()))


def _parse_kpay_amount(line_text: str) -> float | None:
    cleaned = re.sub(
        r"\(?\s*ks\s*\)?$", "", (line_text or "").strip(), flags=re.IGNORECASE
    ).strip()
    cleaned = cleaned.replace("+", "").replace("-", "")
    if not cleaned:
        return None
    try:
        return abs(normalize_number(cleaned))
    except ValueError:
        return None


def extract_kpay(lines):
    extracted_lines = {
        "transaction_id": None,
        "amount": [],
    }
    for index, row in enumerate(lines):
        line_text: str = row["LineText"]
        if re.match(r"\b\d{20}\b", line_text):
            extracted_lines["transaction_id"] = line_text
            continue
        next_text = None
        if index + 1 < len(lines):
            next_text = lines[index + 1].get("LineText")
        is_amount = line_text.lower().endswith("ks") or (
            next_text is not None
            and _is_kpay_ks_token(next_text)
            and re.search(r"[\d.,]", line_text)
        )
        if not is_amount:
            continue
        parsed = _parse_kpay_amount(line_text)
        if parsed is not None:
            logger.debug("KPAY amount line: %s", line_text)
            extracted_lines["amount"].append(parsed)
    return extracted_lines


@transaction.atomic
def mark_receiver_side_screenshots_matched(
    transaction_id: str, user_payment: UserPayment, *, actor=None
):
    """Mark the first unmatched ReceiverSideScreenshot with this transaction_id as matched and link to user_payment.
    When matched, sets user_payment.status to VERIFIED.
    If actor is provided and verified_by is unset, records verified_by."""
    if not transaction_id or not user_payment:
        return

    rss = ReceiverSideScreenshot.objects.filter(
        transaction_id=transaction_id, is_matched=False
    ).first()
    if not rss:
        return

    rss.is_matched = True
    rss.user_payment = user_payment
    rss.save()

    def _verify_payment_row(payment: UserPayment) -> None:
        payment.status = UserPayment.Status.VERIFIED
        update_fields = ["status"]
        if actor is not None and payment.verified_by_id is None:
            payment.verified_by = actor
            update_fields.append("verified_by")
        payment.save(update_fields=update_fields)

    _verify_payment_row(user_payment)

    group = user_payment.group
    if group is None:
        return

    sibling_qs = UserPayment.objects.filter(
        group=group,
        transaction_id=transaction_id,
    ).exclude(id=user_payment.id)

    for sibling in sibling_qs:
        _verify_payment_row(sibling)

    batch_key = group.shared_transaction_key
    if batch_key:
        batch_sibling_qs = UserPayment.objects.filter(
            transaction_id=transaction_id,
            group__shared_transaction_key=batch_key,
        ).exclude(group=group)
        for sibling in batch_sibling_qs:
            _verify_payment_row(sibling)


def detect_and_extract(raw_ocr_response: dict) -> dict | None:
    parsed_results = raw_ocr_response.get("ParsedResults") or []
    if not parsed_results:
        return None

    first = parsed_results[0]
    lines = (first.get("TextOverlay") or {}).get("Lines") or []
    parsed_text = first.get("ParsedText") or ""

    def _result(bank, transaction_id, amount, json_ocr_data):
        return {
            "bank": bank,
            "transaction_id": transaction_id,
            "amount": amount,
            "json_ocr_data": json_ocr_data,
            "parsed_text": parsed_text,
        }

    if lines:
        kpay_data = extract_kpay(lines)
        if kpay_data["transaction_id"] and kpay_data["amount"]:
            return _result(
                "KPAY", kpay_data["transaction_id"], kpay_data["amount"], kpay_data
            )

    if re.search(r"\b\d{20}\b", parsed_text):
        kpay_data = extract_kpay(
            [{"LineText": line} for line in parsed_text.splitlines()]
        )
        if kpay_data["transaction_id"] and kpay_data["amount"]:
            return _result(
                "KPAY", kpay_data["transaction_id"], kpay_data["amount"], kpay_data
            )

    cb_data = extract_cb(parsed_text)
    if cb_data["transaction_id"]:
        return _result(
            "CB", cb_data["transaction_id"], cb_data["amount"], cb_data
        )

    if looks_like_kbz(parsed_text):
        kbz_data = extract_kbz(parsed_text)
        if kbz_data["amount"]:
            return _result("KBZ", None, kbz_data["amount"], kbz_data)

    aya_data = extract_aya(parsed_text)
    if aya_data["amount"]:
        return _result("AYA", None, aya_data["amount"], aya_data)

    return _result(None, None, [], {"parsed_text": parsed_text, "lines": lines})


def preview_kpay_screenshot(
    file_obj,
    filename: str = "screenshot.jpg",
    *,
    payment_kind: str = "student",
    ocr_event_id: str | None = None,
    schema_name: str | None = None,
) -> dict:
    """OCR a payment screenshot without creating or updating a payment row."""
    raw_texts = None
    try:
        raw_texts = image_file_to_text(file_obj, filename=filename)
    except OcrError as exc:
        logger.exception("OCR request failed for payment screenshot preview: %s", exc)
        if ocr_event_id and schema_name:
            enqueue_ocr_extraction_event(
                event_id=ocr_event_id,
                schema_name=schema_name,
                source="image_upload",
                trigger="preview",
                outcome="error",
                correctness="failed_extraction",
            )
        return {
            "ok": False,
            "error": str(exc),
            "bank": None,
            "transaction_id": None,
            "parsed_amount": None,
            "date_on_screenshot": None,
            "duplicate_of_payment_id": None,
            "suggested_payment_method_id": None,
            "json_ocr_data": raw_texts,
        }

    detected = detect_and_extract(raw_texts)
    if detected is None:
        if ocr_event_id and schema_name:
            enqueue_ocr_extraction_event(
                event_id=ocr_event_id,
                schema_name=schema_name,
                source="image_upload",
                trigger="preview",
                outcome="error",
                correctness="failed_extraction",
            )
        return {
            "ok": False,
            "error": "Could not extract payment details.",
            "bank": None,
            "transaction_id": None,
            "parsed_amount": None,
            "date_on_screenshot": None,
            "duplicate_of_payment_id": None,
            "suggested_payment_method_id": None,
            "json_ocr_data": raw_texts,
        }

    transaction_id = detected["transaction_id"]
    amounts = detected["amount"]
    bank = detected.get("bank")
    duplicate = None
    if transaction_id:
        if payment_kind == "staff":
            duplicate = StaffPayment.objects.filter(
                transaction_id=transaction_id
            ).first()
        else:
            duplicate = UserPayment.objects.filter(
                transaction_id=transaction_id
            ).first()
    extracted = bool(transaction_id or amounts)
    parsed_amount = amounts[0] if amounts else None
    if ocr_event_id and schema_name:
        enqueue_ocr_extraction_event(
            event_id=ocr_event_id,
            schema_name=schema_name,
            source="image_upload",
            trigger="preview",
            outcome=outcome_from_extracted(transaction_id, parsed_amount),
            extracted_transaction_id=transaction_id or "",
            extracted_amount=parsed_amount,
            extracted_bank=bank or "",
        )
    return {
        "ok": extracted,
        "bank": bank,
        "transaction_id": transaction_id,
        "parsed_amount": amounts[0] if amounts else None,
        "date_on_screenshot": None,
        "duplicate_of_payment_id": duplicate.id if duplicate else None,
        "suggested_payment_method_id": suggest_payment_method(
            bank, detected.get("parsed_text")
        ),
        "json_ocr_data": detected["json_ocr_data"],
        **({} if extracted else {"error": "Could not extract payment details."}),
    }


@django_q_task
def extract_receiver_ss_text_data(ss_id: int, schema_name: str):
    logger.info("Extracting text data from user-provided screenshot: %s", ss_id)
    with schema_context(schema_name):
        ss_obj = UserPayment.objects.select_related("group").get(id=ss_id)
        event_id = str(uuid4())
        source = (
            "microsoft_payment_assignment"
            if ss_obj.microsoft_submission_id
            else "image_upload"
        )
        trigger = None if ss_obj.microsoft_submission_id else "async"
        raw_texts = None
        try:
            raw_texts = image_to_text(ss_obj.screenshot.url)
            detected = detect_and_extract(raw_texts)
            if (
                detected is None
                or not detected.get("transaction_id")
                or not detected.get("amount")
            ):
                enqueue_ocr_extraction_event(
                    event_id=event_id,
                    schema_name=schema_name,
                    source=source,
                    trigger=trigger,
                    outcome="error",
                    extracted_transaction_id=(detected or {}).get("transaction_id")
                    or "",
                    extracted_amount=(
                        (detected or {}).get("amount") or [None]
                    )[0],
                    extracted_bank=(detected or {}).get("bank") or "",
                    user_payment_id=ss_obj.id,
                    correctness="failed_extraction",
                )
                ss_obj.status = UserPayment.Status.CANNOT_EXTRACT
                ss_obj.ocr_event_id = UUID(event_id)
                if raw_texts is not None:
                    ss_obj.json_ocr_data = raw_texts
                ss_obj.save()
                return

            text_data = detected["json_ocr_data"]
            transaction_id = detected["transaction_id"]
            parsed_amount = text_data["amount"][0]
            enqueue_ocr_extraction_event(
                event_id=event_id,
                schema_name=schema_name,
                source=source,
                trigger=trigger,
                outcome=outcome_from_extracted(transaction_id, parsed_amount),
                extracted_transaction_id=transaction_id or "",
                extracted_amount=parsed_amount,
                extracted_bank=detected.get("bank") or "",
                user_payment_id=ss_obj.id,
            )
            ss_obj.ocr_event_id = UUID(event_id)
            existing_qs = UserPayment.objects.filter(
                transaction_id=transaction_id
            ).exclude(id=ss_obj.id)
            if ss_obj.group_id is not None:
                # Rows in one group intentionally share a screenshot's transaction id.
                existing_qs = existing_qs.exclude(group_id=ss_obj.group_id)
                batch_key = ss_obj.group.shared_transaction_key
                if batch_key:
                    existing_qs = existing_qs.exclude(
                        group__shared_transaction_key=batch_key
                    )
            existing_ss = existing_qs.first()
            if existing_ss:
                ss_obj.status = UserPayment.Status.DUPLICATED
                ss_obj.transaction_id = text_data["transaction_id"]
                ss_obj.json_ocr_data = text_data
                ss_obj.parsed_amount = Money(
                    amount=(text_data["amount"][0]), currency="USD"
                )
                ss_obj.save()
                mark_receiver_side_screenshots_matched(transaction_id, existing_ss)
                return
            if len(text_data["amount"]) > 0:
                ss_obj.parsed_amount = Money(
                    amount=(text_data["amount"][0]), currency="USD"
                )
                ss_obj.status = UserPayment.Status.PENDING_VERIFICATION
                ss_obj.transaction_id = text_data["transaction_id"]
                ss_obj.json_ocr_data = text_data
                ss_obj.save()
                is_multi_course_part = (
                    ss_obj.group is not None
                    and ss_obj.group.group_kind
                    == UserPaymentGroup.GroupKind.MULTI_COURSE
                )
                if not is_multi_course_part:
                    mark_receiver_side_screenshots_matched(transaction_id, ss_obj)
            else:
                ss_obj.status = UserPayment.Status.CANNOT_EXTRACT
                ss_obj.save()
        except OcrError as exc:
            logger.exception(
                "OCR request failed for UserPayment %s: %s",
                ss_id,
                exc,
            )
            enqueue_ocr_extraction_event(
                event_id=event_id,
                schema_name=schema_name,
                source=source,
                trigger=trigger,
                outcome="error",
                user_payment_id=ss_obj.id,
                correctness="failed_extraction",
            )
            ss_obj.status = UserPayment.Status.CANNOT_EXTRACT
            ss_obj.ocr_event_id = UUID(event_id)
            ss_obj.save()
            return
        except Exception as exc:
            logger.exception(
                "Failed to extract OCR data for UserPayment %s: %s",
                ss_id,
                exc,
            )
            if raw_texts is not None:
                ss_obj.json_ocr_data = raw_texts
            ss_obj.status = UserPayment.Status.CANNOT_EXTRACT
            ss_obj.save()
            return

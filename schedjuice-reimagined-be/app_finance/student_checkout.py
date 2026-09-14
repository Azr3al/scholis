from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import transaction
from djmoney.money import Money

from app_finance import models
from app_finance.payment_group import _initial_status_for_part
from app_finance.payment_upload_date import stamp_payment_upload_date
from app_finance.serializers import StudentPaymentSubmitSerializer
from app_finance.services import (
    mark_receiver_side_screenshots_matched,
    schedule_user_payment_ocr_after_submit,
)
from app_finance.student_checkout_allocation import infer_checkout_allocations


class StudentCheckoutError(Exception):
    def __init__(self, code: str, message: str, errors: dict | None = None):
        self.code = code
        self.message = message
        self.errors = errors or {}


def parse_student_checkout_request(request) -> tuple[list[int], list[dict], dict]:
    errors: dict = {}
    try:
        payment_ids_count = int(request.data.get("payment_ids_count"))
    except (TypeError, ValueError):
        return [], [], {"payment_ids_count": "Must be an integer."}

    payment_ids: list[int] = []
    for index in range(payment_ids_count):
        raw = request.data.get(f"payment_id_{index}")
        try:
            payment_ids.append(int(raw))
        except (TypeError, ValueError):
            errors[f"payment_id_{index}"] = "Must be an integer."

    try:
        screenshots_count = int(request.data.get("screenshots_count"))
    except (TypeError, ValueError):
        return [], [], {"screenshots_count": "Must be an integer."}

    screenshots: list[dict] = []
    for index in range(screenshots_count):
        prefix = f"screenshot_{index}_"
        screenshot = request.FILES.get(f"{prefix}screenshot") or request.data.get(
            f"{prefix}screenshot"
        )
        if screenshot in (None, ""):
            errors[f"{prefix}screenshot"] = "Screenshot file is required."
            screenshot = None
        parsed_amount = request.data.get(f"{prefix}parsed_amount")
        screenshots.append(
            {
                "screenshot": screenshot,
                "parsed_amount": parsed_amount,
                "transaction_id": request.data.get(f"{prefix}transaction_id") or None,
                "date_on_screenshot": request.data.get(f"{prefix}date_on_screenshot")
                or None,
                "ocr_event_id": request.data.get(f"{prefix}ocr_event_id") or None,
                "suggested_payment_method_id": request.data.get(
                    f"{prefix}suggested_payment_method_id"
                )
                or request.data.get(f"{prefix}payment_method"),
            }
        )

    if errors:
        return [], [], errors
    return payment_ids, screenshots, {}


def _decimal_or_none(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, Money):
        return value.amount
    return Decimal(str(value))


def _money_or_none(value: Any) -> Money | None:
    amount = _decimal_or_none(value)
    if amount is None:
        return None
    return Money(amount, "USD")


def _resolve_payment_method(suggested_id: Any) -> models.PaymentMethod | None:
    if suggested_id in (None, ""):
        return None
    try:
        method_id = int(suggested_id)
    except (TypeError, ValueError):
        return None
    if method_id <= 0:
        return None
    return models.PaymentMethod.objects.filter(id=method_id, is_retired=False).first()


def _apply_screenshot_fields(
    payment: models.UserPayment,
    *,
    screenshot,
    shot: dict,
    parsed_amount: Decimal | None,
    group: models.UserPaymentGroup | None,
) -> None:
    part = {
        "screenshot": screenshot,
        "parsed_amount": parsed_amount,
        "transaction_id": shot.get("transaction_id") or None,
        "date_on_screenshot": shot.get("date_on_screenshot") or None,
    }
    payment.screenshot = screenshot
    if parsed_amount is not None:
        payment.parsed_amount = Money(parsed_amount, "USD")
    payment.transaction_id = part["transaction_id"]
    payment.date_on_screenshot = part["date_on_screenshot"]
    ocr_event_id = shot.get("ocr_event_id")
    if ocr_event_id:
        payment.ocr_event_id = ocr_event_id
    suggested_method = _resolve_payment_method(shot.get("suggested_payment_method_id"))
    if suggested_method is not None:
        payment.payment_method = suggested_method
    payment.status = _initial_status_for_part(part, group=group)
    stamp_payment_upload_date(payment)
    payment.save()


def _submit_single_legacy(
    *,
    actor,
    payment: models.UserPayment,
    shot: dict,
    tenant_schema: str,
    request,
) -> list[models.UserPayment]:
    data = {"screenshot": shot.get("screenshot")}
    for field in ("transaction_id", "date_on_screenshot"):
        if shot.get(field):
            data[field] = shot[field]
    parsed = _money_or_none(shot.get("parsed_amount"))
    if parsed is not None:
        data["parsed_amount"] = parsed
    if shot.get("ocr_event_id"):
        data["ocr_event_id"] = shot["ocr_event_id"]
    method = _resolve_payment_method(shot.get("suggested_payment_method_id"))
    if method is not None:
        data["payment_method"] = method

    serializer = StudentPaymentSubmitSerializer(
        payment,
        data=data,
        context={"request": request},
        partial=True,
    )
    if not serializer.is_valid():
        raise StudentCheckoutError(
            "validation_error",
            "validation_error",
            dict(serializer.errors),
        )
    saved = serializer.save()
    if saved.transaction_id:
        mark_receiver_side_screenshots_matched(
            saved.transaction_id, saved, actor=actor
        )
    schedule_user_payment_ocr_after_submit(
        saved,
        tenant_schema,
        ocr_event_id=shot.get("ocr_event_id"),
    )
    return [saved]


@transaction.atomic
def submit_student_checkout(
    *,
    actor,
    tenant_schema: str,
    payment_ids: list[int],
    screenshots: list[dict],
    request=None,
) -> list[models.UserPayment]:
    if not payment_ids:
        raise StudentCheckoutError(
            "validation_error",
            "No payments selected.",
            {"payment_ids": "Required."},
        )
    if not screenshots:
        raise StudentCheckoutError(
            "validation_error",
            "Screenshot required.",
            {"screenshot": "Required."},
        )
    if len(set(payment_ids)) != len(payment_ids):
        raise StudentCheckoutError(
            "validation_error",
            "Duplicate payment ids.",
            {"payment_ids": "Duplicate."},
        )

    payments_qs = (
        models.UserPayment.objects.select_for_update(of=("self",))
        .filter(id__in=payment_ids)
        .order_by("id")
    )
    payments_by_id = {payment.id: payment for payment in payments_qs}
    if len(payments_by_id) != len(payment_ids):
        raise StudentCheckoutError(
            "not_found",
            "UserPayment not found.",
            {"payment_ids": "Invalid."},
        )

    ordered_payments = [payments_by_id[pid] for pid in payment_ids]
    for payment in ordered_payments:
        if payment.user_id is None:
            raise StudentCheckoutError(
                "validation_error",
                "Invalid payment owner.",
                {"payment_ids": "Invalid."},
            )
        if actor is None or payment.user_id != actor.id:
            raise StudentCheckoutError(
                "forbidden",
                "You can only submit payments for your own account.",
                {},
            )
        if payment.status == models.UserPayment.Status.VERIFIED:
            raise StudentCheckoutError(
                "forbidden",
                "Verified payments cannot be changed.",
                {},
            )
        if payment.status != models.UserPayment.Status.PENDING_PAYMENT:
            raise StudentCheckoutError(
                "validation_error",
                "Only pending invoices can be checked out.",
                {"payment_ids": "Invalid status."},
            )

    if len(payment_ids) == 1 and len(screenshots) == 1:
        return _submit_single_legacy(
            actor=actor,
            payment=ordered_payments[0],
            shot=screenshots[0],
            tenant_schema=tenant_schema,
            request=request,
        )

    allocation_inputs = [
        {
            "id": payment.id,
            "invoiced_amount": (
                payment.invoiced_amount.amount
                if payment.invoiced_amount is not None
                else Decimal("0")
            ),
        }
        for payment in ordered_payments
    ]
    screenshot_inputs = [
        {
            "index": index,
            "parsed_amount": _decimal_or_none(shot.get("parsed_amount")),
        }
        for index, shot in enumerate(screenshots)
    ]
    allocations = infer_checkout_allocations(
        payments=allocation_inputs,
        screenshots=screenshot_inputs,
    )

    user = ordered_payments[0].user
    is_multi_course = len(payment_ids) >= 2
    is_split = len(payment_ids) == 1 and len(screenshots) >= 2
    template = ordered_payments[0]

    group: models.UserPaymentGroup | None = None
    if is_multi_course or is_split:
        group = models.UserPaymentGroup.objects.create(
            user=user,
            course=template.course if is_split else None,
            group_kind=(
                models.UserPaymentGroup.GroupKind.MULTI_COURSE
                if is_multi_course
                else models.UserPaymentGroup.GroupKind.SPLIT_SCREENSHOTS
            ),
            created_by=actor,
            issued_at=template.issued_at,
            billing_start_date=template.billing_start_date,
            billing_end_date=template.billing_end_date,
            is_installment=template.is_installment,
            installment_percent=template.installment_percent,
        )

    shots_by_index = {index: shot for index, shot in enumerate(screenshots)}
    saved_parts: list[models.UserPayment] = []
    seen_transaction_ids: set[str] = set()
    primary_updated = False

    for alloc in allocations:
        shot = shots_by_index[alloc["screenshot_index"]]
        screenshot_file = shot.get("screenshot")
        parsed_amount = alloc["amount"]
        payment_id = alloc["payment_id"]

        if is_split and primary_updated:
            sibling = models.UserPayment.objects.create(
                group=group,
                user=template.user,
                course=template.course,
                created_by=actor,
                issued_at=template.issued_at,
                billing_start_date=template.billing_start_date,
                billing_end_date=template.billing_end_date,
                is_installment=template.is_installment,
                installment_percent=template.installment_percent,
                invoiced_amount=template.invoiced_amount,
            )
            target = sibling
        else:
            target = payments_by_id[payment_id]
            if is_split:
                primary_updated = True
            target.group = group

        _apply_screenshot_fields(
            target,
            screenshot=screenshot_file,
            shot=shot,
            parsed_amount=parsed_amount,
            group=group,
        )
        saved_parts.append(target)

        tid = target.transaction_id
        if tid and tid not in seen_transaction_ids:
            seen_transaction_ids.add(tid)
            mark_receiver_side_screenshots_matched(tid, target, actor=actor)

    for part in saved_parts:
        schedule_user_payment_ocr_after_submit(
            part,
            tenant_schema,
            ocr_event_id=part.ocr_event_id,
        )

    return saved_parts

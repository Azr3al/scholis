from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from djmoney.money import Money

from app_finance import models
from app_finance.payment_receipt_number import ensure_receipts_for_payments


def _shares_one_bank_transaction(rows: list[models.UserPayment]) -> bool:
    """True when several course rows were paid by a single bank transaction."""
    if len(rows) < 2:
        return False
    groups = {row.group for row in rows}
    if len(groups) != 1:
        return False
    group = next(iter(groups))
    return (
        group is not None
        and group.group_kind == models.UserPaymentGroup.GroupKind.MULTI_COURSE
    )


def _parsed_total(rows: list[models.UserPayment]) -> Decimal:
    total = Decimal("0")
    for row in rows:
        if row.parsed_amount is not None:
            total += row.parsed_amount.amount
    return total


@transaction.atomic
def verify_screenshots_from_rows(*, data_list: list[dict], actor=None) -> None:
    unique_tids = {row["transaction_id"] for row in data_list}
    objs = list(
        models.UserPayment.objects.filter(
            transaction_id__in=unique_tids,
            status__in=[
                models.UserPayment.Status.PENDING_VERIFICATION,
                models.UserPayment.Status.AMOUNT_MISMATCH,
            ],
        ).select_related("group")
    )
    tid_to_payments: dict[str, list[models.UserPayment]] = {}
    for payment in objs:
        tid_to_payments.setdefault(payment.transaction_id, []).append(payment)
    tid_to_row = {row["transaction_id"]: row for row in data_list}

    assigned_user_payment_ids: set[int] = set()
    receiver_side_screenshots = []
    for row in data_list:
        tid = row["transaction_id"]
        candidates = tid_to_payments.get(tid) or []
        user_payment = candidates[0] if candidates else None
        if user_payment and user_payment.id in assigned_user_payment_ids:
            user_payment = None
        elif user_payment:
            assigned_user_payment_ids.add(user_payment.id)
        receiver_side_screenshots.append(
            models.ReceiverSideScreenshot(
                transaction_id=tid,
                is_matched=user_payment is not None,
                user_payment=user_payment,
            )
        )
    models.ReceiverSideScreenshot.objects.bulk_create(receiver_side_screenshots)

    to_be_updated = []
    now = timezone.now()
    for tid, rows in tid_to_payments.items():
        row = tid_to_row.get(tid)
        if row is None:
            continue
        ordered_rows = sorted(rows, key=lambda payment: payment.id)
        bank_amount = Money(amount=row["amount"], currency="USD")
        shared = _shares_one_bank_transaction(ordered_rows)
        matched = (
            _parsed_total(ordered_rows) == bank_amount.amount
            if shared
            else ordered_rows[0].parsed_amount.amount == bank_amount.amount
        )
        for index, payment in enumerate(ordered_rows):
            if shared:
                # Keep each course's own share so per-course paid_to_date holds.
                # On mismatch only the first row records what the bank said.
                payment.actual_amount = (
                    payment.parsed_amount
                    if matched
                    else (bank_amount if index == 0 else None)
                )
            else:
                payment.actual_amount = bank_amount
            if matched:
                payment.status = models.UserPayment.Status.VERIFIED
                if payment.verified_at is None:
                    payment.verified_at = now
                if actor is not None and payment.verified_by_id is None:
                    payment.verified_by = actor
            else:
                payment.status = models.UserPayment.Status.AMOUNT_MISMATCH
            to_be_updated.append(payment)
            if not shared:
                break

    if to_be_updated:
        models.UserPayment.objects.bulk_update(
            to_be_updated,
            ["actual_amount", "status", "verified_at", "verified_by"],
        )
        receipt_updates = ensure_receipts_for_payments(to_be_updated)
        if receipt_updates:
            models.UserPayment.objects.bulk_update(
                receipt_updates,
                ["receipt", "updated_at"],
            )

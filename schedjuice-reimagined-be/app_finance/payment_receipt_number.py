from __future__ import annotations

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from app_finance.models import PaymentReceipt, PaymentReceiptCounter, UserPayment


@transaction.atomic
def allocate_receipt_number() -> int:
    counter, _ = PaymentReceiptCounter.objects.select_for_update().get_or_create(
        pk=1,
        defaults={"next_sequence": 1},
    )
    n = counter.next_sequence
    counter.next_sequence = n + 1
    counter.save(update_fields=["next_sequence", "updated_at"])
    return n


def receipt_unit_key(payment: UserPayment) -> tuple[str, int]:
    if payment.group_id is not None:
        return ("group", payment.group_id)
    return ("payment", payment.pk)


def _existing_receipt_for_unit(payment: UserPayment) -> PaymentReceipt | None:
    if payment.receipt_id is not None:
        return payment.receipt
    if payment.group_id is None:
        return None
    sibling = (
        UserPayment.objects.filter(
            group_id=payment.group_id,
            receipt__isnull=False,
        )
        .exclude(pk=payment.pk)
        .select_related("receipt")
        .first()
    )
    return sibling.receipt if sibling is not None else None


def _unit_receipt_date(payment: UserPayment):
    if payment.group_id is None:
        rows = [(payment.payment_date, payment.created_at)]
    else:
        rows = list(
            UserPayment.objects.filter(group_id=payment.group_id).values_list(
                "payment_date", "created_at"
            )
        ) or [(payment.payment_date, payment.created_at)]
    dates = [pd or ca for pd, ca in rows if (pd or ca) is not None]
    return min(dates) if dates else timezone.now()


def _apply_authorizer(receipt: PaymentReceipt, payment: UserPayment) -> None:
    if payment.verified_by_id is None:
        return
    if receipt.authorized_by_id == payment.verified_by_id:
        return
    receipt.authorized_by_id = payment.verified_by_id
    receipt.save(update_fields=["authorized_by", "updated_at"])


def ensure_receipt_for_payment(payment: UserPayment) -> PaymentReceipt | None:
    if payment.status != UserPayment.Status.VERIFIED:
        return None
    receipt = _existing_receipt_for_unit(payment)
    if receipt is None:
        receipt = PaymentReceipt.objects.create(
            number=allocate_receipt_number(),
            receipt_date=_unit_receipt_date(payment),
            authorized_by_id=payment.verified_by_id,
        )
    else:
        _apply_authorizer(receipt, payment)
    payment.receipt = receipt
    return receipt


def ensure_receipts_for_payments(payments: list[UserPayment]) -> list[UserPayment]:
    cache: dict[tuple[str, int], PaymentReceipt] = {}
    changed: list[UserPayment] = []
    for payment in payments:
        if payment.status != UserPayment.Status.VERIFIED:
            continue
        key = receipt_unit_key(payment)
        receipt = cache.get(key)
        if receipt is None:
            receipt = ensure_receipt_for_payment(payment)
            if receipt is None:
                continue
            cache[key] = receipt
        else:
            payment.receipt = receipt
            _apply_authorizer(receipt, payment)
        changed.append(payment)
    return changed


@transaction.atomic
def reconcile_payment_receipt_counter(*, dry_run: bool = False) -> dict[str, int]:
    receipt_count = PaymentReceipt.objects.count()
    max_number = PaymentReceipt.objects.aggregate(m=Max("number"))["m"] or 0
    new_next = max_number + 1
    counter = PaymentReceiptCounter.objects.filter(pk=1).first()
    previous_next = counter.next_sequence if counter else 1
    if not dry_run:
        PaymentReceiptCounter.objects.update_or_create(
            pk=1,
            defaults={"next_sequence": new_next},
        )
    return {
        "receipt_count": receipt_count,
        "previous_next": previous_next,
        "new_next": new_next,
    }

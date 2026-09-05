from django.db import migrations
from django.utils import timezone

from app_finance.payment_receipt_backfill import plan_receipt_backfill


def forwards(apps, schema_editor):
    UserPayment = apps.get_model("app_finance", "UserPayment")
    PaymentReceipt = apps.get_model("app_finance", "PaymentReceipt")
    PaymentReceiptCounter = apps.get_model("app_finance", "PaymentReceiptCounter")

    rows = list(
        UserPayment.objects.values(
            "id",
            "group_id",
            "receipt_number",
            "payment_date",
            "created_at",
            "verified_at",
            "verified_by_id",
        )
    )
    if not rows:
        return

    plan = plan_receipt_backfill(rows, fallback_date=timezone.now())
    if not plan.receipts and not plan.voids:
        return

    PaymentReceipt.objects.bulk_create(
        [
            PaymentReceipt(
                number=planned.number,
                receipt_date=planned.receipt_date,
                authorized_by_id=planned.authorized_by_id,
                is_void=False,
                void_reason="",
            )
            for planned in plan.receipts
        ]
        + [
            PaymentReceipt(
                number=planned.number,
                receipt_date=planned.receipt_date,
                authorized_by_id=None,
                is_void=True,
                void_reason=planned.void_reason,
            )
            for planned in plan.voids
        ]
    )

    receipt_ids = dict(
        PaymentReceipt.objects.filter(
            number__in=[planned.number for planned in plan.receipts]
        ).values_list("number", "id")
    )
    for planned in plan.receipts:
        UserPayment.objects.filter(id__in=planned.payment_ids).update(
            receipt_id=receipt_ids[planned.number]
        )

    PaymentReceiptCounter.objects.update_or_create(
        pk=1,
        defaults={"next_sequence": plan.next_sequence},
    )


def backwards(apps, schema_editor):
    UserPayment = apps.get_model("app_finance", "UserPayment")
    PaymentReceipt = apps.get_model("app_finance", "PaymentReceipt")
    UserPayment.objects.update(receipt=None)
    PaymentReceipt.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("app_finance", "0081_paymentreceipt"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]

from django.db import migrations

from app_finance.payment_duplicate_backfill import plan_group_duplicate_status_backfill


def forwards(apps, schema_editor):
    UserPayment = apps.get_model("app_finance", "UserPayment")

    duplicated = list(
        UserPayment.objects.filter(status="duplicated")
        .exclude(transaction_id__isnull=True)
        .exclude(transaction_id="")
        .values_list("transaction_id", flat=True)
    )
    txn_ids = sorted({tid.strip() for tid in duplicated if tid and tid.strip()})
    if not txn_ids:
        return

    rows = list(
        UserPayment.objects.filter(transaction_id__in=txn_ids).values(
            "id",
            "group_id",
            "group__group_kind",
            "transaction_id",
            "status",
            "parsed_amount",
            "screenshot",
        )
    )
    corrections = plan_group_duplicate_status_backfill(rows)
    if not corrections:
        return

    by_status: dict[str, list[int]] = {}
    for payment_id, status in corrections.items():
        by_status.setdefault(status, []).append(payment_id)
    for status, payment_ids in by_status.items():
        UserPayment.objects.filter(id__in=payment_ids).update(status=status)


class Migration(migrations.Migration):
    dependencies = [
        ("app_finance", "0083_drop_userpayment_receipt_number"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]

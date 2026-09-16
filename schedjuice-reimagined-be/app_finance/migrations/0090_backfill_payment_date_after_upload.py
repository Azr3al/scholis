from django.db import migrations
from django.db.models import F


def backfill_payment_date_after_upload(apps, schema_editor):
    schema_name = getattr(schema_editor.connection, "schema_name", "") or ""
    if not schema_name or schema_name == "public":
        return
    UserPayment = apps.get_model("app_finance", "UserPayment")
    UserPayment.objects.filter(
        payment_date__isnull=True,
    ).exclude(
        screenshot="",
    ).exclude(
        screenshot__isnull=True,
    ).exclude(
        status="pending_payment",
    ).update(payment_date=F("updated_at"))


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        (
            "app_finance",
            "0089_alter_staffpayment_options_alter_userpayment_options_and_more",
        ),
    ]

    operations = [
        migrations.RunPython(backfill_payment_date_after_upload, noop_reverse),
    ]

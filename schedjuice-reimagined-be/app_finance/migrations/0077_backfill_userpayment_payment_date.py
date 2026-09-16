from django.db import migrations
from django.db.models import F


def backfill_payment_date(apps, schema_editor):
    schema_name = getattr(schema_editor.connection, "schema_name", "") or ""
    if not schema_name or schema_name == "public":
        return
    UserPayment = apps.get_model("app_finance", "UserPayment")
    UserPayment.objects.filter(payment_date__isnull=True).update(
        payment_date=F("created_at")
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("app_finance", "0075_backfill_payment_repricing"),
    ]

    operations = [
        migrations.RunPython(backfill_payment_date, noop_reverse),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_finance", "0077_backfill_userpayment_payment_date"),
    ]

    operations = [
        migrations.AddField(
            model_name="userpayment",
            name="discount_ids_set_on_create",
            field=models.JSONField(
                blank=True,
                help_text=(
                    "Discount template ids written to the enrollment stack on create. "
                    "null = stack unchanged; [] = cleared; [id, ...] = set exactly. "
                    "Write-once audit for delete cleanup."
                ),
                null=True,
            ),
        ),
    ]

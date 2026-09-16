from django.db import migrations, models


def backfill_pay_period_from_paid_at(apps, schema_editor):
    StaffPayment = apps.get_model("app_finance", "StaffPayment")
    for payment in StaffPayment.objects.all().iterator():
        paid_at = payment.paid_at
        if paid_at is None:
            continue
        payment.pay_period_year = paid_at.year
        payment.pay_period_month = paid_at.month
        payment.save(update_fields=["pay_period_year", "pay_period_month"])


class Migration(migrations.Migration):
    dependencies = [
        ("app_finance", "0069_staffpaymentproof"),
    ]

    operations = [
        migrations.AddField(
            model_name="staffpayment",
            name="pay_period_year",
            field=models.IntegerField(db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="staffpayment",
            name="pay_period_month",
            field=models.IntegerField(db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="staffpayment",
            name="confirmed_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.RunPython(
            backfill_pay_period_from_paid_at,
            migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name="staffpayment",
            name="pay_period_year",
            field=models.IntegerField(db_index=True),
        ),
        migrations.AlterField(
            model_name="staffpayment",
            name="pay_period_month",
            field=models.IntegerField(db_index=True),
        ),
        migrations.AddIndex(
            model_name="staffpayment",
            index=models.Index(
                fields=["pay_period_year", "pay_period_month", "user"],
                name="app_finance_staffpay_period_user_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="staffpayment",
            constraint=models.UniqueConstraint(
                fields=("user", "pay_period_year", "pay_period_month"),
                name="uniq_staff_payment_user_pay_period",
            ),
        ),
    ]

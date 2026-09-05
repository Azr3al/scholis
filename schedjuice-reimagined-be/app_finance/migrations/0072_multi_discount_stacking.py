# Generated manually for multi-discount stacking (trimmed from makemigrations)

from django.db import migrations, models
import django.db.models.deletion
import djmoney.models.fields


def backfill_payment_discount_lines(apps, schema_editor):
    UserPayment = apps.get_model("app_finance", "UserPayment")
    UserPaymentDiscount = apps.get_model("app_finance", "UserPaymentDiscount")
    EnrollmentDiscount = apps.get_model("app_finance", "EnrollmentDiscount")
    Discount = apps.get_model("app_finance", "Discount")

    qs = UserPayment.objects.filter(enrollment_discount_id__isnull=False).iterator()
    for up in qs:
        ed_id = up.enrollment_discount_id
        label = "Discount"
        try:
            ed = EnrollmentDiscount.objects.select_related("discount").get(id=ed_id)
            if ed.discount_id:
                disc = Discount.objects.filter(id=ed.discount_id).first()
                if disc and disc.name:
                    label = disc.name
        except EnrollmentDiscount.DoesNotExist:
            pass
        amount = getattr(up, "discount_amount", None)
        if amount is None:
            continue
        currency = getattr(up, "discount_amount_currency", None) or "USD"
        UserPaymentDiscount.objects.get_or_create(
            user_payment_id=up.id,
            enrollment_discount_id=ed_id,
            defaults={
                "label": label,
                "amount": amount,
                "amount_currency": currency,
            },
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("app_finance", "0071_merge_20260721_0711"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="enrollmentdiscount",
            name="app_finance_enrollmentdiscount_one_active_per_user_course",
        ),
        migrations.AddConstraint(
            model_name="enrollmentdiscount",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_active", True), ("discount__isnull", False)),
                fields=("user_course", "discount"),
                name="app_finance_enrollmentdiscount_one_active_per_template",
            ),
        ),
        migrations.CreateModel(
            name="UserPaymentDiscount",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("label", models.CharField(max_length=255)),
                (
                    "amount_currency",
                    djmoney.models.fields.CurrencyField(
                        default="USD",
                        editable=False,
                        max_length=3,
                    ),
                ),
                (
                    "amount",
                    djmoney.models.fields.MoneyField(
                        decimal_places=4, default_currency="USD", max_digits=19
                    ),
                ),
                (
                    "enrollment_discount",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="payment_discount_lines",
                        to="app_finance.enrollmentdiscount",
                    ),
                ),
                (
                    "user_payment",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="payment_discounts",
                        to="app_finance.userpayment",
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="userpaymentdiscount",
            constraint=models.UniqueConstraint(
                condition=models.Q(("enrollment_discount__isnull", False)),
                fields=("user_payment", "enrollment_discount"),
                name="app_finance_userpaymentdiscount_unique_ed_per_payment",
            ),
        ),
        migrations.RunPython(backfill_payment_discount_lines, noop_reverse),
    ]

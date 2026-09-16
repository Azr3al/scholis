from decimal import Decimal

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0071_merge_20260707_1747"),
        ("app_ai", "0006_airequestlog_resolution"),
    ]

    operations = [
        migrations.CreateModel(
            name="AIUserUsageMonthly",
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
                ("user_id", models.PositiveIntegerField()),
                ("year", models.PositiveSmallIntegerField()),
                ("month", models.PositiveSmallIntegerField()),
                ("input_tokens", models.PositiveBigIntegerField(default=0)),
                ("output_tokens", models.PositiveBigIntegerField(default=0)),
                ("thinking_tokens", models.PositiveBigIntegerField(default=0)),
                ("cached_input_tokens", models.PositiveBigIntegerField(default=0)),
                ("total_tokens", models.PositiveBigIntegerField(default=0)),
                (
                    "total_cost_usd",
                    models.DecimalField(
                        decimal_places=8, default=Decimal("0"), max_digits=14
                    ),
                ),
                (
                    "total_billed_usd",
                    models.DecimalField(
                        decimal_places=8, default=Decimal("0"), max_digits=14
                    ),
                ),
                ("request_count", models.PositiveIntegerField(default=0)),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="ai_user_usage_monthly",
                        to="app_organization.organization",
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(
                        fields=["tenant", "year", "month", "-total_billed_usd"],
                        name="ix_ai_user_usage_tnt_mo_cost",
                    )
                ],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("tenant", "user_id", "year", "month"),
                        name="uniq_ai_user_usage_monthly",
                    )
                ],
            },
        ),
    ]

from decimal import Decimal

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("app_organization", "0055_organization_default_student_payment_plan"),
    ]

    operations = [
        migrations.CreateModel(
            name="AITenantBudget",
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
                (
                    "monthly_usd_limit",
                    models.DecimalField(
                        blank=True, decimal_places=4, max_digits=12, null=True
                    ),
                ),
                (
                    "monthly_token_limit",
                    models.PositiveBigIntegerField(blank=True, null=True),
                ),
                ("hard_enforce", models.BooleanField(default=False)),
                ("alert_thresholds", models.JSONField(default=list)),
                ("is_active", models.BooleanField(default=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "tenant",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="ai_budget",
                        to="app_organization.organization",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="AITenantUsageMonthly",
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
                ("year", models.PositiveSmallIntegerField()),
                ("month", models.PositiveSmallIntegerField()),
                ("model", models.CharField(blank=True, default="", max_length=128)),
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
                    "highest_alert_threshold",
                    models.DecimalField(
                        decimal_places=4,
                        default=Decimal("0"),
                        help_text="Highest spend threshold (0-1) already alerted this month.",
                        max_digits=5,
                    ),
                ),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="ai_usage_monthly",
                        to="app_organization.organization",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="AIUsageLog",
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
                ("user_id", models.PositiveIntegerField(blank=True, null=True)),
                ("feature", models.CharField(blank=True, default="", max_length=128)),
                ("model", models.CharField(max_length=128)),
                ("pricing_version", models.CharField(max_length=64)),
                ("input_tokens", models.PositiveIntegerField(default=0)),
                ("output_tokens", models.PositiveIntegerField(default=0)),
                ("thinking_tokens", models.PositiveIntegerField(default=0)),
                ("cached_input_tokens", models.PositiveIntegerField(default=0)),
                ("total_tokens", models.PositiveIntegerField(default=0)),
                (
                    "computed_cost_usd",
                    models.DecimalField(
                        decimal_places=8, default=Decimal("0"), max_digits=12
                    ),
                ),
                (
                    "billed_cost_usd",
                    models.DecimalField(
                        decimal_places=8, default=Decimal("0"), max_digits=12
                    ),
                ),
                ("latency_ms", models.PositiveIntegerField(default=0)),
                ("tool_iterations", models.PositiveSmallIntegerField(default=0)),
                (
                    "status",
                    models.CharField(
                        choices=[("success", "success"), ("error", "error")],
                        default="success",
                        max_length=16,
                    ),
                ),
                ("error_type", models.CharField(blank=True, default="", max_length=128)),
                ("finish_reason", models.CharField(blank=True, default="", max_length=64)),
                ("tool_calls", models.JSONField(blank=True, default=list)),
                ("retries", models.PositiveSmallIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="ai_usage_logs",
                        to="app_organization.organization",
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(
                        fields=["tenant", "created_at"],
                        name="ix_ai_usage_tenant_created",
                    ),
                    models.Index(
                        fields=["tenant", "model", "created_at"],
                        name="ix_ai_usage_tenant_model",
                    ),
                ],
            },
        ),
        migrations.AddConstraint(
            model_name="aitenantusagemonthly",
            constraint=models.UniqueConstraint(
                fields=("tenant", "year", "month", "model"),
                name="uniq_ai_tenant_usage_monthly",
            ),
        ),
    ]

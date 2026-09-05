import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_ai", "0001_initial"),
        ("app_organization", "0064_organization_ai_settings"),
    ]

    operations = [
        migrations.CreateModel(
            name="AIRequestLog",
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
                ("feature", models.CharField(max_length=128)),
                ("channel_key", models.CharField(blank=True, default="", max_length=128)),
                ("prompt", models.TextField()),
                ("response_text", models.TextField(blank=True, default="")),
                (
                    "outcome",
                    models.CharField(
                        choices=[
                            ("success", "success"),
                            ("tool_limit_exceeded", "tool_limit_exceeded"),
                            ("error", "error"),
                            ("blocked", "blocked"),
                            ("rate_limited", "rate_limited"),
                        ],
                        max_length=32,
                    ),
                ),
                ("tool_iterations", models.PositiveSmallIntegerField(default=0)),
                ("tool_calls", models.JSONField(blank=True, default=list)),
                ("model", models.CharField(blank=True, default="", max_length=128)),
                ("total_tokens", models.PositiveIntegerField(default=0)),
                ("latency_ms", models.PositiveIntegerField(default=0)),
                (
                    "source",
                    models.CharField(
                        choices=[("live", "live"), ("backfill", "backfill")],
                        default="live",
                        max_length=16,
                    ),
                ),
                ("error_type", models.CharField(blank=True, default="", max_length=128)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="ai_request_logs",
                        to="app_organization.organization",
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(
                        fields=["tenant", "created_at"],
                        name="ix_ai_req_tenant_created",
                    ),
                    models.Index(
                        fields=["outcome", "created_at"],
                        name="ix_ai_req_outcome_created",
                    ),
                    models.Index(
                        fields=["feature", "outcome", "created_at"],
                        name="ix_ai_req_feat_out_created",
                    ),
                ],
            },
        ),
    ]

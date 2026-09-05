# Generated manually for Telegram AI context feature

from django.db import migrations, models


def copy_ai_budget_to_org(apps, schema_editor):
    Organization = apps.get_model("app_organization", "Organization")
    AITenantBudget = apps.get_model("app_ai", "AITenantBudget")
    for budget in AITenantBudget.objects.select_related("tenant").all():
        org = budget.tenant
        Organization.objects.filter(pk=org.pk).update(
            ai_monthly_usd_limit=budget.monthly_usd_limit,
            ai_monthly_token_limit=budget.monthly_token_limit,
            ai_hard_enforce=budget.hard_enforce,
            ai_alert_thresholds=budget.alert_thresholds or [],
            ai_budget_active=budget.is_active,
        )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("app_ai", "0001_initial"),
        ("app_organization", "0063_organization_is_staff_points_enabled"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="is_ai_enabled",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="organization",
            name="ai_default_model",
            field=models.CharField(blank=True, max_length=128, null=True),
        ),
        migrations.AddField(
            model_name="organization",
            name="ai_max_context_turns",
            field=models.PositiveSmallIntegerField(default=5),
        ),
        migrations.AddField(
            model_name="organization",
            name="ai_max_tool_iterations",
            field=models.PositiveSmallIntegerField(default=5),
        ),
        migrations.AddField(
            model_name="organization",
            name="ai_school_context",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="organization",
            name="ai_assistant_instructions",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="organization",
            name="ai_monthly_usd_limit",
            field=models.DecimalField(
                blank=True, decimal_places=4, max_digits=12, null=True
            ),
        ),
        migrations.AddField(
            model_name="organization",
            name="ai_monthly_token_limit",
            field=models.PositiveBigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="organization",
            name="ai_hard_enforce",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="organization",
            name="ai_alert_thresholds",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="organization",
            name="ai_budget_active",
            field=models.BooleanField(default=True),
        ),
        migrations.RunPython(copy_ai_budget_to_org, noop),
    ]

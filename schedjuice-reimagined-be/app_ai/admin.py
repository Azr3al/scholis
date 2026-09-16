from django.contrib import admin

from app_ai.models import AIRequestLog, AITenantBudget, AITenantUsageMonthly, AIUsageLog


@admin.register(AIRequestLog)
class AIRequestLogAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "tenant",
        "user_id",
        "feature",
        "outcome",
        "tool_iterations",
        "created_at",
    )
    list_filter = ("outcome", "feature", "source", "tenant")
    search_fields = ("prompt", "tenant__name", "tenant__schema_name")
    readonly_fields = [f.name for f in AIRequestLog._meta.fields]


@admin.register(AIUsageLog)
class AIUsageLogAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "tenant",
        "user_id",
        "model",
        "total_tokens",
        "billed_cost_usd",
        "status",
        "created_at",
    )
    list_filter = ("status", "model", "tenant")
    search_fields = ("tenant__name", "tenant__schema_name", "feature")
    readonly_fields = [f.name for f in AIUsageLog._meta.fields]


@admin.register(AITenantUsageMonthly)
class AITenantUsageMonthlyAdmin(admin.ModelAdmin):
    list_display = (
        "tenant",
        "year",
        "month",
        "model",
        "total_tokens",
        "total_billed_usd",
        "request_count",
    )
    list_filter = ("year", "month", "tenant")


@admin.register(AITenantBudget)
class AITenantBudgetAdmin(admin.ModelAdmin):
    list_display = (
        "tenant",
        "monthly_usd_limit",
        "monthly_token_limit",
        "hard_enforce",
        "is_active",
    )

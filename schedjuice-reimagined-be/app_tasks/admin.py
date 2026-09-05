from django.contrib import admin

from app_tasks.models import CronCommandLog


@admin.register(CronCommandLog)
class CronCommandLogAdmin(admin.ModelAdmin):
    list_display = (
        "command_name",
        "status",
        "completed_at",
        "created_at",
    )
    list_filter = ("command_name", "status", "completed_at")
    search_fields = ("command_name", "error_message", "stdout", "stderr")
    readonly_fields = (
        "created_at",
        "updated_at",
        "command_name",
        "status",
        "stdout",
        "stderr",
        "error_message",
        "completed_at",
    )
    ordering = ("-completed_at",)

from django.contrib import admin

from app_utility_notifications.models import UtilityNotificationSentLog


@admin.register(UtilityNotificationSentLog)
class UtilityNotificationSentLogAdmin(admin.ModelAdmin):
    list_display = ("user", "kind", "reference_id", "sent_on_date", "created_at")
    list_filter = ("kind", "sent_on_date")
    search_fields = ("user__email", "user__name", "reference_id")
    autocomplete_fields = ("user",)

from django.contrib import admin

from app_chat.models import ChatMessage


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ("id", "thread", "user", "created_at")
    list_filter = ("thread__kind",)
    search_fields = ("content", "user__email")

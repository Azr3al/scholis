from admin_anchors import admin_anchor
from django.contrib import admin

from expo_notifications.models import Device


# Override expo_notifications DeviceAdmin: our User model uses email, not username
admin.site.unregister(Device)


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = [
        "__str__",
        "is_active",
        "date_registered",
        "lang",
        "user_link",
        "messages_link",
    ]
    list_filter = ["is_active", "lang", "date_registered"]
    search_fields = ["user__email", "user__name", "push_token"]
    autocomplete_fields = ["user"]

    def get_ordering(self, request):
        return ["-id"]

    @admin.display(description="User")
    @admin_anchor("user")
    def user_link(self, instance):
        return str(instance.user)

    @admin.display(description="Messages")
    @admin_anchor("messages")
    def messages_link(self, instance):
        return str(instance.messages.count())

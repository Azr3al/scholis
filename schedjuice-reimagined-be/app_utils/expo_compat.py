"""
Multi-tenant compatibility for django-expo-notifications.

Patches the MessageManager to use tenant-aware tasks that pass schema_name,
so Device/Message/Ticket models (in tenant schemas) are found correctly when
Celery workers run.
"""
from django.db import connection
from tenant_schemas.utils import get_public_schema_name

from app_utils.expo_push_chunking import enqueue_send_messages_tenant


def get_current_schema_name():
    """Get current schema from connection (set by middleware or schema_context)."""
    return getattr(connection, "schema_name", None) or get_public_schema_name()


def patch_expo_notifications():
    """
    Patch expo_notifications MessageManager to use tenant-aware tasks.
    Call from app_utils.apps.AppConfig.ready().
    """
    from expo_notifications.managers.message_manager import (
        MessageManager,
        MessageQueryset,
    )

    from app_utils.expo_tasks import send_messages_tenant

    # Patch MessageQueryset.send
    def patched_queryset_send(self):
        message_pks = list(self.values_list("pk", flat=True))
        if message_pks:
            enqueue_send_messages_tenant(get_current_schema_name(), message_pks)

    MessageQueryset.send = patched_queryset_send

    # Patch MessageManager.send
    def patched_manager_send(self, **kwargs):
        from django.db import transaction

        with transaction.atomic():
            message = self.create(**kwargs)
            message_pks = [message.pk]
            send_messages_tenant.delay_on_commit(
                get_current_schema_name(), message_pks
            )
        return message

    MessageManager.send = patched_manager_send

    # Patch MessageManager.bulk_send
    def patched_bulk_send(self, *args, **kwargs):
        from django.db import transaction

        with transaction.atomic():
            messages = self.bulk_create(*args, **kwargs)
            message_pks = [m.pk for m in messages]
            if message_pks:
                enqueue_send_messages_tenant(get_current_schema_name(), message_pks)
        return messages

    MessageManager.bulk_send = patched_bulk_send

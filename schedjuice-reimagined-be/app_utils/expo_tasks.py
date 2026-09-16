"""
Tenant-aware Expo push notification tasks for django-expo-notifications.

These tasks wrap the package's logic with schema_context for multi-tenant support.
The MessageManager is patched in AppUtilsConfig.ready() to use these tasks.
"""
import logging

from celery import shared_task
from django.conf import settings as django_settings
from django.utils import timezone
from exponent_server_sdk import (
    DeviceNotRegisteredError,
    PushClient,
    PushMessage,
    PushServerError,
    PushTicket,
    PushTicketError,
)
from requests.exceptions import ConnectionError, HTTPError
from tenant_schemas.utils import schema_context

from app_utils.expo_push_chunking import (
    enqueue_check_receipts_tenant,
    expo_push_celery_chunk_size,
    iter_pk_chunks,
)
from expo_notifications.conf import settings
from expo_notifications.models import Message, Receipt, Ticket
from expo_notifications.tasks.session import session

logger = logging.getLogger(__name__)


def _apply_default_android_channel(push_messages: list[PushMessage]) -> list[PushMessage]:
    """
    Expo maps ``channel_id`` to the push API's ``channelId`` (Android O+).
    When unset, Android may not post to the channel the app registered
    (e.g. ``setNotificationChannelAsync('default', ...)`` on the client).
    """
    channel_id = getattr(
        django_settings,
        "EXPO_NOTIFICATIONS_DEFAULT_ANDROID_CHANNEL_ID",
        "default",
    )
    if not channel_id:
        return push_messages
    return [
        pm._replace(channel_id=pm.channel_id or channel_id) for pm in push_messages
    ]


def _send_messages_tenant_batch(task, schema_name: str, message_pks: list) -> None:
    with schema_context(schema_name):
        messages = list(
            Message.objects.filter(
                pk__in=message_pks, device__is_active=True
            ).order_by("pk")
        )
        push_messages = _apply_default_android_channel(
            [m.to_push_message() for m in messages]
        )
        push_client = PushClient(session=session)

        try:
            push_tickets: list[PushTicket] = push_client.publish_multiple(
                push_messages
            )
        except PushServerError:
            raise task.retry()
        except (ConnectionError, HTTPError):
            raise task.retry()

        tickets: list[Ticket] = []
        for message, push_ticket in zip(messages, push_tickets):
            try:
                push_ticket.validate_response()
            except DeviceNotRegisteredError:
                message.device.is_active = False
                message.device.save()
            except PushTicketError:
                pass
            tickets.append(
                Ticket(
                    message=message,
                    is_success=push_ticket.is_success(),
                    external_id=push_ticket.id,
                    error_message=push_ticket.message,
                    date_received=timezone.now(),
                )
            )

        pks_of_success_tickets = [
            t.pk for t in Ticket.objects.bulk_create(tickets) if t.is_success
        ]
        if pks_of_success_tickets:
            enqueue_check_receipts_tenant(
                schema_name,
                pks_of_success_tickets,
                settings.receipt_check_delay.total_seconds(),
            )


def _check_receipts_tenant_batch(task, schema_name: str, ticket_pks: list) -> None:
    from exponent_server_sdk import PushReceipt

    with schema_context(schema_name):
        tickets = list(
            Ticket.objects.filter(pk__in=ticket_pks)
            .exclude(external_id="")
            .order_by("pk")
        )
        tickets_by_external_id = {t.external_id: t for t in tickets}
        push_tickets = [t.to_push_ticket() for t in tickets]
        push_client = PushClient(session=session)

        try:
            push_receipts: list[PushReceipt] = (
                push_client.check_receipts_multiple(push_tickets)
            )
        except PushServerError:
            raise task.retry()
        except (ConnectionError, HTTPError):
            raise task.retry()

        receipts: list[Receipt] = []
        for push_receipt in push_receipts:
            ticket = tickets_by_external_id.get(push_receipt.id)
            if ticket is None:
                continue
            try:
                push_receipt.validate_response()
            except DeviceNotRegisteredError:
                ticket.message.device.is_active = False
                ticket.message.device.save()
            except PushTicketError:
                pass
            receipts.append(
                Receipt(
                    ticket=ticket,
                    is_success=push_receipt.is_success(),
                    error_message=push_receipt.message,
                    date_checked=timezone.now(),
                )
            )
        Receipt.objects.bulk_create(receipts)


@shared_task(
    bind=True,
    ignore_result=True,
    max_retries=settings.sending_task_max_retries,
    default_retry_delay=settings.sending_task_retry_delay.total_seconds(),
)
def send_messages_tenant(self, schema_name: str, message_pks: list) -> None:
    """Send Expo push messages. Runs in schema_context for multi-tenant support."""
    logger.info(
        "send_messages_tenant schema=%s batch_size=%d",
        schema_name,
        len(message_pks),
    )
    chunk_size = expo_push_celery_chunk_size()
    if len(message_pks) <= chunk_size:
        _send_messages_tenant_batch(self, schema_name, message_pks)
        return

    for chunk in iter_pk_chunks(message_pks, chunk_size):
        _send_messages_tenant_batch(self, schema_name, chunk)


@shared_task(
    bind=True,
    ignore_result=True,
    max_retries=settings.checking_task_max_retries,
    default_retry_delay=settings.checking_task_retry_delay.total_seconds(),
)
def check_receipts_tenant(self, schema_name: str, ticket_pks: list) -> None:
    """Check Expo push receipts. Runs in schema_context for multi-tenant support."""
    logger.info(
        "check_receipts_tenant schema=%s batch_size=%d",
        schema_name,
        len(ticket_pks),
    )
    chunk_size = expo_push_celery_chunk_size()
    if len(ticket_pks) <= chunk_size:
        _check_receipts_tenant_batch(self, schema_name, ticket_pks)
        return

    for chunk in iter_pk_chunks(ticket_pks, chunk_size):
        _check_receipts_tenant_batch(self, schema_name, chunk)

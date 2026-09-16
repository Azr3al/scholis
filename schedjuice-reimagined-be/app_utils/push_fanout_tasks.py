"""Chunked push fan-out Celery tasks to bound worker memory."""

from __future__ import annotations

import logging

from celery import shared_task
from django.conf import settings
from tenant_schemas.utils import schema_context

from app_utils.push_helpers import _send_web_push_for_user_ids

logger = logging.getLogger(__name__)

DEFAULT_PUSH_FANOUT_CELERY_CHUNK_SIZE = 300
LARGE_FANOUT_WARN_THRESHOLD = 2000


def push_fanout_chunk_size() -> int:
    return getattr(
        settings,
        "PUSH_FANOUT_CELERY_CHUNK_SIZE",
        DEFAULT_PUSH_FANOUT_CELERY_CHUNK_SIZE,
    )


def iter_user_id_chunks(user_ids: list[int], chunk_size: int | None = None):
    size = chunk_size or push_fanout_chunk_size()
    for index in range(0, len(user_ids), size):
        yield user_ids[index : index + size]


@shared_task(bind=True, ignore_result=True)
def send_push_fanout_batch(
    self,
    schema_name: str,
    user_ids: list[int],
    title: str,
    body: str,
    data: dict | None = None,
) -> None:
    """Resolve devices for one user batch, enqueue Expo sends, and deliver web push."""
    logger.info(
        "send_push_fanout_batch schema=%s batch_size=%d",
        schema_name,
        len(user_ids),
    )
    with schema_context(schema_name):
        from expo_notifications.models import Device, Message

        devices = Device.objects.filter(user_id__in=user_ids, is_active=True)
        messages = [
            Message(device=d, title=title, body=body, data=data or None) for d in devices
        ]
        if messages:
            Message.objects.bulk_send(messages)

    _send_web_push_for_user_ids(schema_name, user_ids, title, body, data or {})

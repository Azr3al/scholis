"""Chunk Expo push Celery tasks to bound worker memory."""

from __future__ import annotations

from django.conf import settings

DEFAULT_EXPO_PUSH_CELERY_CHUNK_SIZE = 200


def expo_push_celery_chunk_size() -> int:
    return getattr(
        settings,
        "EXPO_PUSH_CELERY_CHUNK_SIZE",
        DEFAULT_EXPO_PUSH_CELERY_CHUNK_SIZE,
    )


def iter_pk_chunks(pks: list, chunk_size: int | None = None):
    size = chunk_size or expo_push_celery_chunk_size()
    for index in range(0, len(pks), size):
        yield pks[index : index + size]


def enqueue_send_messages_tenant(schema_name: str, message_pks: list) -> None:
    from app_utils.expo_tasks import send_messages_tenant

    for chunk in iter_pk_chunks(message_pks):
        send_messages_tenant.delay_on_commit(schema_name, chunk)


def enqueue_check_receipts_tenant(
    schema_name: str, ticket_pks: list, countdown: float
) -> None:
    from app_utils.expo_tasks import check_receipts_tenant

    for chunk in iter_pk_chunks(ticket_pks):
        check_receipts_tenant.apply_async(
            args=[schema_name, chunk],
            countdown=countdown,
        )

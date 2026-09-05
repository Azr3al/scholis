from __future__ import annotations

import json
import logging

try:
    from pywebpush import webpush, WebPushException
except ImportError:
    # pywebpush not available, web push will be skipped
    webpush = None
    WebPushException = Exception

from django.conf import settings
from django.db import connection
from tenant_schemas.utils import get_public_schema_name, schema_context

logger = logging.getLogger(__name__)


def _web_push_headers_for_endpoint(endpoint: str) -> dict[str, str]:
    """Microsoft WNS (Edge/Brave on Windows) requires X-WNS-Type on each push."""
    if "notify.windows.com" not in endpoint:
        return {}
    return {
        "X-WNS-Type": "wns/raw",
        "X-WNS-Cache-Policy": "cache",
    }


def _current_schema_name() -> str:
    return getattr(connection, "schema_name", None) or get_public_schema_name()


def enqueue_push_for_user_ids(
    user_ids: list[int],
    title: str,
    body: str,
    data: dict | None = None,
) -> None:
    from app_utils.push_fanout_tasks import (
        LARGE_FANOUT_WARN_THRESHOLD,
        iter_user_id_chunks,
        push_fanout_chunk_size,
        send_push_fanout_batch,
    )

    schema_name = _current_schema_name()
    recipient_ids = list(user_ids)
    recipient_count = len(recipient_ids)
    chunk_size = push_fanout_chunk_size()
    batch_count = (recipient_count + chunk_size - 1) // chunk_size if recipient_count else 0

    logger.info(
        "enqueue_push_for_user_ids schema=%s recipients=%d batches=%d chunk_size=%d",
        schema_name,
        recipient_count,
        batch_count,
        chunk_size,
    )
    if recipient_count > LARGE_FANOUT_WARN_THRESHOLD:
        logger.warning(
            "Large push fan-out schema=%s recipients=%d",
            schema_name,
            recipient_count,
        )

    payload_data = data or {}
    for chunk in iter_user_id_chunks(recipient_ids, chunk_size):
        send_push_fanout_batch.delay_on_commit(
            schema_name,
            chunk,
            title,
            body,
            payload_data,
        )


def _send_web_push_for_user_ids(
    schema_name: str,
    user_ids: list[int],
    title: str,
    body: str,
    data: dict,
) -> None:
    """Send web push notifications to users."""
    # Skip if pywebpush not available
    if webpush is None:
        logger.warning("pywebpush not available, skipping web push notifications")
        return

    # Skip if VAPID keys not configured
    vapid_private_key = getattr(settings, "WEB_PUSH_VAPID_PRIVATE_KEY", "")
    vapid_public_key = getattr(settings, "WEB_PUSH_VAPID_PUBLIC_KEY", "")
    vapid_subject = getattr(settings, "WEB_PUSH_VAPID_SUBJECT", "")

    if not all([vapid_private_key, vapid_public_key, vapid_subject]):
        logger.info("VAPID keys not configured, skipping web push notifications")
        return

    with schema_context(schema_name):
        from app_auth.models import WebPushSubscription

        # Get active web push subscriptions for these users
        subscriptions = WebPushSubscription.objects.filter(
            user_id__in=user_ids,
            is_active=True,
        ).select_related("user")

        if not subscriptions:
            return

        # Prepare push payload
        payload = {
            "title": title,
            "body": body,
            "data": data,
        }
        payload_json = json.dumps(payload)

        for subscription in subscriptions:
            try:
                # Fresh claims per subscription — pywebpush mutates aud/exp in place;
                # reusing one dict breaks FCM after a WNS send (403 aud mismatch).
                vapid_claims = {
                    "sub": vapid_subject,
                }

                # Prepare subscription info for pywebpush
                subscription_info = {
                    "endpoint": subscription.endpoint,
                    "keys": {
                        "p256dh": subscription.p256dh,
                        "auth": subscription.auth,
                    },
                }

                # Send the web push notification
                webpush(
                    subscription_info=subscription_info,
                    data=payload_json,
                    vapid_private_key=vapid_private_key,
                    vapid_claims=vapid_claims,
                    headers=_web_push_headers_for_endpoint(subscription.endpoint),
                    ttl=86400,
                )
                logger.info(
                    "Web push sent successfully to user %s", subscription.user_id
                )

            except WebPushException as e:
                logger.warning(
                    "Web push failed for user %s: %s", subscription.user_id, e
                )

                # Handle 410 Gone - subscription no longer valid
                if (
                    hasattr(e, "response")
                    and e.response
                    and e.response.status_code == 410
                ):
                    logger.info(
                        "Deactivating invalid web push subscription for user %s",
                        subscription.user_id,
                    )
                    subscription.is_active = False
                    subscription.save(update_fields=["is_active"])

            except Exception as e:
                logger.error(
                    "Unexpected error sending web push to user %s: %s",
                    subscription.user_id,
                    e,
                )

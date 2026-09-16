"""Inbound Telegram update dispatch (runs inside the tenant schema)."""
from __future__ import annotations

import logging

from app_telegram.models import TelegramProcessedUpdate

logger = logging.getLogger(__name__)


def dispatch_update(tenant, update: dict) -> None:
    """Route a single update to the right handler. Tenant schema is already active."""
    if "message" in update:
        from app_telegram.binding import handle_message

        handle_message(tenant, update["message"])
    elif "my_chat_member" in update:
        from app_telegram.linking import handle_my_chat_member

        handle_my_chat_member(tenant, update["my_chat_member"])
    elif "chat_join_request" in update:
        from app_telegram.roster import handle_join_request

        handle_join_request(tenant, update["chat_join_request"])
    elif "callback_query" in update:
        from app_telegram.callbacks import handle_callback_query

        handle_callback_query(tenant, update["callback_query"])
    else:
        logger.info("telegram: ignoring update with keys=%s", list(update.keys()))


def process_incoming(tenant, update: dict) -> None:
    """Dedupe by update_id, then dispatch. Caller ensures tenant schema is active."""
    update_id = update.get("update_id")
    if update_id is None:
        return
    _, created = TelegramProcessedUpdate.objects.get_or_create(update_id=update_id)
    if not created:
        logger.info("telegram: duplicate update_id=%s ignored", update_id)
        return
    try:
        dispatch_update(tenant, update)
    except Exception:
        logger.exception("telegram: error handling update_id=%s", update_id)

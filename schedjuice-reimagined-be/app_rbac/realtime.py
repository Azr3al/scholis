"""Channel layer helpers for RBAC live refresh (matrix + role assignment)."""

from __future__ import annotations

import logging
from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)

RBAC_UPDATED_PAYLOAD: dict[str, Any] = {"type": "rbac.updated"}


def tenant_rbac_group_name(tenant_schema: str) -> str:
    return f"rbac_tenant_{tenant_schema}"


def user_rbac_group_name(tenant_schema: str, user_id: int) -> str:
    return f"rbac_user_{tenant_schema}_{user_id}"


def _group_send(group_name: str, message: dict[str, Any], *, log_context: str) -> None:
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    try:
        async_to_sync(channel_layer.group_send)(group_name, message)
    except Exception:
        logger.exception("rbac broadcast failed %s group=%s", log_context, group_name)


def broadcast_rbac_updated_to_tenant(tenant_schema: str) -> None:
    """Notify all subscribers on the tenant RBAC channel."""
    _group_send(
        tenant_rbac_group_name(tenant_schema),
        RBAC_UPDATED_PAYLOAD,
        log_context=f"tenant={tenant_schema}",
    )


def broadcast_rbac_updated_to_user(tenant_schema: str, user_id: int) -> None:
    """Notify subscribers on a single user's RBAC channel."""
    _group_send(
        user_rbac_group_name(tenant_schema, user_id),
        RBAC_UPDATED_PAYLOAD,
        log_context=f"tenant={tenant_schema} user={user_id}",
    )

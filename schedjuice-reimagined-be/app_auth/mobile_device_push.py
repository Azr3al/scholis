"""Push notifications for mobile session revocation (Task 10)."""

from __future__ import annotations

import logging

from app_auth.models import User
from app_auth.session_revoked import (
    REVOKED_REASON_ADMIN_REVOKED,
    REVOKED_REASON_DEVICE_DISPLACED,
)

logger = logging.getLogger(__name__)

SESSION_REVOKED_PUSH_TITLE = "Signed out"

_SESSION_REVOKED_BODIES: dict[str, str] = {
    REVOKED_REASON_DEVICE_DISPLACED: "Your account signed in on another device.",
    REVOKED_REASON_ADMIN_REVOKED: "Your session was ended by a school administrator.",
}


def session_revoked_push_body(reason: str) -> str:
    """Return the notification body for a session_revoked reason."""
    return _SESSION_REVOKED_BODIES.get(
        reason,
        "Your session was ended.",
    )


def send_session_revoked_push(user: User, reason: str) -> None:
    """
    Enqueue a session_revoked push to the user's active Expo devices.

    Best-effort; displacement and admin revoke still work via 401 if push fails.
    """
    if reason not in _SESSION_REVOKED_BODIES:
        logger.info(
            "Skipping session_revoked push for user %s: unsupported reason %s",
            user.id,
            reason,
        )
        return

    title = SESSION_REVOKED_PUSH_TITLE
    body = session_revoked_push_body(reason)
    data = {
        "type": "session_revoked",
        "reason": reason,
        "title": title,
        "body": body,
    }

    from app_utils.push_helpers import enqueue_push_for_user_ids

    enqueue_push_for_user_ids([user.id], title=title, body=body, data=data)
    logger.info(
        "Queued session_revoked push for user %s reason=%s",
        user.id,
        reason,
    )

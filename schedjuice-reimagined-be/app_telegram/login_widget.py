"""Telegram Login Widget HMAC verification."""

from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any

from rest_framework.exceptions import ValidationError

TELEGRAM_AUTH_MAX_AGE_SECONDS = 86400


def _build_data_check_string(payload: dict[str, Any]) -> str:
    pairs = []
    for key in sorted(payload.keys()):
        if key == "hash":
            continue
        value = payload[key]
        if value is None:
            continue
        pairs.append(f"{key}={value}")
    return "\n".join(pairs)


def verify_telegram_login_widget(
    payload: dict[str, Any],
    *,
    bot_token: str,
    max_age_seconds: int = TELEGRAM_AUTH_MAX_AGE_SECONDS,
) -> dict[str, Any]:
    """
    Validate Telegram Login Widget callback payload.

    Returns normalized payload on success; raises ValidationError with stable codes.
    """
    received_hash = payload.get("hash")
    if not received_hash:
        raise ValidationError(
            {
                "is_error": True,
                "message": "telegram_auth_invalid",
                "details": "Missing Telegram auth hash.",
            }
        )

    try:
        auth_date = int(payload.get("auth_date"))
    except (TypeError, ValueError):
        raise ValidationError(
            {
                "is_error": True,
                "message": "telegram_auth_invalid",
                "details": "Invalid Telegram auth date.",
            }
        )

    now = int(time.time())
    if auth_date > now + 60:
        raise ValidationError(
            {
                "is_error": True,
                "message": "telegram_auth_invalid",
                "details": "Telegram auth date is in the future.",
            }
        )
    if now - auth_date > max_age_seconds:
        raise ValidationError(
            {
                "is_error": True,
                "message": "telegram_auth_expired",
                "details": "Telegram sign-in expired. Try again.",
            }
        )

    check_string = _build_data_check_string(payload)
    secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
    computed = hmac.new(
        secret_key, check_string.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(computed, str(received_hash)):
        raise ValidationError(
            {
                "is_error": True,
                "message": "telegram_auth_invalid",
                "details": "Telegram sign-in could not be verified.",
            }
        )

    try:
        telegram_user_id = int(payload.get("id"))
    except (TypeError, ValueError):
        raise ValidationError(
            {
                "is_error": True,
                "message": "telegram_auth_invalid",
                "details": "Invalid Telegram user id.",
            }
        )

    return {
        "telegram_user_id": telegram_user_id,
        "auth_date": auth_date,
        "username": payload.get("username"),
        "first_name": payload.get("first_name"),
        "last_name": payload.get("last_name"),
        "photo_url": payload.get("photo_url"),
    }

"""Shared Telegram login user resolution and widget verification."""

from __future__ import annotations

from typing import Any

from rest_framework.exceptions import ValidationError

from app_auth.models import User
from app_organization.models import Organization
from app_telegram.login_widget import verify_telegram_login_widget


def _validation_error(message: str, details: str) -> ValidationError:
    return ValidationError(
        {
            "is_error": True,
            "message": message,
            "details": details,
        }
    )


def assert_telegram_login_enabled(org: Organization) -> str:
    if not org.is_telegram_login_on:
        raise _validation_error(
            "telegram_login_disabled",
            "Telegram login is not enabled for this school.",
        )
    bot_token = org.get_telegram_bot_token()
    if not bot_token or not org.telegram_bot_username:
        raise _validation_error(
            "telegram_login_disabled",
            "Telegram login is not configured for this school.",
        )
    return bot_token


def widget_payload_from_attrs(attrs: dict[str, Any]) -> dict[str, str]:
    widget_payload: dict[str, str] = {
        "id": str(attrs["id"]),
        "auth_date": str(attrs["auth_date"]),
        "hash": attrs["hash"],
    }
    for key in ("first_name", "last_name", "username", "photo_url"):
        value = attrs.get(key)
        if value:
            widget_payload[key] = str(value)
    return widget_payload


def resolve_telegram_login_user(org: Organization, verified: dict[str, Any]) -> User:
    user = User.objects.filter(telegram_user_id=verified["telegram_user_id"]).first()
    if not user:
        raise _validation_error(
            "telegram_not_linked",
            (
                "No account is linked to this Telegram user. "
                "Sign in another way, then connect Telegram on your profile."
            ),
        )
    if not user.is_active:
        if user.is_waiting_for_activation:
            raise _validation_error(
                "awaiting_activation",
                (
                    "Your registration is pending administrator approval. "
                    "You will receive an email when your account is activated."
                ),
            )
        raise _validation_error(
            "inactive_user",
            (
                "Your account is currently disabled. "
                "Please contact your administrator."
            ),
        )
    if org.is_microsoft_on and not user.microsoft_id:
        raise _validation_error(
            "microsoft_link_required",
            (
                "Link your Microsoft account on your profile before "
                "signing in with Telegram."
            ),
        )
    return user


def verify_widget_and_resolve_user(
    org: Organization,
    widget_attrs: dict[str, Any],
) -> User:
    bot_token = assert_telegram_login_enabled(org)
    verified = verify_telegram_login_widget(
        widget_payload_from_attrs(widget_attrs),
        bot_token=bot_token,
    )
    return resolve_telegram_login_user(org, verified)

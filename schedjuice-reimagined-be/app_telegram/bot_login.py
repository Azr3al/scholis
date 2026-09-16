"""Mobile Telegram bot OTP login (pairing code + t.me start deep link)."""

from __future__ import annotations

import hashlib
import logging
import random
import secrets
import string
from datetime import timedelta
from typing import Any
from uuid import UUID

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from app_auth.models import User
from app_organization.models import Organization
from app_telegram.client import TelegramClient
from app_telegram.login_user import assert_telegram_login_enabled, resolve_telegram_login_user
from app_telegram.models import TelegramLoginSession

logger = logging.getLogger(__name__)

PAIRING_TTL_MINUTES = 10
OTP_TTL_MINUTES = 5
OTP_LENGTH = 6
PAIRING_CODE_LENGTH = 6
_PAIRING_ALPHABET = string.ascii_uppercase + string.digits
LOGIN_START_PREFIX = "login_"
_RATE_LIMIT_PREFIX = "telegram_bot_login:chat:"
_RATE_LIMIT_SECONDS = 30


def build_login_start_payload(pairing_code: str) -> str:
    return f"{LOGIN_START_PREFIX}{pairing_code.strip().upper()}"


def parse_login_start_payload(payload: str | None) -> str | None:
    if not payload:
        return None
    trimmed = payload.strip()
    if not trimmed.startswith(LOGIN_START_PREFIX):
        return None
    code = trimmed[len(LOGIN_START_PREFIX) :].strip().upper()
    if len(code) != PAIRING_CODE_LENGTH or not all(c in _PAIRING_ALPHABET for c in code):
        return None
    return code


def build_telegram_login_deep_link(bot_username: str, pairing_code: str) -> str:
    normalized_bot = bot_username.strip().lstrip("@")
    start_payload = build_login_start_payload(pairing_code)
    return f"https://t.me/{normalized_bot}?start={start_payload}"


def _validation_error(message: str, details: str) -> ValidationError:
    return ValidationError(
        {
            "is_error": True,
            "message": message,
            "details": details,
        }
    )


def _hash_otp(session_id: str, otp: str) -> str:
    pepper = getattr(settings, "SECRET_KEY", "")
    digest = hashlib.sha256(f"{pepper}:{session_id}:{otp}".encode("utf-8")).hexdigest()
    return digest


def _generate_pairing_code() -> str:
    return "".join(
        secrets.choice(_PAIRING_ALPHABET) for _ in range(PAIRING_CODE_LENGTH)
    )


def _generate_otp() -> str:
    return "".join(str(random.randint(0, 9)) for _ in range(OTP_LENGTH))


def _active_sessions():
    now = timezone.now()
    return TelegramLoginSession.objects.filter(
        consumed_at__isnull=True,
        expires_at__gt=now,
    )


def create_bot_login_session(org: Organization) -> dict[str, Any]:
    assert_telegram_login_enabled(org)
    bot_username = org.telegram_bot_username.strip().lstrip("@")

    for _ in range(8):
        pairing_code = _generate_pairing_code()
        if not _active_sessions().filter(pairing_code=pairing_code).exists():
            break
    else:
        raise _validation_error(
            "bot_session_invalid",
            "Could not start Telegram sign-in. Try again.",
        )

    session = TelegramLoginSession.objects.create(
        pairing_code=pairing_code,
        expires_at=timezone.now() + timedelta(minutes=PAIRING_TTL_MINUTES),
    )
    return {
        "session_id": str(session.session_id),
        "pairing_code": pairing_code,
        "bot_username": bot_username,
        "expires_at": session.expires_at.isoformat(),
        "telegram_deep_link": build_telegram_login_deep_link(bot_username, pairing_code),
    }


def _rate_limit_key(chat_id: int) -> str:
    return f"{_RATE_LIMIT_PREFIX}{chat_id}"


def handle_login_command(tenant: Organization, message: dict, code: str | None) -> None:
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    from_user = message.get("from") or {}
    tg_user_id = from_user.get("id")

    if chat_id is None or tg_user_id is None:
        return

    if not code:
        _reply(
            tenant,
            chat_id,
            "That sign-in link is invalid. Start again from the app.",
        )
        return

    if cache.get(_rate_limit_key(chat_id)):
        _reply(
            tenant,
            chat_id,
            "Please wait a moment before requesting another sign-in code.",
        )
        return

    user = User.objects.filter(
        telegram_chat_id=chat_id,
        telegram_user_id=tg_user_id,
    ).first()
    if user is None:
        _reply(
            tenant,
            chat_id,
            (
                f"Your Telegram isn't linked to {tenant.name} yet. "
                "Sign in on the web or app, then connect Telegram on your profile."
            ),
        )
        return

    normalized_code = code.strip().upper()
    session = (
        _active_sessions()
        .filter(pairing_code=normalized_code)
        .select_related("user")
        .first()
    )
    if session is None:
        _reply(
            tenant,
            chat_id,
            "That sign-in code is invalid or expired. Start again from the app.",
        )
        return

    if session.user_id is not None and session.user_id != user.id:
        _reply(
            tenant,
            chat_id,
            "That sign-in code is already in use. Start again from the app.",
        )
        return

    otp = _generate_otp()
    session.user = user
    session.otp_hash = _hash_otp(str(session.session_id), otp)
    session.otp_sent_at = timezone.now()
    session.save(
        update_fields=["user", "otp_hash", "otp_sent_at"],
    )

    cache.set(_rate_limit_key(chat_id), True, timeout=_RATE_LIMIT_SECONDS)

    _reply(
        tenant,
        chat_id,
        f"Your {tenant.name} sign-in code is: {otp}\n\nEnter it in the app. It expires in {OTP_TTL_MINUTES} minutes.",
    )


def verify_bot_login(
    org: Organization,
    *,
    session_id: str,
    otp: str,
) -> User:
    assert_telegram_login_enabled(org)

    trimmed_id = (session_id or "").strip()
    trimmed_otp = (otp or "").strip()
    if not trimmed_id or not trimmed_otp:
        raise _validation_error(
            "bot_otp_invalid",
            "Sign-in code is required.",
        )

    try:
        parsed_id = UUID(trimmed_id)
    except ValueError as exc:
        raise _validation_error(
            "bot_session_invalid",
            "Telegram sign-in session is invalid.",
        ) from exc

    session = TelegramLoginSession.objects.filter(session_id=parsed_id).first()
    if session is None:
        raise _validation_error(
            "bot_session_invalid",
            "Telegram sign-in session is invalid.",
        )
    if session.consumed_at is not None:
        raise _validation_error(
            "bot_session_invalid",
            "Telegram sign-in session was already used.",
        )
    if session.expires_at <= timezone.now():
        raise _validation_error(
            "bot_session_expired",
            "Telegram sign-in expired. Try again.",
        )
    if session.user_id is None or not session.otp_sent_at:
        raise _validation_error(
            "bot_otp_invalid",
            "Open the sign-in link from the app in Telegram first.",
        )
    otp_deadline = session.otp_sent_at + timedelta(minutes=OTP_TTL_MINUTES)
    if timezone.now() > otp_deadline:
        raise _validation_error(
            "bot_session_expired",
            "Telegram sign-in code expired. Try again.",
        )

    expected_hash = _hash_otp(str(session.session_id), trimmed_otp)
    if not secrets.compare_digest(session.otp_hash, expected_hash):
        raise _validation_error(
            "bot_otp_invalid",
            "That sign-in code is incorrect.",
        )

    user = session.user
    verified = resolve_telegram_login_user(
        org,
        {"telegram_user_id": user.telegram_user_id},
    )

    session.consumed_at = timezone.now()
    session.save(update_fields=["consumed_at"])
    return verified


def _reply(tenant: Organization, chat_id: int, text: str) -> None:
    try:
        TelegramClient(tenant).send_message(chat_id, text)
    except Exception:
        logger.exception("telegram: failed to send bot login reply")

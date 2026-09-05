"""Course <-> Telegram group linking via the startgroup&admin deep link."""
from __future__ import annotations

import logging
from datetime import timedelta

from django.utils import timezone

from app_course.models import Course
from app_telegram.client import TelegramClient
from app_telegram.models import TelegramPendingGroupLink

logger = logging.getLogger(__name__)
PENDING_TTL_MINUTES = 30
ADMIN_RIGHTS = "restrict_members+invite_users+delete_messages+pin_messages"


def build_group_link_deeplink(bot_username: str) -> str:
    return f"https://t.me/{bot_username}?startgroup&admin={ADMIN_RIGHTS}"


def start_group_link(course, initiated_by, bot_username: str) -> str:
    """Create (or refresh) the single active pending link for this admin."""
    TelegramPendingGroupLink.objects.filter(
        initiated_by=initiated_by,
        consumed_at__isnull=True,
    ).update(consumed_at=timezone.now())
    TelegramPendingGroupLink.objects.create(
        course=course,
        initiated_by=initiated_by,
        expires_at=timezone.now() + timedelta(minutes=PENDING_TTL_MINUTES),
    )
    return build_group_link_deeplink(bot_username)


def handle_my_chat_member(tenant, payload: dict) -> None:
    """Bot membership changed. Detect 'added as admin' and link the course."""
    new = payload.get("new_chat_member") or {}
    old = payload.get("old_chat_member") or {}
    member = new.get("user") or {}
    if not member.get("is_bot"):
        return

    new_status = new.get("status")
    was_present = old.get("status") in {"member", "administrator"}
    now_present = new_status in {"member", "administrator"}

    chat = payload.get("chat") or {}
    actor_id = (payload.get("from") or {}).get("id")

    if was_present and not now_present:
        _unlink_chat(chat.get("id"))
        return

    if not now_present:
        return

    pending = (
        TelegramPendingGroupLink.objects.select_related("course", "initiated_by")
        .filter(
            initiated_by__telegram_user_id=actor_id,
            consumed_at__isnull=True,
            expires_at__gt=timezone.now(),
        )
        .order_by("-created_at")
        .first()
    )
    if pending is None:
        logger.info(
            "telegram: bot added to chat %s but no pending link for actor %s",
            chat.get("id"),
            actor_id,
        )
        return

    client = TelegramClient(tenant)
    course = pending.course
    course.telegram_chat_id = chat.get("id")
    course.telegram_chat_title = chat.get("title")
    course.telegram_linked_at = timezone.now()

    if new_status == "administrator":
        try:
            res = client.create_chat_invite_link(chat["id"], name=course.title)
            course.telegram_invite_link = res.get("invite_link")
        except Exception:
            logger.exception(
                "telegram: could not create invite link for chat %s", chat.get("id")
            )

    course.save(
        update_fields=[
            "telegram_chat_id",
            "telegram_chat_title",
            "telegram_invite_link",
            "telegram_linked_at",
        ]
    )
    pending.consumed_at = timezone.now()
    pending.save(update_fields=["consumed_at"])

    try:
        msg = f"Linked to course: {course.title}."
        if new_status != "administrator":
            msg += " Please make me an admin so I can manage the teacher roster."
        client.send_message(chat["id"], msg)
    except Exception:
        logger.exception("telegram: could not post link confirmation")


def _unlink_chat(chat_id) -> None:
    if chat_id is None:
        return
    Course.objects.filter(telegram_chat_id=chat_id).update(
        telegram_chat_id=None,
        telegram_chat_title=None,
        telegram_invite_link=None,
        telegram_linked_at=None,
    )

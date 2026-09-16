"""Teacher roster sync: join-request gating + kick on unassign."""
from __future__ import annotations

import logging

from app_auth.models import User
from app_course.models import Course, UserCourse
from app_telegram.client import TelegramClient

logger = logging.getLogger(__name__)


def _is_active_teacher(course, telegram_user_id: int) -> bool:
    user = User.objects.filter(telegram_user_id=telegram_user_id).first()
    if user is None:
        return False
    return UserCourse.objects.filter(
        course=course,
        user=user,
        assigned_as=UserCourse.AssignedAs.TEACHER,
    ).exists()


def handle_join_request(tenant, payload: dict) -> None:
    if not tenant.is_telegram_roster_sync_enabled:
        return
    chat = payload.get("chat") or {}
    requester = (payload.get("from") or {}).get("id")
    course = Course.objects.filter(telegram_chat_id=chat.get("id")).first()
    if course is None or requester is None:
        return
    client = TelegramClient(tenant)
    try:
        if _is_active_teacher(course, requester):
            client.approve_chat_join_request(chat["id"], requester)
        else:
            client.decline_chat_join_request(chat["id"], requester)
    except Exception:
        logger.exception(
            "telegram: join-request handling failed for chat %s", chat.get("id")
        )

"""Post an Announcement to its course's Telegram group."""
from __future__ import annotations

from app_announcement.models import Announcement
from app_telegram.client import TelegramClient
from utilitas.async_tasks import django_q_task, tenant_async


@django_q_task
@tenant_async(entity=Announcement)
def send_announcement_to_telegram(announcement, tenant):
    if not tenant.is_telegram_on:
        return
    course = announcement.course
    if course is None or not course.telegram_chat_id:
        return
    body = announcement.data or ""
    text = f"<b>{announcement.title}</b>\n{body}".strip()
    TelegramClient(tenant).send_message(course.telegram_chat_id, text)

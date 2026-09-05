"""
Helpers for sending announcement push notifications via Expo.
"""

import html
import logging
import re

from django.utils.html import strip_tags

from tenant_schemas.utils import schema_context

from app_announcement.models import Announcement
from app_course.models import UserCourse
from app_auth.models import User

logger = logging.getLogger(__name__)


def _html_to_plain_preview(fragment: str | None, *, max_len: int = 200) -> str:
    """Strip HTML and collapse whitespace for push notification body (Expo expects plain text)."""
    if not fragment or not str(fragment).strip():
        return ""
    raw = str(fragment)
    # Normalize breaks so words don't run together after tag stripping
    text = re.sub(r"<br\s*/?>", " ", raw, flags=re.IGNORECASE)
    text = re.sub(r"</p\s*>", " ", text, flags=re.IGNORECASE)
    text = strip_tags(text)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_len]


def send_announcement_push_notifications(announcement_id: int, schema_name: str) -> None:
    """
    Send Expo push notifications for a new announcement.
    - If announcement.course_id is null (org-wide): send to all active users.
    - If announcement.course_id is set: send to course members only.
    """
    with schema_context(schema_name):
        try:
            announcement = Announcement.objects.select_related("course").get(
                id=announcement_id
            )
        except Announcement.DoesNotExist:
            logger.warning("Announcement %s not found for push", announcement_id)
            return

        title = announcement.title or "New announcement"
        content_src = (announcement.data or announcement.html_data or "").strip()
        body = _html_to_plain_preview(content_src)

        if announcement.course_id is None:
            # Org-wide: all active users
            user_ids = User.objects.filter(is_active=True).values_list("id", flat=True)
        else:
            # Course-specific: course members (teachers + students)
            user_ids = UserCourse.objects.filter(
                course_id=announcement.course_id
            ).values_list("user_id", flat=True).distinct()

        from app_utils.push_helpers import enqueue_push_for_user_ids

        recipient_ids = list(user_ids)
        if not recipient_ids:
            return

        enqueue_push_for_user_ids(
            recipient_ids,
            title=title,
            body=body,
            data={
                "type": "announcement",
                "announcementId": announcement_id,
                "courseId": announcement.course_id,
            },
        )
        logger.info(
            "Queued push notifications for announcement %s to %d users",
            announcement_id,
            len(recipient_ids),
        )

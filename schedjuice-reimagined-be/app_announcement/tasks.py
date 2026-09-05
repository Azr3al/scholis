"""
Celery tasks for announcements (Expo push fan-out).

Scheduled with transaction.on_commit so workers always see committed rows.
"""

from celery import shared_task


@shared_task(bind=True, ignore_result=True)
def send_announcement_push_notifications_task(
    self, announcement_id: int, schema_name: str
) -> None:
    from app_announcement.push_helpers import send_announcement_push_notifications

    send_announcement_push_notifications(announcement_id, schema_name)

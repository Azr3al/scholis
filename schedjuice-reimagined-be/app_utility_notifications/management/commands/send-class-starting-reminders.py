import logging

from django.core.management.base import BaseCommand
from django.utils import timezone

from app_utility_notifications.class_starting_soon_cron import (
    send_class_starting_soon_reminder_pushes,
)
from app_utility_notifications.cron_helpers import get_current_org

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    def handle(self, *args, **options):
        logger.info("Running [send-class-starting-reminders]")
        org = get_current_org()
        if not org:
            logger.warning("No organization for current schema; skipping")
            return

        now = timezone.now()
        tenant_tz = org.timezone or "UTC"
        sent, skipped = send_class_starting_soon_reminder_pushes(
            now=now,
            tenant_tz=tenant_tz,
        )
        logger.info(
            "send-class-starting-reminders complete: sent=%d skipped=%d",
            sent,
            skipped,
        )

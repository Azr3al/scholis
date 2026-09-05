"""
Delete expo notification history older than 2 weeks.

Message deletion cascades to Ticket and Receipt. Runs per tenant schema.
"""
import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import connection
from django.utils import timezone

logger = logging.getLogger(__name__)

RETENTION_DAYS = 14


class Command(BaseCommand):
    help = "Delete expo notification history (Message, Ticket, Receipt) older than 2 weeks"

    def handle(self, *args, **options):
        logger.info("Running [cleanup_expo-notifications]")
        cutoff = timezone.now() - timedelta(days=RETENTION_DAYS)
        schema_name = connection.schema_name

        total_deleted = 0
        try:
            from expo_notifications.models import Message

            deleted, _ = Message.objects.filter(
                date_created__lt=cutoff
            ).delete()
            total_deleted += deleted
            if deleted:
                logger.info(
                    f"[{schema_name}] Deleted {deleted} notification records"
                )
        except Exception as e:
            logger.warning(
                f"[{schema_name}] Skipped (expo_notifications may not be migrated): {e}"
            )

        self.stdout.write(
            self.style.SUCCESS(f"Cleanup complete. Total records deleted: {total_deleted}")
        )

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from app_announcement.models import AnnouncementAttachment


class Command(BaseCommand):
    help = "Delete unclaimed staging announcement attachments older than 24 hours."

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(hours=24)
        qs = AnnouncementAttachment.objects.filter(
            announcement__isnull=True,
            created_at__lt=cutoff,
        )
        count, _ = qs.delete()
        self.stdout.write(
            self.style.SUCCESS(f"Deleted {count} stale staging announcement attachment(s).")
        )

import logging

from django.core.management.base import BaseCommand
from django.utils import timezone

from app_auth.models import User
from app_utility_notifications.cron_helpers import (
    _org_local_hour,
    _tenant_today_date,
    get_current_org,
    send_utility_pushes_for_users,
)
from app_utility_notifications.utility_notification_kinds import UtilityNotificationKind

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    def handle(self, *args, **options):
        logger.info("Running [send-assignment-due-reminders]")
        org = get_current_org()
        if not org:
            logger.warning("No organization for current schema; skipping")
            return

        now = timezone.now()
        tenant_tz = org.timezone or "UTC"
        if _org_local_hour(now, tenant_tz) != 18:
            logger.info("Skipping send-assignment-due-reminders: org-local hour is not 18")
            return

        sent, skipped = send_utility_pushes_for_users(
            users_qs=User.objects.filter(is_active=True),
            kinds_filter={UtilityNotificationKind.ASSIGNMENT_DUE.value},
            now=now,
            tenant_tz=tenant_tz,
            sent_on_date=_tenant_today_date(now, tenant_tz),
        )
        logger.info(
            "send-assignment-due-reminders complete: sent=%d skipped=%d",
            sent,
            skipped,
        )

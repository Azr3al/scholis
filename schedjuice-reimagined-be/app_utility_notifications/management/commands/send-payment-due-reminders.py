import logging

from django.core.management.base import BaseCommand
from django.utils import timezone

from app_auth.models import User
from app_utility_notifications.cron_helpers import (
    _org_local_hour,
    _org_local_weekday,
    _tenant_today_date,
    get_current_org,
    send_utility_pushes_for_users,
)
from app_utility_notifications.utility_notification_kinds import UtilityNotificationKind

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    def handle(self, *args, **options):
        logger.info("Running [send-payment-due-reminders]")
        org = get_current_org()
        if not org:
            logger.warning("No organization for current schema; skipping")
            return

        now = timezone.now()
        tenant_tz = org.timezone or "UTC"
        if _org_local_weekday(now, tenant_tz) != 0 or _org_local_hour(now, tenant_tz) != 9:
            logger.info(
                "Skipping send-payment-due-reminders: not Monday 09:00 org-local"
            )
            return

        sent, skipped = send_utility_pushes_for_users(
            users_qs=User.objects.filter(is_active=True),
            kinds_filter={
                UtilityNotificationKind.PAYMENT_PENDING.value,
                UtilityNotificationKind.PAYMENT_PENDING_VERIFICATION.value,
            },
            now=now,
            tenant_tz=tenant_tz,
            sent_on_date=_tenant_today_date(now, tenant_tz),
        )
        logger.info(
            "send-payment-due-reminders complete: sent=%d skipped=%d",
            sent,
            skipped,
        )

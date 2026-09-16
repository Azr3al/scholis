import logging

from django.core.management.base import BaseCommand
from django.db.models import Min
from django.utils import timezone

from app_auth.models import User
from app_finance.models import Billing
from app_tasks.billing_helpers import active_user_count_for_billing_date, iter_inclusive_dates

logger = logging.getLogger(__name__)


def _get_current_org():
    from django.db import connection
    from tenant_schemas.utils import get_public_schema_name, schema_context
    from app_organization.models import Organization
    tenant_schema = connection.schema_name
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=tenant_schema).first()


class Command(BaseCommand):
    def handle(self, *args, **options):
        logger.info("Running [record_daily_billing]")

        org = _get_current_org()
        schema_name = org.schema_name if org else None

        if not schema_name:
            logger.warning("Skipping due to missing schema_name.")
            return

        logger.info(f"Processing billing for organization in schema [{schema_name}]")

        cost = getattr(org, "cost_per_account_per_day", 0) or 0
        if not cost:
            logger.info(f"[{schema_name}] cost_per_account_per_day is unset or zero; skipping.")
            return

        end_date = timezone.localdate()
        live_active_user_count = User.objects.filter(is_active=True).count()

        if not Billing.objects.exists():
            _, created = Billing.objects.get_or_create(
                billing_date=end_date,
                defaults={
                    "active_user_count": live_active_user_count,
                    "cost_per_account_at_creation": cost,
                },
            )
            if created:
                self._log_created(schema_name, end_date, live_active_user_count, cost)
            else:
                self._log_skipped(schema_name, end_date)
            return

        start_date = Billing.objects.aggregate(m=Min("billing_date"))["m"]
        for d in iter_inclusive_dates(start_date, end_date):
            if Billing.objects.filter(billing_date=d).exists():
                continue
            active = active_user_count_for_billing_date(
                d,
                end_date=end_date,
                live_active_user_count=live_active_user_count,
            )
            _, created = Billing.objects.get_or_create(
                billing_date=d,
                defaults={
                    "active_user_count": active,
                    "cost_per_account_at_creation": cost,
                },
            )
            if created:
                self._log_created(schema_name, d, active, cost)
            else:
                self._log_skipped(schema_name, d)

    def _log_created(self, schema_name, billing_date, active, cost):
        logger.info(
            f"[{schema_name}] Billing recorded: active_users={active}, cost={cost}, billing_date={billing_date}"
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"[{schema_name}] Recorded Billing: active={active}, cost={cost}, billing_date={billing_date}"
            )
        )

    def _log_skipped(self, schema_name, billing_date):
        logger.info(
            f"[{schema_name}] Billing already exists for billing_date={billing_date}; skipping duplicate."
        )
        self.stdout.write(
            self.style.WARNING(
                f"[{schema_name}] Billing already exists for billing_date={billing_date}; skipped."
            )
        )

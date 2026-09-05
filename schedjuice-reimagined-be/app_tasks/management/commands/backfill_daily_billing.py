import logging
from datetime import datetime

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from app_auth.models import User
from app_finance.models import Billing
from app_organization.models import Organization
from app_tasks.billing_helpers import active_user_count_for_billing_date, iter_inclusive_dates
from tenant_schemas.utils import get_public_schema_name, schema_context

logger = logging.getLogger(__name__)


def _parse_date(value):
    if value is None:
        return None
    if hasattr(value, "year"):
        return value
    if isinstance(value, str):
        return datetime.strptime(value.strip()[:10], "%Y-%m-%d").date()
    raise CommandError(f"Invalid date value: {value!r}")


def _backfill_for_schema(
    *,
    schema_name: str,
    from_date,
    to_date,
    dry_run: bool,
    stdout,
    style,
):
    with schema_context(get_public_schema_name()):
        org = Organization.objects.filter(schema_name=schema_name).first()
    if not org:
        raise CommandError(f"Organization not found for schema_name={schema_name!r}")

    cost = getattr(org, "cost_per_account_per_day", 0) or 0
    if not cost:
        msg = f"[{schema_name}] cost_per_account_per_day is unset or zero; skipping."
        logger.info(msg)
        stdout.write(style.WARNING(msg))
        return 0

    created_or_would = 0
    with schema_context(schema_name):
        end_today = timezone.localdate()
        live_active_user_count = User.objects.filter(is_active=True).count()

        for d in iter_inclusive_dates(from_date, to_date):
            if Billing.objects.filter(billing_date=d).exists():
                continue
            active = active_user_count_for_billing_date(
                d,
                end_date=end_today,
                live_active_user_count=live_active_user_count,
            )
            if dry_run:
                stdout.write(
                    f"[{schema_name}] would create billing_date={d} active_user_count={active} (estimate)\n"
                )
                created_or_would += 1
                continue
            _, created = Billing.objects.get_or_create(
                billing_date=d,
                defaults={
                    "active_user_count": active,
                    "cost_per_account_at_creation": cost,
                },
            )
            if created:
                logger.info(
                    f"[{schema_name}] Backfill billing_date={d} active_users={active} cost={cost}"
                )
                stdout.write(
                    style.SUCCESS(
                        f"[{schema_name}] Created billing_date={d} active={active} cost={cost}"
                    )
                )
                created_or_would += 1

    return created_or_would


class Command(BaseCommand):
    help = (
        "Backfill missing Billing rows between --from-date and --to-date (inclusive). "
        "Uses the same active_user_count heuristic as record_daily_billing."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--from-date",
            dest="from_date",
            required=True,
            help="Start date (YYYY-MM-DD), inclusive.",
        )
        parser.add_argument(
            "--to-date",
            dest="to_date",
            required=True,
            help="End date (YYYY-MM-DD), inclusive.",
        )
        parser.add_argument(
            "--schema",
            dest="schema",
            default=None,
            help="Tenant schema name; omit to run for all organizations.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print rows that would be created without writing.",
        )

    def handle(self, *args, **options):
        from_date = _parse_date(options["from_date"])
        to_date = _parse_date(options["to_date"])
        if from_date > to_date:
            raise CommandError("--from-date must be on or before --to-date")

        schema = options.get("schema")
        dry_run = options.get("dry_run", False)

        with schema_context(get_public_schema_name()):
            if schema:
                orgs = list(Organization.objects.filter(schema_name=schema))
                if not orgs:
                    raise CommandError(f"No organization found for schema={schema!r}")
            else:
                orgs = list(Organization.objects.all())

        total = 0
        for org in orgs:
            total += _backfill_for_schema(
                schema_name=org.schema_name,
                from_date=from_date,
                to_date=to_date,
                dry_run=dry_run,
                stdout=self.stdout,
                style=self.style,
            )

        suffix = "would be created" if dry_run else "created"
        self.stdout.write(self.style.SUCCESS(f"Done. Rows {suffix}: {total}."))

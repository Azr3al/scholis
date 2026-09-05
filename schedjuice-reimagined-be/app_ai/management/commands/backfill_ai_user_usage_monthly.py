from django.core.management.base import BaseCommand
from django.db.models import Count, Sum
from django.db.models.functions import ExtractMonth, ExtractYear
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.models import AIUsageLog, AIUserUsageMonthly
from app_organization.models import Organization


class Command(BaseCommand):
    help = "Backfill AIUserUsageMonthly rollups from AIUsageLog."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--schema", type=str, default="")
        parser.add_argument("--year", type=int, default=0)
        parser.add_argument("--month", type=int, default=0)

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        schema_filter = (options["schema"] or "").strip()
        year_filter = options["year"] or None
        month_filter = options["month"] or None

        with schema_context(get_public_schema_name()):
            orgs = list(Organization.objects.all())
            if schema_filter:
                orgs = [org for org in orgs if org.schema_name == schema_filter]

        created = 0
        updated = 0
        for org in orgs:
            with schema_context(get_public_schema_name()):
                log_qs = AIUsageLog.objects.filter(
                    tenant=org,
                    user_id__isnull=False,
                )
                if year_filter:
                    log_qs = log_qs.filter(created_at__year=year_filter)
                if month_filter:
                    log_qs = log_qs.filter(created_at__month=month_filter)

                rows = (
                    log_qs.annotate(
                        year=ExtractYear("created_at"),
                        month=ExtractMonth("created_at"),
                    )
                    .values("user_id", "year", "month")
                    .annotate(
                        input_tokens=Sum("input_tokens"),
                        output_tokens=Sum("output_tokens"),
                        thinking_tokens=Sum("thinking_tokens"),
                        cached_input_tokens=Sum("cached_input_tokens"),
                        total_tokens=Sum("total_tokens"),
                        total_cost_usd=Sum("computed_cost_usd"),
                        total_billed_usd=Sum("billed_cost_usd"),
                        request_count=Count("id"),
                    )
                )

                for row in rows:
                    year = int(row["year"])
                    month = int(row["month"])
                    user_id = row["user_id"]
                    defaults = {
                        "input_tokens": row["input_tokens"] or 0,
                        "output_tokens": row["output_tokens"] or 0,
                        "thinking_tokens": row["thinking_tokens"] or 0,
                        "cached_input_tokens": row["cached_input_tokens"] or 0,
                        "total_tokens": row["total_tokens"] or 0,
                        "total_cost_usd": row["total_cost_usd"] or 0,
                        "total_billed_usd": row["total_billed_usd"] or 0,
                        "request_count": row["request_count"] or 0,
                    }
                    if dry_run:
                        exists = AIUserUsageMonthly.objects.filter(
                            tenant=org,
                            user_id=user_id,
                            year=year,
                            month=month,
                        ).exists()
                        if exists:
                            updated += 1
                        else:
                            created += 1
                        continue

                    _, was_created = AIUserUsageMonthly.objects.update_or_create(
                        tenant=org,
                        user_id=user_id,
                        year=year,
                        month=month,
                        defaults=defaults,
                    )
                    if was_created:
                        created += 1
                    else:
                        updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"AI user usage monthly backfill complete "
                f"(created={created}, updated={updated}, dry_run={dry_run})"
            )
        )

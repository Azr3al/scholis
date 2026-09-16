from django.core.management.base import BaseCommand
from django.utils.dateparse import parse_datetime
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.failure_causes import (
    LIKELY_CAUSE_COMPLEX_TASK,
    LIKELY_CAUSE_TOOL_DESCRIPTIONS,
    LIKELY_CAUSE_UNKNOWN,
    classify_tool_limit_causes,
)
from app_ai.models import AIRequestLog


class Command(BaseCommand):
    help = "Recompute likely_causes on tool_limit_exceeded AIRequestLog rows."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--since", type=str, default="")
        parser.add_argument("--until", type=str, default="")

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        since = parse_datetime(options["since"]) if options["since"] else None
        until = parse_datetime(options["until"]) if options["until"] else None

        with schema_context(get_public_schema_name()):
            qs = AIRequestLog.objects.filter(
                outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
            )
            if since:
                qs = qs.filter(created_at__gte=since)
            if until:
                qs = qs.filter(created_at__lt=until)

            updated = 0
            counts = {
                LIKELY_CAUSE_TOOL_DESCRIPTIONS: 0,
                LIKELY_CAUSE_COMPLEX_TASK: 0,
                LIKELY_CAUSE_UNKNOWN: 0,
            }
            batch: list[AIRequestLog] = []

            for row in qs.iterator(chunk_size=500):
                new_causes = classify_tool_limit_causes(row.tool_calls)
                for code in new_causes:
                    counts[code] = counts.get(code, 0) + 1
                if row.likely_causes != new_causes:
                    row.likely_causes = new_causes
                    batch.append(row)
                    updated += 1
                if len(batch) >= 500:
                    if not dry_run:
                        AIRequestLog.objects.bulk_update(batch, ["likely_causes"])
                    batch = []

            if batch and not dry_run:
                AIRequestLog.objects.bulk_update(batch, ["likely_causes"])

        self.stdout.write(
            self.style.SUCCESS(
                f"reclassify complete updated={updated} dry_run={dry_run} "
                f"tool_descriptions={counts[LIKELY_CAUSE_TOOL_DESCRIPTIONS]} "
                f"complex_task={counts[LIKELY_CAUSE_COMPLEX_TASK]} "
                f"unknown={counts[LIKELY_CAUSE_UNKNOWN]}"
            )
        )

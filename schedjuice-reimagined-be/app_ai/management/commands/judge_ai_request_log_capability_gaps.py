from __future__ import annotations

from collections import Counter

from django.core.management.base import BaseCommand
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.capability_gap.constants import (
    CAPABILITY_GAP_ACCESS_POLICY,
    CAPABILITY_GAP_DATA_NOT_EXPOSED,
    CAPABILITY_GAP_FEATURE_UNAVAILABLE,
    CAPABILITY_GAP_MISSING_TOOL,
    CAPABILITY_GAP_UNKNOWN,
)
from app_ai.capability_gap.history import build_judge_history_for_request_log
from app_ai.capability_gap.judge import judge_capability_gap
from app_ai.models import AIRequestLog
from app_ai.tools.registry import list_tools


class Command(BaseCommand):
    help = "Run capability gap judge on historical success AIRequestLog rows."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--since", type=str, default="")
        parser.add_argument("--until", type=str, default="")
        parser.add_argument("--batch-size", type=int, default=500)
        parser.add_argument(
            "--feature",
            type=str,
            default="telegram_query",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        batch_size = max(options["batch_size"], 1)
        feature = options["feature"]
        category_counts: Counter[str] = Counter()
        processed = 0
        gaps_found = 0

        with schema_context(get_public_schema_name()):
            qs = AIRequestLog.objects.filter(
                outcome=AIRequestLog.Outcome.SUCCESS,
                feature=feature,
            ).select_related("tenant")
            if options["since"]:
                qs = qs.filter(created_at__gte=options["since"])
            if options["until"]:
                qs = qs.filter(created_at__lt=options["until"])

            total = qs.count()
            self.stdout.write(f"Rows to process: {total}")

            batch: list[AIRequestLog] = []
            for row in qs.iterator(chunk_size=batch_size):
                processed += 1
                tool_names = [t.name for t in list_tools()]
                gap = judge_capability_gap(
                    prompt=row.prompt,
                    response_text=row.response_text,
                    tool_calls=row.tool_calls,
                    available_tool_names=tool_names,
                    conversation_history=build_judge_history_for_request_log(
                        row, row.tenant
                    ),
                    org=row.tenant,
                    user=_stub_user(row.user_id),
                )
                if not gap.is_gap:
                    continue
                gaps_found += 1
                for code in gap.capability_gaps:
                    category_counts[code] += 1
                if dry_run:
                    continue
                row.outcome = AIRequestLog.Outcome.CAPABILITY_GAP
                row.capability_gaps = gap.capability_gaps
                row.capability_gap_reason = gap.gap_reason[:2000]
                row.capability_gap_intent = gap.user_intent_summary[:256]
                row.capability_gap_domain = gap.domain[:64]
                row.capability_gap_suggested_surface = gap.suggested_surface[:128]
                batch.append(row)
                if len(batch) >= batch_size:
                    AIRequestLog.objects.bulk_update(
                        batch,
                        [
                            "outcome",
                            "capability_gaps",
                            "capability_gap_reason",
                            "capability_gap_intent",
                            "capability_gap_domain",
                            "capability_gap_suggested_surface",
                        ],
                    )
                    batch = []

            if batch and not dry_run:
                AIRequestLog.objects.bulk_update(
                    batch,
                    [
                        "outcome",
                        "capability_gaps",
                        "capability_gap_reason",
                        "capability_gap_intent",
                        "capability_gap_domain",
                        "capability_gap_suggested_surface",
                    ],
                )

        self.stdout.write(f"Processed: {processed}")
        self.stdout.write(f"Capability gaps found: {gaps_found}")
        for code in (
            CAPABILITY_GAP_MISSING_TOOL,
            CAPABILITY_GAP_DATA_NOT_EXPOSED,
            CAPABILITY_GAP_ACCESS_POLICY,
            CAPABILITY_GAP_FEATURE_UNAVAILABLE,
            CAPABILITY_GAP_UNKNOWN,
        ):
            self.stdout.write(f"  {code}: {category_counts.get(code, 0)}")


def _stub_user(user_id: int | None):
    from types import SimpleNamespace

    return SimpleNamespace(id=user_id or 0)

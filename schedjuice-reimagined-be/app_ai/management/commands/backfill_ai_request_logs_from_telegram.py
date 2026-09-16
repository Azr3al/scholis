from django.core.management.base import BaseCommand
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.failure_causes import classify_tool_limit_causes
from app_ai.models import AIRequestLog
from app_ai.request_log import truncate_text
from app_organization.models import Organization
from app_telegram.models import TelegramAIExchange

TOOL_LIMIT_SUBSTRING = "within the tool limit"


class Command(BaseCommand):
    help = "Backfill AIRequestLog rows from TelegramAIExchange tool-limit replies."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--schema", type=str, default="")

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        schema_filter = (options["schema"] or "").strip()

        with schema_context(get_public_schema_name()):
            orgs = list(Organization.objects.all())
            if schema_filter:
                orgs = [o for o in orgs if o.schema_name == schema_filter]

        created = 0
        skipped = 0
        for org in orgs:
            with schema_context(org.schema_name):
                exchanges = TelegramAIExchange.objects.filter(
                    bot_text__icontains=TOOL_LIMIT_SUBSTRING,
                )
                for ex in exchanges:
                    prompt_prefix = truncate_text(ex.user_text, 500)
                    with schema_context(get_public_schema_name()):
                        exists = AIRequestLog.objects.filter(
                            tenant=org,
                            user_id=ex.user_id,
                            created_at=ex.created_at,
                            prompt__startswith=prompt_prefix[:500],
                            source=AIRequestLog.Source.BACKFILL,
                        ).exists()
                        if exists:
                            skipped += 1
                            continue
                        if dry_run:
                            created += 1
                            continue
                        AIRequestLog.objects.create(
                            tenant=org,
                            user_id=ex.user_id,
                            feature="telegram_query",
                            channel_key=f"telegram:{ex.chat_id}",
                            prompt=truncate_text(ex.user_text),
                            response_text=truncate_text(ex.bot_text),
                            outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
                            tool_iterations=0,
                            tool_calls=[],
                            likely_causes=classify_tool_limit_causes([]),
                            model="",
                            total_tokens=0,
                            latency_ms=0,
                            source=AIRequestLog.Source.BACKFILL,
                            created_at=ex.created_at,
                        )
                        created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"backfill complete created={created} skipped={skipped} dry_run={dry_run}"
            )
        )

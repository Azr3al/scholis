"""
Retry UserPayment rows stuck in cannot_extract by re-enqueueing OCR extraction.

Matches RetryUserPaymentExtractionView: sets status to awaiting_extraction and
calls extract_receiver_ss_text_data.delay.

Usage:
  python manage.py retry_cannot_extract_payments --schema-name xteachersu --dry-run
  python manage.py retry_cannot_extract_payments --schema-name xteachersu --since-date 2026-06-01
  python manage.py retry_cannot_extract_payments --schema-name xteachersu --id 2266
"""

from __future__ import annotations

import logging

from django.core.management import BaseCommand
from django.core.management.base import CommandError
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_finance.models import UserPayment
from app_finance.services import extract_receiver_ss_text_data
from app_organization.models import Organization

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        "Retry UserPayment rows in cannot_extract status by setting "
        "awaiting_extraction and enqueueing OCR extraction."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema-name",
            type=str,
            required=True,
            help="Tenant schema to process (e.g. xteachersu).",
        )
        parser.add_argument(
            "--since-date",
            type=str,
            default=None,
            help="Only rows created on or after YYYY-MM-DD.",
        )
        parser.add_argument(
            "--id",
            type=int,
            default=None,
            help="Retry only this UserPayment id within the schema.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print matching rows without updating status or enqueueing tasks.",
        )

    def handle(self, *args, **options):
        schema_name: str = options["schema_name"]
        since_date: str | None = options.get("since_date")
        payment_id: int | None = options.get("id")
        dry_run: bool = options["dry_run"]

        with schema_context(get_public_schema_name()):
            org = Organization.objects.filter(schema_name=schema_name).first()
        if org is None:
            raise CommandError(f"No organization found for schema_name={schema_name!r}.")

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be made"))

        with schema_context(schema_name):
            qs = UserPayment.objects.filter(status=UserPayment.Status.CANNOT_EXTRACT)
            if payment_id is not None:
                qs = qs.filter(id=payment_id)
            if since_date:
                qs = qs.filter(created_at__date__gte=since_date)
            qs = qs.exclude(screenshot="").filter(screenshot__isnull=False).order_by("pk")
            payments = list(qs)

        if payment_id is not None and not payments:
            raise CommandError(
                f"No cannot_extract UserPayment id={payment_id} with a screenshot "
                f"found in schema {schema_name!r}."
            )

        if not payments:
            self.stdout.write(
                f"No matching cannot_extract UserPayment rows in schema {schema_name!r}."
            )
            return

        if dry_run:
            for up in payments:
                created = up.created_at.date().isoformat() if up.created_at else "?"
                self.stdout.write(
                    f"id={up.id} created_at={created} status={up.status} "
                    f"-> would set awaiting_extraction and enqueue OCR"
                )
            self.stdout.write(
                self.style.WARNING(
                    f"Dry-run: {len(payments)} row(s) would be retried."
                )
            )
            return

        enqueued = 0
        with schema_context(schema_name):
            for up in payments:
                up.status = UserPayment.Status.AWAITING_EXTRACTION
                up.save(update_fields=["status"])
                extract_receiver_ss_text_data.delay(up.id, schema_name)
                logger.info(
                    "Retry enqueued for UserPayment %s in schema %s",
                    up.id,
                    schema_name,
                )
                enqueued += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Enqueued OCR retry for {enqueued} UserPayment row(s) "
                f"in schema {schema_name!r}."
            )
        )

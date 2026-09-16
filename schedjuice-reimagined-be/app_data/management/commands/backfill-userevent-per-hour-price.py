"""
Backfill UserEvent.per_hour_price_at_calculation from the course's current PaymentPlan
per_hour_price (best-effort historical proxy for rows created before the field existed).

By default only rows with a null per_hour_price and frozen payroll (hourly_rate_at_calculation set).
Use --overwrite to refresh existing snapshots; --from-date / --to-date to limit by event calendar day.
"""

import time
from datetime import date

from django.core.management import BaseCommand
from django.core.management.base import CommandError
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_attendance.models import UserEvent
from app_course.rate_utils import get_per_hour_price_snapshot_for_course
from app_organization.models import Organization


def _parse_iso_date(value: str) -> date:
    try:
        return date.fromisoformat(value.strip())
    except ValueError as e:
        raise CommandError(
            f"Invalid date {value!r}; use YYYY-MM-DD (ISO 8601)."
        ) from e


class Command(BaseCommand):
    help = (
        "Backfill per_hour_price_at_calculation from the course's current payment plan "
        "per-hour price. Defaults to rows where per_hour is null and hourly_rate_at_calculation "
        "is set. Use --overwrite to re-fill populated rows; --from-date / --to-date to filter "
        "by event calendar date."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show counts without writing to the database.",
        )
        parser.add_argument(
            "--schema-name",
            type=str,
            default=None,
            help="Process only this tenant schema (e.g. xteachersu).",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=500,
            metavar="N",
            help="Rows per bulk_update batch (default: 500).",
        )
        parser.add_argument(
            "--progress-every",
            type=int,
            default=500,
            metavar="N",
            help="Log progress every N rows scanned per tenant (default: 500).",
        )
        parser.add_argument(
            "--overwrite",
            action="store_true",
            help=(
                "Include rows where per_hour_price_at_calculation is already set "
                "(re-snapshot from the course's current payment plan)."
            ),
        )
        parser.add_argument(
            "--from-date",
            type=str,
            default=None,
            metavar="YYYY-MM-DD",
            help="Only events on or after this calendar date (Event.date, date component).",
        )
        parser.add_argument(
            "--to-date",
            type=str,
            default=None,
            metavar="YYYY-MM-DD",
            help="Only events on or before this calendar date (Event.date, date component).",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        schema_name_arg = options.get("schema_name")
        batch_size = max(1, options["batch_size"])
        progress_every = max(1, options["progress_every"])
        overwrite = options["overwrite"]

        from_date = (
            _parse_iso_date(options["from_date"]) if options["from_date"] else None
        )
        to_date = _parse_iso_date(options["to_date"]) if options["to_date"] else None
        if from_date and to_date and from_date > to_date:
            raise CommandError(
                f"--from-date ({from_date}) must be on or before --to-date ({to_date})."
            )

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be saved"))

        mode_bits = []
        if overwrite:
            mode_bits.append("overwrite populated")
        if from_date:
            mode_bits.append(f"from {from_date}")
        if to_date:
            mode_bits.append(f"to {to_date}")
        if mode_bits:
            self.stdout.write(f"Filters: {', '.join(mode_bits)}")

        grand_total = 0

        with schema_context(get_public_schema_name()):
            org_qs = Organization.objects.all()
            if schema_name_arg:
                org_qs = org_qs.filter(schema_name=schema_name_arg)
            organizations = list(org_qs)

        if schema_name_arg and not organizations:
            self.stderr.write(
                self.style.ERROR(
                    f"No organization found for schema_name={schema_name_arg!r}."
                )
            )
            return

        self.stdout.write(f"Organizations to scan: {len(organizations)}")

        for org in organizations:
            schema_name = getattr(org, "schema_name", None)
            if not schema_name:
                self.stdout.write(
                    self.style.WARNING(f"Skipping org (no schema_name): {org}")
                )
                continue

            with schema_context(schema_name):
                qs = UserEvent.objects.filter(
                    hourly_rate_at_calculation__isnull=False,
                ).select_related("event__course__payment_plan")

                if not overwrite:
                    qs = qs.filter(per_hour_price_at_calculation__isnull=True)

                if from_date:
                    qs = qs.filter(event__date__date__gte=from_date)
                if to_date:
                    qs = qs.filter(event__date__date__lte=to_date)

                qs = qs.order_by("pk")

                total_candidates = qs.count()
                if total_candidates == 0:
                    self.stdout.write(
                        f"  [{schema_name}] No matching rows for this filter, skipping."
                    )
                    continue

                self.stdout.write(
                    f"  [{schema_name}] Scanning {total_candidates} candidate row(s)..."
                )
                t0 = time.perf_counter()
                batch = []
                resolved = 0
                skipped_no_price = 0

                for i, ue in enumerate(qs.iterator(chunk_size=batch_size), start=1):
                    ph = get_per_hour_price_snapshot_for_course(ue.event.course)
                    if ph is None:
                        skipped_no_price += 1
                    else:
                        ue.per_hour_price_at_calculation = ph
                        batch.append(ue)
                        resolved += 1
                        if len(batch) >= batch_size:
                            if not dry_run:
                                UserEvent.objects.bulk_update(
                                    batch, ["per_hour_price_at_calculation"]
                                )
                            batch.clear()

                    if i % progress_every == 0 or i == total_candidates:
                        elapsed = time.perf_counter() - t0
                        self.stdout.write(
                            f"  [{schema_name}] ... {i}/{total_candidates} scanned "
                            f"({elapsed:.1f}s)"
                        )

                if batch:
                    if not dry_run:
                        UserEvent.objects.bulk_update(
                            batch, ["per_hour_price_at_calculation"]
                        )

                grand_total += resolved
                elapsed_total = time.perf_counter() - t0
                if dry_run:
                    self.stdout.write(
                        self.style.WARNING(
                            f"  [{schema_name}] dry-run: would set per_hour_price on "
                            f"{resolved} row(s); skipped (no plan price) {skipped_no_price}; "
                            f"{elapsed_total:.1f}s"
                        )
                    )
                else:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  [{schema_name}] Updated {resolved} row(s); "
                            f"skipped (no plan price) {skipped_no_price}; "
                            f"{elapsed_total:.1f}s"
                        )
                    )

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"Dry-run complete. Rows that would get a value (all tenants): {grand_total}"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Backfill complete. Total UserEvent rows updated (all tenants): {grand_total}"
                )
            )

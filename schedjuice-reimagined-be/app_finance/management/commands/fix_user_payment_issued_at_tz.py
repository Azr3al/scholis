"""
Backfill UserPayment.issued_at for rows written by any of the upload paths that
serialized `issued_at` as a local-time month anchor:

FE:
- "Scan Transaction Screenshots" page (`/screenshots/create`, hour=1 local)
- legacy "Admin Make Payment" page (now deleted, hour=1 local)
- pre-1df4e0a "Upload" page (`/finances/student-payments/upload`, hour=0 local)
- pre-1df4e0a inline synthetic-row create on Student Payments (hour=0 local)

BE:
- Teams payment submission sync (`sync-payment-submissions.py`, hour=0 local)

In any timezone east of UTC (Asia/Rangoon UTC+06:30, Asia/Bangkok UTC+07:00,
Asia/Dhaka UTC+06:00, Asia/Karachi UTC+05:00, Asia/Kathmandu UTC+05:45, …) all
of these serialize `issued_at` to the LAST DAY of the PREVIOUS calendar UTC
month. Before 1df4e0a the report's FE filter was buggy in the same direction
and things lined up; after 1df4e0a the filter asks the BE for the correct UTC
month and these rows appear one month earlier than the admin meant.

We identify candidates purely from the row's UTC value, with no tenant-TZ
lookup. The defining "month-anchor" fingerprint is:

    1. `issued_at` is on the LAST day of a calendar UTC month
    2. `issued_at.hour >= 12` UTC (positive offsets push local 00:00 / 01:00
       into the second half of the previous UTC day)
    3. `issued_at.second == 0` and `issued_at.microsecond == 0`

This matches every variant above for any positive-offset writer regardless of
whether the writer was the FE (browser TZ) or BE (tenant TZ), and it stays
robust even when the admin's browser TZ differs from `Organization.timezone`
(e.g. a Bangkok-based admin uploading to an Asia/Rangoon tenant produced
`…T18:00:00Z`, which does NOT line up at minute 0 in the tenant TZ but is
still unambiguously a buggy April anchor).

OCR-derived datetimes carry sub-second precision and arbitrary days/hours so
they fail (1) and (3); rows already fixed by this command sit at noon UTC on
the 1st and fail (1), so the command is idempotent.

For every match we set `issued_at` to noon UTC on the 1st of the FOLLOWING
calendar month, matching `getCalendarMonthUtcFilterBounds(...).start` from the
FE and the post-fix `sync-payment-submissions.py`.

Rows with explicit `covered_months` are still skipped: their visibility comes
from the junction table, not from `issued_at`.

Usage:
  python manage.py fix_user_payment_issued_at_tz --dry-run
  python manage.py fix_user_payment_issued_at_tz --schema-name xteachersu
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone as dt_timezone

from django.core.management import BaseCommand
from django.core.management.base import CommandError
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_finance.models import UserPayment, UserPaymentCoveredMonth
from app_organization.models import Organization

# UTC instant we want every fixed row to land on. Matches `getCalendarMonthUtcFilterBounds`.
_FIXED_HOUR_UTC = 12

# UTC hour at or after which a "last day of UTC month" timestamp is treated as a
# month-anchor pushed back by a positive TZ offset. Schedjuice's tenant footprint
# is South / Southeast Asia (offsets +05:00 .. +09:00), where local 00:00 / 01:00
# lands at UTC 15:00 .. 19:30 on the previous day — comfortably above this 12:00
# cutoff. Keeping the cutoff at noon leaves room for arbitrary OCR'd datetimes
# at end-of-month morning hours without false-matching them.
_BUGGY_MIN_UTC_HOUR = 12


def _matches_buggy_signature(issued_at_utc: datetime) -> bool:
    """
    True if `issued_at_utc` looks like a month anchor written by any positive-offset
    writer (FE or BE). See module docstring for the full rationale.
    """
    next_day = issued_at_utc + timedelta(days=1)
    if next_day.day != 1:
        return False
    if issued_at_utc.hour < _BUGGY_MIN_UTC_HOUR:
        return False
    if issued_at_utc.second != 0 or issued_at_utc.microsecond != 0:
        return False
    return True


def _intended_utc_issued_at(issued_at_utc: datetime) -> datetime:
    """Noon UTC on the 1st of the FOLLOWING calendar UTC month."""
    next_day = issued_at_utc + timedelta(days=1)
    return datetime(
        next_day.year, next_day.month, 1, _FIXED_HOUR_UTC, 0, 0, tzinfo=dt_timezone.utc
    )


class Command(BaseCommand):
    help = (
        "Re-tag UserPayment.issued_at for rows whose value matches the legacy "
        "month-anchor signature (last day of UTC month at hour >= 12 with second = "
        "microsecond = 0, written by the Scan Transaction Screenshots / pre-1df4e0a "
        "Upload page / pre-1df4e0a inline synthetic-row create / Teams payment "
        "submission sync flows). Rewrites those rows to noon UTC on the 1st of the "
        "following calendar UTC month."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print which rows would change without writing to the database.",
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

    def handle(self, *args, **options):
        dry_run: bool = options["dry_run"]
        schema_name_arg: str | None = options.get("schema_name")
        batch_size = max(1, options["batch_size"])
        progress_every = max(1, options["progress_every"])

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be saved"))

        with schema_context(get_public_schema_name()):
            org_qs = Organization.objects.all()
            if schema_name_arg:
                org_qs = org_qs.filter(schema_name=schema_name_arg)
            schema_names = [o.schema_name for o in org_qs if o.schema_name]

        if schema_name_arg and not schema_names:
            raise CommandError(
                f"No organization found for schema_name={schema_name_arg!r}."
            )

        self.stdout.write(f"Organizations to scan: {len(schema_names)}")
        grand_matched = 0
        grand_updated = 0

        for schema_name in schema_names:
            self.stdout.write(self.style.NOTICE(f"\nSchema: {schema_name}"))

            with schema_context(schema_name):
                # Skip rows whose visibility doesn't depend on issued_at: explicit
                # covered_months entries take precedence in app_finance.payment_coverage.
                payment_ids_with_coverage = set(
                    UserPaymentCoveredMonth.objects.values_list(
                        "user_payment_id", flat=True
                    )
                )
                qs = (
                    UserPayment.objects.filter(issued_at__isnull=False)
                    .exclude(id__in=payment_ids_with_coverage)
                    .order_by("pk")
                )

                total_candidates = qs.count()
                if total_candidates == 0:
                    self.stdout.write(f"  [{schema_name}] No candidate rows.")
                    continue

                self.stdout.write(
                    f"  [{schema_name}] Scanning {total_candidates} candidate row(s)..."
                )
                t0 = time.perf_counter()
                matched = 0
                updated = 0
                batch: list[UserPayment] = []

                for i, up in enumerate(qs.iterator(chunk_size=batch_size), start=1):
                    if _matches_buggy_signature(up.issued_at):
                        old = up.issued_at
                        new = _intended_utc_issued_at(old)
                        matched += 1
                        if dry_run:
                            self.stdout.write(
                                f"    id={up.id} {old.isoformat()} -> {new.isoformat()}"
                            )
                        else:
                            up.issued_at = new
                            batch.append(up)
                            if len(batch) >= batch_size:
                                UserPayment.objects.bulk_update(batch, ["issued_at"])
                                updated += len(batch)
                                batch.clear()

                    if i % progress_every == 0 or i == total_candidates:
                        elapsed = time.perf_counter() - t0
                        self.stdout.write(
                            f"  [{schema_name}] ... {i}/{total_candidates} scanned ({elapsed:.1f}s)"
                        )

                if batch and not dry_run:
                    UserPayment.objects.bulk_update(batch, ["issued_at"])
                    updated += len(batch)
                    batch.clear()

                grand_matched += matched
                grand_updated += updated
                elapsed_total = time.perf_counter() - t0
                if dry_run:
                    self.stdout.write(
                        self.style.WARNING(
                            f"  [{schema_name}] dry-run: {matched} row(s) match the buggy "
                            f"signature; {elapsed_total:.1f}s"
                        )
                    )
                else:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  [{schema_name}] Updated {updated} row(s); "
                            f"{elapsed_total:.1f}s"
                        )
                    )

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"\nDry-run complete. Rows that would be re-tagged (all tenants): {grand_matched}"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"\nBackfill complete. UserPayment rows updated (all tenants): {grand_updated}"
                )
            )

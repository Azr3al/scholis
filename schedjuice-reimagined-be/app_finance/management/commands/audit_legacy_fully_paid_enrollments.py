"""
Report legacy UserCourse.is_fully_paid enrollments before the field is removed.

Read-only: does not mutate enrollments or payments.

Usage:
  python manage.py audit-legacy-fully-paid-enrollments
  python manage.py audit-legacy-fully-paid-enrollments --schema-name xteachersu
  python manage.py audit-legacy-fully-paid-enrollments --csv /tmp/fully-paid-audit.csv
  python manage.py audit-legacy-fully-paid-enrollments --fail-on-at-risk
"""

from __future__ import annotations

import sys
from pathlib import Path

from django.core.management import BaseCommand
from django.core.management.base import CommandError
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_finance.legacy_fully_paid_audit import (
    RISK_AT_RISK,
    audit_legacy_fully_paid_enrollments,
    legacy_is_fully_paid_field_exists,
    summarize_audit_rows,
    write_audit_csv,
)
from app_organization.models import Organization


class Command(BaseCommand):
    help = (
        "Audit student enrollments with legacy UserCourse.is_fully_paid=True before "
        "the field is removed. Reports payment coverage and risk (read-only)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema-name",
            type=str,
            default=None,
            help="Process only this tenant schema (e.g. xteachersu).",
        )
        parser.add_argument(
            "--csv",
            type=str,
            default=None,
            metavar="PATH",
            help="Write all audit rows to a CSV file.",
        )
        parser.add_argument(
            "--include-dropped",
            action="store_true",
            help="Include dropped-out student enrollments (excluded by default).",
        )
        parser.add_argument(
            "--fail-on-at-risk",
            action="store_true",
            help="Exit with status 1 when any at_risk row is found.",
        )
        parser.add_argument(
            "--summary-only",
            action="store_true",
            help="Print per-tenant counts only; omit row detail lines.",
        )

    def handle(self, *args, **options):
        if not legacy_is_fully_paid_field_exists():
            self.stdout.write(
                self.style.WARNING(
                    "UserCourse.is_fully_paid has been removed; nothing to audit."
                )
            )
            return

        schema_name_arg: str | None = options.get("schema_name")
        csv_path: str | None = options.get("csv")
        include_dropped: bool = options["include_dropped"]
        fail_on_at_risk: bool = options["fail_on_at_risk"]
        summary_only: bool = options["summary_only"]

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

        all_rows = []
        grand_total = 0
        grand_at_risk = 0

        for schema_name in schema_names:
            with schema_context(schema_name):
                rows = audit_legacy_fully_paid_enrollments(
                    schema_name,
                    include_dropped=include_dropped,
                )

            counts = summarize_audit_rows(rows)
            total = len(rows)
            at_risk = counts.get(RISK_AT_RISK, 0)
            grand_total += total
            grand_at_risk += at_risk
            all_rows.extend(rows)

            self.stdout.write(
                self.style.NOTICE(
                    f"\nSchema: {schema_name}\n"
                    f"  legacy_fully_paid: {total}  "
                    f"ok: {counts.get('ok', 0)}  "
                    f"review: {counts.get('review', 0)}  "
                    f"at_risk: {at_risk}"
                )
            )

            if summary_only or not rows:
                continue

            for row in rows:
                if row.risk != RISK_AT_RISK:
                    continue
                paid_label = row.paid_until_label or "—"
                self.stdout.write(
                    f"  AT_RISK user_course_id={row.user_course_id} "
                    f'user="{row.user_name}" course="{row.course_title}" '
                    f"payments={row.payment_count} paid_until={paid_label} "
                    f"— {row.notes}"
                )

        if csv_path:
            path = Path(csv_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("w", newline="", encoding="utf-8") as handle:
                write_audit_csv(all_rows, handle)
            self.stdout.write(
                self.style.SUCCESS(f"\nWrote {len(all_rows)} row(s) to {path}")
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"\nGrand total legacy_fully_paid: {grand_total}  at_risk: {grand_at_risk}"
            )
        )

        if fail_on_at_risk and grand_at_risk > 0:
            self.stderr.write(
                self.style.ERROR(
                    f"Found {grand_at_risk} at_risk enrollment(s). "
                    "Resolve before removing is_fully_paid."
                )
            )
            sys.exit(1)

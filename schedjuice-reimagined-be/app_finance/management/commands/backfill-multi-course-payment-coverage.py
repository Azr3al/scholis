"""Backfill covered months on multi-course payment parts missing coverage rows."""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count, Exists, OuterRef, Q
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_finance.models import UserPayment, UserPaymentGroup
from app_finance.payment_coverage import (
    calendar_months_for_course,
    sync_user_payment_covered_months,
)
from app_finance.payment_group import rollup_multi_course_group_plan_fields
from app_organization.models import Organization


def _payments_missing_coverage_qs(
    *,
    include_grouped: bool,
    include_orphans: bool,
):
    qs_parts = []
    if include_grouped:
        qs_parts.append(
            UserPayment.objects.filter(
                group__group_kind=UserPaymentGroup.GroupKind.MULTI_COURSE,
            )
        )
    if include_orphans:
        peer_exists = UserPayment.objects.filter(
            user_id=OuterRef("user_id"),
            transaction_id=OuterRef("transaction_id"),
        ).exclude(
            course_id=OuterRef("course_id"),
        ).exclude(
            Q(transaction_id__isnull=True) | Q(transaction_id=""),
        )
        qs_parts.append(
            UserPayment.objects.filter(group_id__isnull=True).filter(
                Exists(peer_exists)
            )
        )

    if not qs_parts:
        return UserPayment.objects.none()

    combined = qs_parts[0]
    for part in qs_parts[1:]:
        combined = combined | part

    return (
        combined.annotate(_cm_count=Count("covered_months"))
        .filter(_cm_count=0)
        .select_related("course", "group")
        .distinct()
    )


class Command(BaseCommand):
    help = (
        "For multi_course payment parts with no covered-month rows, assign the "
        "full course calendar range and align issued_at to the first month. "
        "Also repairs group_id=null orphans that share a transaction across courses."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema-name",
            type=str,
            required=True,
            help="Tenant schema name (required).",
        )
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument(
            "--include-orphans",
            dest="include_orphans",
            action="store_true",
            default=True,
            help=(
                "Also backfill standalone payments (group_id null) that share a "
                "transaction_id across courses (default: on)."
            ),
        )
        parser.add_argument(
            "--no-include-orphans",
            dest="include_orphans",
            action="store_false",
            help="Only backfill grouped multi_course payment parts.",
        )

    def handle(self, *args, **options):
        schema_name = options["schema_name"]
        dry_run = options["dry_run"]
        include_orphans = options["include_orphans"]

        with schema_context(get_public_schema_name()):
            org = Organization.objects.filter(schema_name=schema_name).first()
        if org is None:
            raise CommandError(f"No organization for schema_name={schema_name!r}.")

        updated_parts = 0
        skipped_no_dates = 0
        touched_groups: set[int] = set()

        with schema_context(schema_name):
            qs = _payments_missing_coverage_qs(
                include_grouped=True,
                include_orphans=include_orphans,
            )

            for payment in qs:
                course = payment.course
                if course is None or not course.start_date:
                    skipped_no_dates += 1
                    self.stdout.write(
                        self.style.WARNING(
                            f"Skip payment {payment.id}: course missing dates"
                        )
                    )
                    continue

                month_tuples = calendar_months_for_course(course)
                if not month_tuples:
                    skipped_no_dates += 1
                    continue

                coverage = [
                    {"year": year, "month_index": month}
                    for year, month in month_tuples
                ]
                label = (
                    f"group {payment.group_id}"
                    if payment.group_id is not None
                    else "orphan"
                )
                if dry_run:
                    self.stdout.write(
                        f"Would update payment {payment.id} "
                        f"(course {course.id}, {label}) "
                        f"with {len(coverage)} month(s)"
                    )
                else:
                    sync_user_payment_covered_months(payment, coverage)
                updated_parts += 1
                if payment.group_id is not None:
                    touched_groups.add(payment.group_id)

            if not dry_run:
                for group_id in touched_groups:
                    group = UserPaymentGroup.objects.filter(id=group_id).first()
                    if group is not None:
                        rollup_multi_course_group_plan_fields(group)

        verb = "Would update" if dry_run else "Updated"
        orphan_note = (
            " (including orphans)"
            if include_orphans
            else " (grouped parts only)"
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Schema {schema_name}: {verb} {updated_parts} part(s){orphan_note}, "
                f"{len(touched_groups)} group(s), skipped {skipped_no_dates} (no dates)."
            )
        )

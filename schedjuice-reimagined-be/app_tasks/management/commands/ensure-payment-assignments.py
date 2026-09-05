"""
Django management command to ensure payment assignments exist.
Runs daily (via cron). Catch-up windows (org-local calendar date):

- FM: from the 20th of the month *before* the payment month through the last day of the payment month.
- HM: from the 9th of the payment month through the last day of that month.

Otherwise unchanged: same course filters, first-month skip, end-before-month checks, prechecks, async queue.

Assignment titles (e.g. HM "Jan - Feb …") come from get_assignment_display_name in
app_microsoft.payment_assignment_helpers, not from this command.
"""

import logging
from datetime import date

from django.db import connection
from django.core.management import BaseCommand
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import Course, PaymentAssignment
from app_organization.models import Organization
from app_microsoft.payment_assignment_helpers import (
    create_payment_assignment_for_course_month,
    create_payment_assignment_for_course_month_async,
    fm_payment_assignment_ensure_window,
    hm_payment_assignment_ensure_window,
    is_first_month_of_course,
    is_hm_course,
    org_local_today,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def _first_of_month(d: date) -> date:
    return date(d.year, d.month, 1)


def _first_of_next_month(today: date) -> date:
    if today.month == 12:
        return date(today.year + 1, 1, 1)
    return date(today.year, today.month + 1, 1)


def _fm_months_to_ensure(today: date) -> list[tuple[int, int]]:
    """
    FM: include payment month M if today is in that month's ensure window (20th of prior month .. last of M).
    Scan the same two payment-month candidates as before: month containing ``today`` and the following month.
    """
    out: list[tuple[int, int]] = []
    for anchor in (_first_of_month(today), _first_of_next_month(today)):
        y, m = anchor.year, anchor.month
        creation_start, month_end = fm_payment_assignment_ensure_window(y, m)
        if creation_start <= today <= month_end:
            out.append((y, m))
    return list(dict.fromkeys(out))


def _hm_months_to_ensure(today: date) -> list[tuple[int, int]]:
    """
    HM: include payment month M if today is in that month's ensure window (9th .. last day of M).
    Scan the same two payment-month candidates as FM (independent of course start day for scheduling).
    """
    out: list[tuple[int, int]] = []
    for anchor in (_first_of_month(today), _first_of_next_month(today)):
        y, m = anchor.year, anchor.month
        creation_start, month_end = hm_payment_assignment_ensure_window(y, m)
        if creation_start <= today <= month_end:
            out.append((y, m))
    return list(dict.fromkeys(out))


def _fm_window_explanation(today: date) -> str:
    parts: list[str] = []
    for anchor in (_first_of_month(today), _first_of_next_month(today)):
        y, m = anchor.year, anchor.month
        creation_start, month_end = fm_payment_assignment_ensure_window(y, m)
        inside = creation_start <= today <= month_end
        parts.append(
            f"{y}-{m:02d} window {creation_start}..{month_end}"
            f"{' [today in window]' if inside else ''}"
        )
    return "; ".join(parts)


def _hm_window_explanation(today: date) -> str:
    parts: list[str] = []
    for anchor in (_first_of_month(today), _first_of_next_month(today)):
        y, m = anchor.year, anchor.month
        creation_start, month_end = hm_payment_assignment_ensure_window(y, m)
        inside = creation_start <= today <= month_end
        parts.append(
            f"{y}-{m:02d} window {creation_start}..{month_end}"
            f"{' [today in window]' if inside else ''}"
        )
    return "; ".join(parts)


def _get_current_org():
    # Must capture before schema_context(public): inside that context,
    # connection.schema_name becomes "public", so filtering by it would miss the real tenant row.
    tenant_schema = connection.schema_name
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=tenant_schema).first()


class Command(BaseCommand):
    help = "Ensure payment assignments exist (daily cron, window-based creation)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema-name",
            type=str,
            help="Tenant schema to use (Organization.schema_name), e.g. xschedjuice. "
            "Required when the DB connection is public (plain manage.py shell).",
        )
        parser.add_argument(
            "--sync",
            action="store_true",
            help="Run synchronously (no async queue). Default: async.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Log every eligible course and outcome; do not create or queue assignments.",
        )
        parser.add_argument(
            "--verbose",
            action="store_true",
            help="Log each course from the base filter that is skipped (payment off or outside session). "
            "With --dry-run, every such course is listed automatically (this flag adds extra fields).",
        )

    def handle(self, *args, **options):
        run_sync = options.get("sync", False)
        dry_run = options.get("dry_run", False)
        dry_run_sync_intent = run_sync
        if dry_run:
            run_sync = False

        mode_parts = []
        if dry_run:
            mode_parts.append("dry-run")
        elif run_sync:
            mode_parts.append("sync")
        else:
            mode_parts.append("async")
        logger.info(
            "Running [ensure-payment-assignments] (" + ", ".join(mode_parts) + ")"
        )

        verbose = options.get("verbose", False)
        schema_opt = (options.get("schema_name") or "").strip() or None

        if schema_opt:
            with schema_context(get_public_schema_name()):
                org = Organization.objects.filter(schema_name=schema_opt).first()
            if not org:
                msg = (
                    f"No Organization registered with schema_name={schema_opt!r} "
                    "(public registry). Check spelling or run load-tenants."
                )
                logger.warning(msg)
                self.stdout.write(self.style.ERROR(msg))
                return
            if not org.is_microsoft_on:
                msg = (
                    f"Organization id={org.id} schema={org.schema_name!r} has is_microsoft_on=False; "
                    "command skips all work."
                )
                logger.warning(msg)
                self.stdout.write(self.style.WARNING(msg))
                return
            with schema_context(schema_opt):
                self._ensure_payment_assignments_for_tenant(
                    org=org,
                    connection_schema_label=schema_opt,
                    run_sync=run_sync,
                    dry_run=dry_run,
                    dry_run_sync_intent=dry_run_sync_intent,
                    verbose=verbose,
                )
            return

        tenant_schema = connection.schema_name
        org = _get_current_org()
        if not org:
            msg = (
                f"No Organization found for connection schema_name={tenant_schema!r}. "
                "Nothing to do."
            )
            if tenant_schema == get_public_schema_name():
                msg += (
                    " You are on the public schema: pass --schema-name=<tenant> "
                    "(Organization.schema_name from the public DB), e.g. "
                    "`python manage.py ensure-payment-assignments --schema-name=xschedjuice --dry-run`."
                )
            else:
                msg += " Check tenant middleware / migrate."
            logger.warning(msg)
            self.stdout.write(self.style.ERROR(msg))
            return
        if not org.is_microsoft_on:
            msg = (
                f"Organization id={org.id} schema={org.schema_name!r} has is_microsoft_on=False; "
                "command skips all work."
            )
            logger.warning(msg)
            self.stdout.write(self.style.WARNING(msg))
            return

        self._ensure_payment_assignments_for_tenant(
            org=org,
            connection_schema_label=tenant_schema,
            run_sync=run_sync,
            dry_run=dry_run,
            dry_run_sync_intent=dry_run_sync_intent,
            verbose=verbose,
        )

    def _ensure_payment_assignments_for_tenant(
        self,
        *,
        org: Organization,
        connection_schema_label: str,
        run_sync: bool,
        dry_run: bool,
        dry_run_sync_intent: bool,
        verbose: bool,
    ) -> None:
        schema_name = org.schema_name

        today = org_local_today(org)

        total_created = 0
        eligible_count = 0
        sync_failures: list[str] = []
        boot = (
            f"tenant_schema={connection_schema_label!r} org_id={org.id} org.schema_name={schema_name!r} "
            f"today={today} is_microsoft_on={org.is_microsoft_on}"
        )
        logger.info(boot)
        self.stdout.write(boot)

        courses = Course.objects.filter(
            microsoft_group_id__isnull=False,
            category__is_payment_assignment_eligible=True,
        ).exclude(microsoft_group_id="").select_related("category")

        base_count = courses.count()
        summary = (
            f"Base filter (non-empty microsoft_group_id + payment-eligible category): {base_count} course(s)"
        )
        logger.info(summary)
        self.stdout.write(summary)

        for course in courses:
            skip = self._payment_assignment_skip_reason(today, course)
            if skip:
                if dry_run or verbose:
                    extra = ""
                    if verbose and dry_run:
                        extra = (
                            f" category={getattr(course.category, 'name', None)!r} "
                            f"is_payment_enabled={course.is_payment_enabled}"
                        )
                    line = (
                        f"[{'dry-run' if dry_run else 'verbose'}] skip course id={course.id} "
                        f"title={course.title!r}: {skip}{extra}"
                    )
                    logger.info(line)
                    self.stdout.write(line)
                continue

            eligible_count += 1
            months_to_ensure = self._get_months_to_ensure_for_course(today, course)

            if dry_run:
                total_created += self._dry_run_log_course(
                    today,
                    course,
                    months_to_ensure,
                    dry_run_sync_intent,
                    schema_name,
                )
                continue

            for year, month_index in months_to_ensure:
                target_date = date(year, month_index, 1)
                if course.end_date < target_date:
                    continue

                if PaymentAssignment.objects.filter(
                    course=course,
                    year=year,
                    month_index=month_index,
                ).exists():
                    continue

                # Skip first month of course (students paid elsewhere)
                if is_first_month_of_course(course, year, month_index):
                    logger.debug(
                        f"  Course {course.id}: {year}-{month_index} is first month, skipping"
                    )
                    continue

                target_date = date(year, month_index, 1)
                if run_sync:
                    try:
                        pa = create_payment_assignment_for_course_month(
                            course, org, year, month_index, target_date
                        )
                    except Exception as exc:
                        msg = (
                            f"course {course.id} ({course.title!r}) "
                            f"{year}-{month_index:02d}: {exc}"
                        )
                        sync_failures.append(msg)
                        logger.exception(
                            "  Failed to create '%s-%s' for course %s (%s)",
                            year,
                            month_index,
                            course.id,
                            course.title,
                        )
                        continue
                    if pa:
                        total_created += 1
                        logger.info(
                            f"  Created '{year}-{month_index}' for course {course.id} ({course.title})"
                        )
                else:
                    create_payment_assignment_for_course_month_async.delay(
                        course.id,
                        schema_name,
                        year,
                        month_index,
                    )
                    total_created += 1
                    logger.info(
                        f"  Queued '{year}-{month_index}' for course {course.id} ({course.title})"
                    )

        if dry_run:
            logger.info(
                f"Dry run complete. Base filter={base_count}, eligible (in session + payment on)={eligible_count}; "
                f"would {'create' if dry_run_sync_intent else 'queue'} {total_created} payment assignment(s)"
            )
            self.stdout.write(
                self.style.WARNING(
                    f"Dry run: base={base_count}, eligible={eligible_count}, "
                    f"would {'create' if dry_run_sync_intent else 'queue'} {total_created} assignment(s)"
                )
            )
            if base_count and not eligible_count:
                hint = (
                    "All courses from the base filter were skipped (payment disabled or outside session dates). "
                    "See [dry-run] skip lines above."
                )
                logger.info(hint)
                self.stdout.write(self.style.NOTICE(hint))
            if not base_count:
                hint = (
                    "No courses match the base filter (non-empty microsoft_group_id and "
                    "category.is_payment_assignment_eligible). Check Teams link and category flags."
                )
                logger.info(hint)
                self.stdout.write(self.style.NOTICE(hint))
            return

        if run_sync:
            logger.info(f"Ensure complete. Created {total_created} payment assignment(s)")
        else:
            logger.info(f"Ensure complete. Queued {total_created} payment assignment(s)")
        self.stdout.write(
            self.style.SUCCESS(f"{'Created' if run_sync else 'Queued'} {total_created} payment assignment(s)")
        )
        if sync_failures:
            summary = "; ".join(sync_failures[:20])
            if len(sync_failures) > 20:
                summary += f"; … and {len(sync_failures) - 20} more"
            raise RuntimeError(
                f"ensure-payment-assignments: {len(sync_failures)} course-month(s) failed: {summary}"
            )

    @staticmethod
    def _payment_assignment_skip_reason(today: date, course: Course) -> str | None:
        """Return a human-readable reason if the course is not eligible; None if eligible."""
        if not course.is_payment_enabled:
            return "payment assignments disabled for this course (is_payment_enabled=False)"
        if course.start_date > today:
            return f"not in session yet (start_date {course.start_date} > today {today})"
        if course.end_date < today:
            return f"not in session (ended: end_date {course.end_date} < today {today})"
        return None

    def _dry_run_log_course(
        self,
        today: date,
        course: Course,
        months_to_ensure: list[tuple[int, int]],
        would_sync: bool,
        schema_name: str,
    ) -> int:
        """Log one eligible course and per-month outcomes; return count that would be created/queued."""
        billing = "HM" if is_hm_course(course) else "FM"
        cat = getattr(course, "category", None)
        cat_name = getattr(cat, "name", None)
        header = (
            f"[dry-run] eligible course id={course.id} title={course.title!r} "
            f"billing={billing} start={course.start_date} end={course.end_date} "
            f"group_id={course.microsoft_group_id} category_id={course.category_id} "
            f"category_name={cat_name!r} is_payment_enabled={course.is_payment_enabled}"
        )
        logger.info(header)
        self.stdout.write(header)

        if not months_to_ensure:
            explain = (
                _hm_window_explanation(today)
                if is_hm_course(course)
                else _fm_window_explanation(today)
            )
            line = f"  -> no payment month in window for today={today}; {explain}"
            logger.info(line)
            self.stdout.write(line)
            return 0

        would = 0
        action = "create" if would_sync else "queue"
        for year, month_index in months_to_ensure:
            target_date = date(year, month_index, 1)
            prefix = f"  -> {year}-{month_index:02d}:"
            if course.end_date < target_date:
                line = f"{prefix} skip (course end {course.end_date} before month start {target_date})"
                logger.info(line)
                self.stdout.write(line)
                continue
            if PaymentAssignment.objects.filter(
                course=course,
                year=year,
                month_index=month_index,
            ).exists():
                line = f"{prefix} skip (PaymentAssignment already exists)"
                logger.info(line)
                self.stdout.write(line)
                continue
            if is_first_month_of_course(course, year, month_index):
                line = f"{prefix} skip (first month of course)"
                logger.info(line)
                self.stdout.write(line)
                continue
            line = (
                f"{prefix} would {action} "
                f"({'sync' if would_sync else 'async'}: course {course.id}, schema {schema_name})"
            )
            logger.info(line)
            self.stdout.write(line)
            would += 1
        return would

    def _get_months_to_ensure_for_course(
        self, today: date, course: Course
    ) -> list[tuple[int, int]]:
        """
        Return (year, month_index) pairs to ensure for this course today.
        FM/HM use fixed calendar windows (20th of prior month .. end of M for FM; 9th .. end of M for HM);
        same two candidate payment months as before (month containing ``today`` and the next month).
        """
        if is_hm_course(course):
            return _hm_months_to_ensure(today)
        return _fm_months_to_ensure(today)

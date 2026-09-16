"""
Django management command to sync new submissions from Microsoft Teams payment assignments
to UserPayment. Runs daily via cron.

For each PaymentAssignment:
- Lists submissions with status=submitted
- For each submission not yet in UserPayment (by microsoft_submission_id):
  - Find user by recipient.userId (microsoft_id)
  - Get course from PaymentAssignment
  - Download first file from submittedResources (educationFileResource) as screenshot
  - Create UserPayment with user, course, microsoft_submission_id, screenshot
"""

import logging
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone as dt_timezone

from django.core.files.base import ContentFile
from django.core.management import BaseCommand
from django.db import connection
from django.db.models import Q, QuerySet
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.models import PaymentAssignment
from app_finance.models import UserPayment
from app_microsoft.graph_wrapper.education import MSEducation
from app_microsoft.payment_assignment_helpers import org_local_today
from app_organization.models import Organization
from utilitas.async_tasks import django_q_task, tenant_async
from app_finance.services import extract_receiver_ss_text_data

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def recent_calendar_months(anchor: date, *, count: int = 3) -> list[tuple[int, int]]:
    """Return (year, month_index) for the last `count` calendar months including anchor's month."""
    result: list[tuple[int, int]] = []
    year, month = anchor.year, anchor.month
    for _ in range(count):
        result.append((year, month))
        if month == 1:
            year -= 1
            month = 12
        else:
            month -= 1
    return result


def payment_assignments_for_sync_queryset(
    org: Organization,
    *,
    course_id: int | None = None,
    months_back: int = 3,
    today: date | None = None,
) -> QuerySet[PaymentAssignment]:
    """PaymentAssignment rows eligible for daily submission sync."""
    today = today if today is not None else org_local_today(org)
    month_filter = Q()
    for year, month_index in recent_calendar_months(today, count=months_back):
        month_filter |= Q(year=year, month_index=month_index)

    qs = (
        PaymentAssignment.objects.select_related("course")
        .filter(course__microsoft_group_id__isnull=False)
        .exclude(course__microsoft_group_id="")
        .filter(course__is_payment_enabled=True)
        .filter(month_filter)
        .filter(
            course__start_date__lt=today,
            course__end_date__gte=today - timedelta(days=10),
        )
    )
    if course_id is not None:
        qs = qs.filter(course_id=course_id)
    return qs


def _get_current_org():
    # Must capture before schema_context(public): inside that context,
    # connection.schema_name becomes "public", so filtering by it would miss the real tenant row.
    tenant_schema = connection.schema_name
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=tenant_schema).first()


def _get_file_url_from_resource(resource_wrapper: dict) -> tuple[str | None, str]:
    """
    Extract download URL from submitted resource.
    Returns (file_url, display_name).
    Supports: educationFileResource, educationMediaResource (both have fileUrl).
    Fallback: assignmentResourceUrl when it's a Graph drives URL.
    """
    resource = resource_wrapper.get("resource", {})
    odata_type = resource.get("@odata.type", "")
    display_name = resource.get("displayName", "screenshot")

    # educationFileResource and educationMediaResource both have fileUrl (images use MediaResource)
    if "educationFileResource" in odata_type or "educationMediaResource" in odata_type:
        file_url = resource.get("fileUrl")
        if file_url:
            return file_url, display_name

    # assignmentResourceUrl points to file in submission's resources folder when resource is a file
    assignment_url = resource_wrapper.get("assignmentResourceUrl")
    if assignment_url and ("graph.microsoft.com" in assignment_url or "/drives/" in assignment_url):
        return assignment_url, display_name

    return None, display_name


def _infer_filename_from_display_name(display_name: str) -> str:
    """Ensure filename has an image extension for ImageField."""
    name = (display_name or "screenshot").strip()
    if not any(name.lower().endswith(ext) for ext in (".png", ".jpg", ".jpeg", ".gif", ".webp")):
        name += ".png"
    return name


def sync_submissions_for_payment_assignment(
    pa: PaymentAssignment, tenant: Organization, schema_name: str
) -> int:
    """Sync new submissions for one PaymentAssignment. Returns count created."""
    course = pa.course
    class_id = course.microsoft_group_id
    assignment_id = pa.microsoft_assignment_id
    if not class_id or not assignment_id:
        return 0

    # App-only Graph token (same as MSGroup / Teams creation), not the org OAuth
    # service account. Submission sync broke when password-based delegated auth was
    # removed (Jul 2026); app credentials avoid that dependency.
    education = MSEducation(tenant)
    res = education.list_submissions(class_id, assignment_id, status_filter="submitted")
    if res.status_code not in range(199, 300):
        logger.warning(
            f"Failed to list submissions for PaymentAssignment {pa.id}: {res.status_code}"
        )
        return 0

    data = res.json()
    submissions = data.get("value", [])
    created = 0

    # Anchor issued_at / billing_start_date / billing_end_date at noon UTC on the 1st
    # and last day of the PaymentAssignment's calendar month. The Student Payments report
    # and Unpaid Students list both filter via __year/__month (evaluated in UTC because
    # TIME_ZONE='UTC'), so anchoring in tenant-local time used to push the row into the
    # previous UTC month for any tenant whose offset is positive (e.g. Asia/Rangoon
    # +06:30 turned local midnight on May 1 into Apr 30 17:30Z). Mirrors the FE helper
    # `getCalendarMonthUtcFilterBounds`, which writes the same noon-UTC anchor for the
    # `Scan Transactions` / inline / `student-payments/upload` flows.
    year, month = pa.year, pa.month_index
    _, last_day = monthrange(year, month)
    first_of_month = datetime(year, month, 1, 12, 0, 0, tzinfo=dt_timezone.utc)
    billing_start = first_of_month
    billing_end = datetime(year, month, last_day, 12, 0, 0, tzinfo=dt_timezone.utc)

    existing_ids = set(
        UserPayment.objects.filter(
            microsoft_submission_id__isnull=False
        ).exclude(microsoft_submission_id="").values_list("microsoft_submission_id", flat=True)
    )

    users_by_microsoft_id = {
        u.microsoft_id: u
        for u in User.objects.filter(microsoft_id__isnull=False).exclude(microsoft_id="")
    }

    for sub in submissions:
        submission_id = sub.get("id")
        if not submission_id or submission_id in existing_ids:
            continue

        # Student is the recipient (or submittedBy)
        recipient = sub.get("recipient", {})
        user_id = recipient.get("userId") or (sub.get("submittedBy") or {}).get("user", {}).get("id")
        if not user_id:
            logger.warning(f"Submission {submission_id} has no user id, skipping")
            continue

        user = users_by_microsoft_id.get(user_id)
        if not user:
            logger.warning(f"No local user for microsoft_id={user_id}, submission {submission_id}")
            continue

        # List submitted resources
        resources_res = education.list_submitted_resources(
            class_id, assignment_id, submission_id
        )
        if resources_res.status_code not in range(199, 300):
            logger.warning(
                f"Failed to list resources for submission {submission_id}: {resources_res.status_code}"
            )
            continue

        resources_data = resources_res.json()
        resources_list = resources_data.get("value", [])

        screenshot_file = None
        display_name = "screenshot"

        for res_wrapper in resources_list:
            file_url, display_name = _get_file_url_from_resource(res_wrapper)
            if file_url:
                dl_res = education.download_file_content(file_url)
                if dl_res.status_code in range(199, 300):
                    screenshot_file = ContentFile(dl_res.content)
                    break
                logger.warning(f"Failed to download file for submission {submission_id}")

        # Ideally one screenshot per submission; use first file if multiple
        if not screenshot_file:
            logger.warning(
                f"No file resource for submission {submission_id} "
                f"(got {len(resources_list)} resource(s): "
                f"types={[r.get('resource', {}).get('@odata.type') for r in resources_list]}), "
                f"creating without screenshot"
            )

        up = UserPayment(
            user=user,
            course=course,
            microsoft_submission_id=submission_id,
            status=UserPayment.Status.AWAITING_EXTRACTION,
            issued_at=first_of_month,
            billing_start_date=billing_start,
            billing_end_date=billing_end,
        )
        if screenshot_file:
            filename = _infer_filename_from_display_name(display_name)
            up.screenshot.save(filename, screenshot_file, save=False)
        up.save()
        created += 1
        existing_ids.add(submission_id)
        logger.info(f"Created UserPayment {up.id} from submission {submission_id} (user={user.id})")

        # Trigger OCR extraction when we have a screenshot (same as admin upload flow)
        if screenshot_file and schema_name:
            extract_receiver_ss_text_data.delay(
                up.id,
                schema_name,
            )

    return created


@django_q_task
@tenant_async(entity=PaymentAssignment)
def sync_payment_submissions_for_payment_assignment_async(pa, tenant) -> None:
    """Async wrapper: run sync_submissions_for_payment_assignment."""
    try:
        count = sync_submissions_for_payment_assignment(pa, tenant, tenant.schema_name)
        if count > 0:
            logger.info("PaymentAssignment %s: %s UserPayment(s) created", pa.id, count)
    except Exception as e:
        logger.error("Error syncing PaymentAssignment %s: %s", pa.id, e, exc_info=True)


class Command(BaseCommand):
    help = "Sync new submissions from Teams payment assignments to UserPayment (daily cron)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema-name",
            type=str,
            help="Tenant schema to use (Organization.schema_name), e.g. xteachersu. "
            "Required when the DB connection is public (plain manage.py shell).",
        )
        parser.add_argument(
            "--course-id",
            type=int,
            default=None,
            help="Optional. Sync only payment assignments for this course.",
        )
        parser.add_argument(
            "--sync",
            action="store_true",
            help="Run synchronously (no async queue). Default: async.",
        )

    def handle(self, *args, **options):
        course_id = options.get("course_id")
        run_sync = options.get("sync", False)
        schema_opt = (options.get("schema_name") or "").strip() or None
        logger.info(
            "Running [sync-payment-submissions]"
            + (f" (course_id={course_id})" if course_id else "")
            + (f" (schema={schema_opt})" if schema_opt else "")
            + (" (sync)" if run_sync else " (async)")
        )

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
                self._sync_submissions_for_tenant(
                    org=org,
                    connection_schema_label=schema_opt,
                    course_id=course_id,
                    run_sync=run_sync,
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
                    "`python manage.py sync-payment-submissions --schema-name=xteachersu --sync`."
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

        self._sync_submissions_for_tenant(
            org=org,
            connection_schema_label=tenant_schema,
            course_id=course_id,
            run_sync=run_sync,
        )

    def _sync_submissions_for_tenant(
        self,
        *,
        org: Organization,
        connection_schema_label: str,
        course_id: int | None,
        run_sync: bool,
    ) -> None:
        schema_name = org.schema_name
        total_created = 0
        total_queued = 0
        boot = (
            f"tenant_schema={connection_schema_label!r} org_id={org.id} org.schema_name={schema_name!r} "
            f"is_microsoft_on={org.is_microsoft_on}"
        )
        logger.info(boot)
        self.stdout.write(boot)
        logger.info(f"{'Processing' if run_sync else 'Queueing'} organization [{schema_name}]")

        payment_assignments = payment_assignments_for_sync_queryset(
            org, course_id=course_id
        )

        pa_count = payment_assignments.count()
        summary = (
            f"Eligible payment assignment(s): {pa_count} "
            "(last 3 calendar months, is_payment_enabled=True)"
        )
        logger.info(summary)
        self.stdout.write(summary)

        for pa in payment_assignments:
            if run_sync:
                try:
                    count = sync_submissions_for_payment_assignment(
                        pa, org, schema_name
                    )
                    total_created += count
                    if count > 0:
                        logger.info(
                            f"  PaymentAssignment {pa.id}: {count} UserPayment(s) created"
                        )
                except Exception as e:
                    logger.error(
                        f"  Error syncing PaymentAssignment {pa.id}: {e}",
                        exc_info=True,
                    )
            else:
                sync_payment_submissions_for_payment_assignment_async.delay(
                    pa.id,
                    schema_name,
                )
                total_queued += 1

        if run_sync:
            logger.info(f"Sync complete. Total UserPayments created: {total_created}")
            self.stdout.write(
                self.style.SUCCESS(f"Created {total_created} UserPayment(s) from submissions")
            )
        else:
            logger.info(f"Queued {total_queued} payment submission sync task(s)")
            self.stdout.write(
                self.style.SUCCESS(f"Queued {total_queued} payment submission sync task(s)")
            )

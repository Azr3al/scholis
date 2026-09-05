"""
Helpers for creating Microsoft Teams payment assignments (monthly screenshot uploads).
"""

import logging
import re
from calendar import month_abbr, month_name, monthrange
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from enum import Enum

import pytz
from django.core.cache import cache
from django.db import IntegrityError
from rest_framework.exceptions import ValidationError
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import Course, PaymentAssignment
from app_microsoft.graph_wrapper.education import MSEducation
from app_organization.models import Organization
from app_utils.ops_discord import notify_discord_ops
from utilitas.async_tasks import django_q_task, tenant_async
from utilitas.exceptions import field_validation_error

logger = logging.getLogger(__name__)

# Fixed calendar schedule for ``ensure-payment-assignments`` / ``create-payment-assignments`` (catch-up through month end).
# FM: first eligible day is this calendar day in the month *before* the payment month (e.g. March payment → 20 Feb).
FM_PAYMENT_ASSIGNMENT_CREATION_DAY = 20
# HM: first eligible day is this calendar day *in* the payment month (first month of the HM pair; e.g. Mar–Apr → 9 Mar).
HM_PAYMENT_ASSIGNMENT_CREATION_DAY = 9
PAYMENT_ASSIGNMENT_CREATE_LOCK_TTL = 300

_PAYMENT_LIKE_FM_RE = re.compile(r"^.+ \d{4} payment$", re.IGNORECASE)
_PAYMENT_LIKE_HM_RE = re.compile(r"^.+ - .+ \d{4} payment$", re.IGNORECASE)


@dataclass(frozen=True)
class DuplicatePaymentAssignmentCandidate:
    """MS Teams assignment flagged as a duplicate orphan for deletion."""

    microsoft_assignment_id: str
    display_name: str
    keep_microsoft_assignment_id: str
    year: int | None = None
    month_index: int | None = None
    reason: str = "duplicate"


def _normalize_payment_assignment_display_name(display_name: str) -> str:
    return display_name.strip().lower()


def _is_payment_like_display_name(display_name: str) -> bool:
    normalized = _normalize_payment_assignment_display_name(display_name)
    if not normalized.endswith(" payment"):
        return False
    return bool(_PAYMENT_LIKE_FM_RE.match(normalized) or _PAYMENT_LIKE_HM_RE.match(normalized))


def _payment_assignment_create_lock_key(
    tenant: Organization, course_id: int, year: int, month_index: int
) -> str:
    schema = getattr(tenant, "schema_name", None) or "unknown"
    return f"payment_assignment_create:{schema}:{course_id}:{year}:{month_index}"


def _assignment_created_datetime(assignment: dict) -> datetime:
    raw = assignment.get("createdDateTime") or assignment.get("lastModifiedDateTime") or ""
    if not raw:
        return datetime.min.replace(tzinfo=pytz.UTC)
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return datetime.min.replace(tzinfo=pytz.UTC)


def _count_submissions(
    education: MSEducation, class_id: str, assignment_id: str
) -> int:
    res = education.list_submissions(class_id, assignment_id, status_filter="submitted")
    if res.status_code not in range(199, 300):
        return 0
    return len(res.json().get("value", []))


def _pick_assignment_to_keep(
    education: MSEducation,
    class_id: str,
    assignments: list[dict],
    *,
    preferred_id: str | None = None,
) -> str:
    if preferred_id and any(a.get("id") == preferred_id for a in assignments):
        return preferred_id
    if len(assignments) == 1:
        return assignments[0]["id"]
    scored: list[tuple[int, datetime, str]] = []
    for assignment in assignments:
        assignment_id = assignment.get("id")
        if not assignment_id:
            continue
        submission_count = _count_submissions(education, class_id, assignment_id)
        scored.append(
            (
                submission_count,
                _assignment_created_datetime(assignment),
                assignment_id,
            )
        )
    if not scored:
        return assignments[0]["id"]
    scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return scored[0][2]


def delete_orphan_ms_assignment(
    course: Course,
    tenant: Organization,
    microsoft_assignment_id: str,
) -> tuple[bool, str]:
    """Delete an orphaned assignment from Teams only (DB rows unchanged)."""
    if not course.microsoft_group_id:
        return False, "Course has no microsoft_group_id"
    try:
        education = MSEducation(tenant)
        res = education.delete_assignment(
            class_id=course.microsoft_group_id,
            assignment_id=microsoft_assignment_id,
        )
        if res.status_code in range(199, 300) or res.status_code == 404:
            return True, "Deleted orphan from MS Teams"
        detail = f"MS delete failed: {res.status_code} {res.text[:200]}"
        _discord_ms_payment_assignment_line(
            tenant,
            course,
            action="delete_orphan_assignment Graph error",
            status_code=res.status_code,
            detail=detail,
        )
        return False, detail
    except Exception as exc:
        logger.exception(
            "Error deleting orphan MS assignment %s for course %s: %s",
            microsoft_assignment_id,
            course.id,
            exc,
        )
        _discord_ms_payment_assignment_line(
            tenant,
            course,
            action="delete_orphan_assignment exception",
            status_code=None,
            detail=str(exc),
        )
        return False, str(exc)


def find_duplicate_payment_assignments_for_course(
    course: Course,
    tenant: Organization,
    *,
    year: int | None = None,
    month_index: int | None = None,
) -> list[DuplicatePaymentAssignmentCandidate]:
    """
    Find duplicate payment-like MS assignments for a course.
    One list_assignments call per course; compares against PaymentAssignment rows.
    """
    if not course.microsoft_group_id:
        return []

    pa_qs = PaymentAssignment.objects.filter(course=course)
    if year is not None:
        pa_qs = pa_qs.filter(year=year)
    if month_index is not None:
        pa_qs = pa_qs.filter(month_index=month_index)
    payment_assignments = list(pa_qs)

    education = MSEducation(tenant)
    ms_assignments = education.list_assignments(course.microsoft_group_id)
    payment_like = [
        a for a in ms_assignments if _is_payment_like_display_name(a.get("displayName", ""))
    ]

    by_norm_name: dict[str, list[dict]] = {}
    for assignment in payment_like:
        norm = _normalize_payment_assignment_display_name(assignment.get("displayName", ""))
        by_norm_name.setdefault(norm, []).append(assignment)

    pa_by_norm_name: dict[str, PaymentAssignment] = {}
    for pa in payment_assignments:
        expected = get_assignment_display_name(course, pa.year, pa.month_index)
        pa_by_norm_name[_normalize_payment_assignment_display_name(expected)] = pa

    candidates: list[DuplicatePaymentAssignmentCandidate] = []
    seen_delete_ids: set[str] = set()

    for norm_name, group in by_norm_name.items():
        if len(group) <= 1:
            continue

        pa_row = pa_by_norm_name.get(norm_name)
        preferred_id = pa_row.microsoft_assignment_id if pa_row else None
        if preferred_id and not any(a.get("id") == preferred_id for a in group):
            logger.warning(
                "Canonical MS assignment %s missing from Teams for course %s (%s); "
                "picking best substitute among %s duplicates",
                preferred_id,
                course.id,
                norm_name,
                len(group),
            )
            preferred_id = None

        keep_id = _pick_assignment_to_keep(
            education,
            course.microsoft_group_id,
            group,
            preferred_id=preferred_id,
        )
        pa_year = pa_row.year if pa_row else None
        pa_month = pa_row.month_index if pa_row else None
        reason = "duplicate_with_db_row" if pa_row else "duplicate_no_db_row"

        for assignment in group:
            assignment_id = assignment.get("id")
            if not assignment_id or assignment_id == keep_id or assignment_id in seen_delete_ids:
                continue
            seen_delete_ids.add(assignment_id)
            candidates.append(
                DuplicatePaymentAssignmentCandidate(
                    microsoft_assignment_id=assignment_id,
                    display_name=assignment.get("displayName", ""),
                    keep_microsoft_assignment_id=keep_id,
                    year=pa_year,
                    month_index=pa_month,
                    reason=reason,
                )
            )

    return candidates


def cleanup_duplicate_payment_assignments_for_course(
    course: Course,
    tenant: Organization,
    *,
    year: int | None = None,
    month_index: int | None = None,
    dry_run: bool = False,
) -> dict:
    """
    Find and delete duplicate orphan payment assignments for one course.
    Returns summary dict with found/deleted/failed counts and detail lines.
    """
    result = {
        "found": 0,
        "deleted": 0,
        "failed": 0,
        "details": [],
    }
    candidates = find_duplicate_payment_assignments_for_course(
        course,
        tenant,
        year=year,
        month_index=month_index,
    )
    result["found"] = len(candidates)
    for candidate in candidates:
        line_prefix = (
            f"Course {course.id} ({course.title!r}) "
            f"orphan={candidate.microsoft_assignment_id!r} "
            f"keep={candidate.keep_microsoft_assignment_id!r} "
            f"name={candidate.display_name!r}"
        )
        if dry_run:
            result["details"].append(f"Would delete: {line_prefix} ({candidate.reason})")
            continue
        success, msg = delete_orphan_ms_assignment(
            course, tenant, candidate.microsoft_assignment_id
        )
        if success:
            result["deleted"] += 1
            result["details"].append(f"Deleted: {line_prefix} — {msg}")
        else:
            result["failed"] += 1
            result["details"].append(f"FAILED: {line_prefix} — {msg}")
    return result


def org_local_today(org: Organization) -> date:
    """Calendar date in the organization's timezone (falls back to UTC)."""
    tz_name = (org.timezone or "").strip() or "UTC"
    try:
        tz = pytz.timezone(tz_name)
    except pytz.UnknownTimeZoneError:
        tz = pytz.UTC
    return datetime.now(tz).date()


def fm_payment_assignment_ensure_window(
    payment_year: int, payment_month: int
) -> tuple[date, date]:
    """
    FM: inclusive catch-up window from the 20th of the prior month through the last day of the payment month.
    Example: payment month March → 20 Feb .. 31 Mar.
    """
    if payment_month == 1:
        prev_y, prev_m = payment_year - 1, 12
    else:
        prev_y, prev_m = payment_year, payment_month - 1
    creation_start = date(prev_y, prev_m, FM_PAYMENT_ASSIGNMENT_CREATION_DAY)
    last_d = monthrange(payment_year, payment_month)[1]
    month_end = date(payment_year, payment_month, last_d)
    return creation_start, month_end


def hm_payment_assignment_ensure_window(
    payment_year: int, payment_month: int
) -> tuple[date, date]:
    """
    HM: inclusive catch-up window from the 9th of the payment month through its last day.
    Example: payment month March (Mar–Apr label) → 9 Mar .. 31 Mar.
    """
    creation_start = date(payment_year, payment_month, HM_PAYMENT_ASSIGNMENT_CREATION_DAY)
    last_d = monthrange(payment_year, payment_month)[1]
    month_end = date(payment_year, payment_month, last_d)
    return creation_start, month_end


def payment_assignment_month_in_ensure_window(
    today: date,
    payment_year: int,
    payment_month: int,
    course: Course,
) -> bool:
    """True when ``today`` is in the FM/HM catch-up window for this payment month."""
    if is_hm_course(course):
        start, end = hm_payment_assignment_ensure_window(payment_year, payment_month)
    else:
        start, end = fm_payment_assignment_ensure_window(payment_year, payment_month)
    return start <= today <= end


def _discord_ms_payment_assignment_line(
    tenant: Organization,
    course: Course | None,
    *,
    action: str,
    status_code: int | None,
    detail: str,
) -> None:
    sn = getattr(tenant, "schema_name", "?")
    lines = [
        f"[Schedjuice] MS payment assignment: {action}",
        f"tenant={sn}",
    ]
    if course is not None:
        lines.append(f"course_id={course.id} title={course.title!r}")
    if status_code is not None:
        lines.append(f"http_status={status_code}")
    lines.append(str(detail)[:1200])
    notify_discord_ops("\n".join(lines), tenant=tenant)


class PaymentAssignmentMonthPrecheckFailure(str, Enum):
    """Reason creation/read logic skips a (course, calendar month)."""

    NO_MICROSOFT_GROUP = "no_microsoft_group"
    PAYMENT_DISABLED = "payment_disabled"
    CATEGORY_NOT_ELIGIBLE = "category_not_eligible"
    COURSE_ENDED_BEFORE_MONTH = "course_ended_before_month"
    COURSE_NOT_STARTED_YET = "course_not_started_yet"
    INVALID_MONTH_INDEX = "invalid_month_index"
    FIRST_MONTH_OF_COURSE = "first_month_of_course"


def payment_assignment_month_precheck(
    course: Course,
    year: int,
    month_index: int,
    target_date: date,
) -> PaymentAssignmentMonthPrecheckFailure | None:
    """
    Return None if all guards pass (assignment may be created for this month).
    Otherwise return why creation would be skipped — same rules as
    ``create_payment_assignment_for_course_month`` before Graph/DB create.
    """
    if not course.microsoft_group_id:
        return PaymentAssignmentMonthPrecheckFailure.NO_MICROSOFT_GROUP
    if not course.is_payment_enabled:
        return PaymentAssignmentMonthPrecheckFailure.PAYMENT_DISABLED
    if not course.category.is_payment_assignment_eligible:
        return PaymentAssignmentMonthPrecheckFailure.CATEGORY_NOT_ELIGIBLE
    if course.end_date < target_date:
        return PaymentAssignmentMonthPrecheckFailure.COURSE_ENDED_BEFORE_MONTH
    last_day_of_month = (
        date(target_date.year, target_date.month + 1, 1) - timedelta(days=1)
        if target_date.month < 12
        else date(target_date.year, 12, 31)
    )
    if course.start_date > last_day_of_month:
        return PaymentAssignmentMonthPrecheckFailure.COURSE_NOT_STARTED_YET
    if not 1 <= month_index <= 12:
        return PaymentAssignmentMonthPrecheckFailure.INVALID_MONTH_INDEX
    if is_first_month_of_course(course, year, month_index):
        return PaymentAssignmentMonthPrecheckFailure.FIRST_MONTH_OF_COURSE
    return None


def _log_precheck_failure(
    course: Course,
    failure: PaymentAssignmentMonthPrecheckFailure,
    year: int,
    month_index: int,
    target_date: date,
) -> None:
    if failure is PaymentAssignmentMonthPrecheckFailure.NO_MICROSOFT_GROUP:
        logger.debug("Course %s has no microsoft_group_id, skipping", course.id)
    elif failure is PaymentAssignmentMonthPrecheckFailure.PAYMENT_DISABLED:
        logger.debug("Course %s has payment disabled, skipping", course.id)
    elif failure is PaymentAssignmentMonthPrecheckFailure.CATEGORY_NOT_ELIGIBLE:
        logger.debug(
            "Course %s category '%s' not eligible for payment assignments, skipping",
            course.id,
            course.category.name,
        )
    elif failure is PaymentAssignmentMonthPrecheckFailure.COURSE_ENDED_BEFORE_MONTH:
        logger.debug("Course %s ended before %s, skipping", course.id, target_date)
    elif failure is PaymentAssignmentMonthPrecheckFailure.COURSE_NOT_STARTED_YET:
        logger.debug(
            "Course %s starts after month end, skipping %s-%s",
            course.id,
            year,
            month_index,
        )
    elif failure is PaymentAssignmentMonthPrecheckFailure.INVALID_MONTH_INDEX:
        logger.debug("Invalid month_index %s for course %s", month_index, course.id)
    elif failure is PaymentAssignmentMonthPrecheckFailure.FIRST_MONTH_OF_COURSE:
        logger.debug(
            "Skipping first month of course %s (%s-%s)",
            course.id,
            year,
            month_index,
        )


class PaymentAssignmentMonthApiStatus(str, Enum):
    """API / UI classification for a (course, year, month)."""

    CREATED = "created"
    NOT_APPLICABLE = "not_applicable"
    SKIPPED = "skipped"
    SCHEDULED = "scheduled"
    EXPECTED_BUT_MISSING = "expected_but_missing"
    MISSED = "missed"


_SKIPPED_FAILURES = frozenset(
    {
        PaymentAssignmentMonthPrecheckFailure.COURSE_ENDED_BEFORE_MONTH,
        PaymentAssignmentMonthPrecheckFailure.COURSE_NOT_STARTED_YET,
        PaymentAssignmentMonthPrecheckFailure.FIRST_MONTH_OF_COURSE,
    }
)


def classify_precheck_failure(
    failure: PaymentAssignmentMonthPrecheckFailure,
) -> PaymentAssignmentMonthApiStatus:
    if failure in _SKIPPED_FAILURES:
        return PaymentAssignmentMonthApiStatus.SKIPPED
    return PaymentAssignmentMonthApiStatus.NOT_APPLICABLE


def get_payment_assignment_month_status(
    course: Course,
    year: int,
    month_index: int,
    *,
    target_date: date | None = None,
    org: Organization | None = None,
    today: date | None = None,
) -> dict:
    """
    Lookup-first status for Teams payment assignment for a calendar month.

    Returns keys: assignment_exists (bool), payment_assignment_id (int|None),
    status (PaymentAssignmentMonthApiStatus value),
    precheck_failure (str|None) — machine-readable when no DB row,
    creation_window_start (str|None) — ISO date when status is scheduled,
    creation_window_end (str|None) — ISO date when status is missed.
    """
    td = target_date or date(year, month_index, 1)
    pa = PaymentAssignment.objects.filter(
        course_id=course.id,
        year=year,
        month_index=month_index,
    ).first()
    if pa:
        return {
            "assignment_exists": True,
            "payment_assignment_id": pa.id,
            "status": PaymentAssignmentMonthApiStatus.CREATED.value,
            "precheck_failure": None,
            "creation_window_start": None,
            "creation_window_end": None,
        }
    failure = payment_assignment_month_precheck(course, year, month_index, td)
    if failure is None:
        if org is not None:
            today_org = today if today is not None else org_local_today(org)
            if is_hm_course(course):
                window_start, window_end = hm_payment_assignment_ensure_window(
                    year, month_index
                )
            else:
                window_start, window_end = fm_payment_assignment_ensure_window(
                    year, month_index
                )
            if today_org < window_start:
                return {
                    "assignment_exists": False,
                    "payment_assignment_id": None,
                    "status": PaymentAssignmentMonthApiStatus.SCHEDULED.value,
                    "precheck_failure": None,
                    "creation_window_start": window_start.isoformat(),
                    "creation_window_end": None,
                }
            if today_org > window_end:
                return {
                    "assignment_exists": False,
                    "payment_assignment_id": None,
                    "status": PaymentAssignmentMonthApiStatus.MISSED.value,
                    "precheck_failure": None,
                    "creation_window_start": None,
                    "creation_window_end": window_end.isoformat(),
                }
        return {
            "assignment_exists": False,
            "payment_assignment_id": None,
            "status": PaymentAssignmentMonthApiStatus.EXPECTED_BUT_MISSING.value,
            "precheck_failure": None,
            "creation_window_start": None,
            "creation_window_end": None,
        }
    return {
        "assignment_exists": False,
        "payment_assignment_id": None,
        "status": classify_precheck_failure(failure).value,
        "precheck_failure": failure.value,
        "creation_window_start": None,
        "creation_window_end": None,
    }


def iter_courses_expecting_payment_assignment_month(
    year: int,
    month_index: int,
    *,
    include_existing: bool = False,
) -> list[tuple[Course, bool]]:
    """
    Tenant schema context must be active.

    Returns (course, has_assignment_row) for courses that pass precheck for
    ``date(year, month_index, 1)``. When ``include_existing`` is False (default),
    only courses with no PaymentAssignment row for that month are returned.
    """
    target_date = date(year, month_index, 1)
    qs = (
        Course.objects.filter(
            microsoft_group_id__isnull=False,
            category__is_payment_assignment_eligible=True,
        )
        .exclude(microsoft_group_id="")
        .select_related("category")
    )
    out: list[tuple[Course, bool]] = []
    for course in qs:
        if not course.is_payment_enabled:
            continue
        if payment_assignment_month_precheck(course, year, month_index, target_date):
            continue
        has_row = PaymentAssignment.objects.filter(
            course_id=course.id,
            year=year,
            month_index=month_index,
        ).exists()
        if not include_existing and has_row:
            continue
        out.append((course, has_row))
    return out


def is_hm_course(course: Course) -> bool:
    from app_course.course_month_type import is_hm_course as _is_hm_course

    return _is_hm_course(course)


def get_assignment_display_name(course: Course, year: int, month_index: int) -> str:
    """
    FM: "January 2025 payment"
    HM: "Jan - Feb 2025 payment" (billing period spans two months)
    """
    if is_hm_course(course):
        month1 = month_abbr[month_index].strip()  # "Jan", "Feb", etc.
        if month_index == 12:
            month2 = month_abbr[1].strip()
            next_year = year + 1
            return f"{month1} - {month2} {next_year} payment"
        month2 = month_abbr[month_index + 1].strip()
        return f"{month1} - {month2} {year} payment"
    return f"{month_name[month_index]} {year} payment"


def is_first_month_of_course(course: Course, year: int, month_index: int) -> bool:
    """
    Return True if (year, month_index) is the first month of the course.
    No assignment is created for the first month (students paid elsewhere).
    """
    return course.start_date.year == year and course.start_date.month == month_index


def get_month_index_for_date(target_date: date) -> int:
    """
    Return the calendar month index for a given date.
    Jan = 1, Feb = 2, ..., Dec = 12.
    """
    return target_date.month


def get_month_name_and_index_for_date(target_date: date) -> tuple[str, int]:
    """Return (month_name, month_index) for a given date, e.g. ('January', 1)."""
    month_index = get_month_index_for_date(target_date)
    month_name_str = month_name[target_date.month]  # calendar.month_name[1] = 'January', etc.
    return month_name_str, month_index


def get_due_date_for_month(
    target_date: date, tenant: Organization, course: Course | None = None
) -> datetime:
    """
    Return due datetime at 23:59 in tenant timezone.
    FM: due 2 days after the payment month's start date (anchor = 1st of month).
    HM: due 2 days after the course's start_date.day within the payment month.

    Examples:
    - FM payment for March 2025 → anchor = 2025-03-01 → due = 2025-03-03.
    - HM course with start_date.day = 16, payment month = February 2025
      → anchor = 2025-02-16 → due = 2025-02-18.
    """
    # Normalize to the first day of the payment month represented by target_date.
    payment_month_start = date(target_date.year, target_date.month, 1)

    if course and is_hm_course(course):
        # HM: anchor on the course's start_date.day within the payment month.
        anchor_day = course.start_date.day
        anchor_date = date(payment_month_start.year, payment_month_start.month, anchor_day)
    else:
        # FM (or no course provided): anchor on the 1st of the payment month.
        anchor_date = payment_month_start

    due_date = anchor_date + timedelta(days=2)
    tz = pytz.timezone(tenant.timezone or "UTC")
    due_dt = datetime.combine(due_date, time(23, 59, 0))
    return tz.localize(due_dt)


def ensure_graph_due_datetime_in_future(
    due_dt: datetime,
    tenant: Organization,
    *,
    fallback_days_ahead: int = 2,
) -> datetime:
    """
    Microsoft Graph rejects dueDateTime in the past (400 invalidDate / "Due date must be in the future").

    Nominal dues from ``get_due_date_for_month`` can be in the past when creation runs late
    (missed cron, downtime, backfill). In that case use end of the calendar day that is
    ``fallback_days_ahead`` days after *now* in the tenant timezone (same 23:59 convention).
    """
    tz = pytz.timezone(tenant.timezone or "UTC")
    if due_dt.tzinfo is None:
        aware_due = tz.localize(due_dt)
    else:
        aware_due = due_dt.astimezone(tz)
    now = datetime.now(tz)
    if aware_due > now:
        return aware_due
    fallback_day = now.date() + timedelta(days=fallback_days_ahead)
    adjusted = tz.localize(datetime.combine(fallback_day, time(23, 59, 0)))
    if adjusted <= now:
        adjusted = now + timedelta(hours=1)
    sn = getattr(tenant, "schema_name", None) or getattr(tenant, "pk", "?")
    logger.info(
        "MS assignment due date adjusted for Graph (must be future): %s → %s "
        "(tenant_schema=%s, now=%s)",
        aware_due.isoformat(),
        adjusted.isoformat(),
        sn,
        now.isoformat(),
    )
    return adjusted


def create_payment_assignment_for_course_month(
    course: Course,
    tenant: Organization,
    year: int,
    month_index: int,
    target_date: date,
) -> PaymentAssignment | None:
    """
    Create a Microsoft Teams payment assignment for a course month.
    month_index = 1 for Jan, 2 for Feb, etc.
    FM: "January 2025 payment"; HM: "Jan - Feb 2025 payment".
    Returns PaymentAssignment if created, None if skipped or failed.
    """
    failure = payment_assignment_month_precheck(course, year, month_index, target_date)
    if failure is not None:
        _log_precheck_failure(course, failure, year, month_index, target_date)
        return None

    existing = PaymentAssignment.objects.filter(
        course=course,
        year=year,
        month_index=month_index,
    ).first()
    if existing:
        logger.debug(f"PaymentAssignment already exists for course {course.id} {year}-{month_index}")
        return existing

    lock_key = _payment_assignment_create_lock_key(tenant, course.id, year, month_index)
    if not cache.add(lock_key, "1", PAYMENT_ASSIGNMENT_CREATE_LOCK_TTL):
        existing = PaymentAssignment.objects.filter(
            course=course,
            year=year,
            month_index=month_index,
        ).first()
        if existing:
            logger.info(
                "Payment assignment create lock held; returning existing row "
                "course=%s %s-%s",
                course.id,
                year,
                month_index,
            )
            return existing
        logger.warning(
            "Payment assignment create lock held but no DB row yet "
            "course=%s %s-%s; skipping duplicate create",
            course.id,
            year,
            month_index,
        )
        return None

    display_name = get_assignment_display_name(course, year, month_index)
    instructions = (
        "Please upload your payment screenshot for this month. "
        "This assignment is for students to submit proof of payment."
    )
    due_dt = ensure_graph_due_datetime_in_future(
        get_due_date_for_month(target_date, tenant, course),
        tenant,
    )

    education = MSEducation(tenant)
    assignment_id: str | None = None
    try:
        res = education.create_assignment(
            class_id=course.microsoft_group_id,
            display_name=display_name,
            instructions=instructions,
            due_datetime=due_dt,
        )
        if res.status_code not in range(199, 300):
            logger.error(
                f"Failed to create MS assignment for course {course.id}: {res.status_code} {res.text}"
            )
            _discord_ms_payment_assignment_line(
                tenant,
                course,
                action="create_assignment failed",
                status_code=res.status_code,
                detail=res.text or "",
            )
            field_validation_error(
                "MS_ASSIGNMENT_ERROR", res.json() if res.text else res.text
            )

        data = res.json()
        assignment_id = data.get("id")
        if not assignment_id:
            _discord_ms_payment_assignment_line(
                tenant,
                course,
                action="create_assignment missing id in response",
                status_code=res.status_code,
                detail=str(data)[:1200],
            )
            field_validation_error("MS_ASSIGNMENT_ERROR", "No assignment id in response")

        # Publish so students can see it
        pub_res = education.publish_assignment(
            class_id=course.microsoft_group_id,
            assignment_id=assignment_id,
        )
        if pub_res.status_code not in range(199, 300):
            logger.warning(
                f"Assignment created but publish failed for course {course.id}: {pub_res.status_code}"
            )
            _discord_ms_payment_assignment_line(
                tenant,
                course,
                action="publish_assignment failed (assignment may be draft in Teams)",
                status_code=pub_res.status_code,
                detail=pub_res.text or "",
            )
            # Still save the record - assignment exists in draft

        try:
            pa = PaymentAssignment.objects.create(
                course=course,
                year=year,
                month_index=month_index,
                microsoft_assignment_id=assignment_id,
            )
        except IntegrityError:
            # unique_together (course, year, month_index) — concurrent create or race with another worker
            existing_pa = PaymentAssignment.objects.filter(
                course=course,
                year=year,
                month_index=month_index,
            ).first()
            if existing_pa:
                logger.warning(
                    "PaymentAssignment row already exists for course %s %s-%s (concurrent create); "
                    "deleting duplicate MS assignment %s",
                    course.id,
                    year,
                    month_index,
                    assignment_id,
                )
                if assignment_id:
                    delete_orphan_ms_assignment(course, tenant, assignment_id)
                return existing_pa
            raise
        logger.info(f"Created payment assignment '{display_name}' for course {course.id}")
        return pa
    except ValidationError:
        raise
    except Exception as e:
        logger.exception(f"Error creating payment assignment for course {course.id}: {e}")
        _discord_ms_payment_assignment_line(
            tenant,
            course,
            action="create_payment_assignment unexpected error",
            status_code=None,
            detail=str(e),
        )
        field_validation_error("MS_ASSIGNMENT_ERROR", str(e))
    finally:
        cache.delete(lock_key)


@django_q_task
@tenant_async(entity=Course)
def create_payment_assignment_for_course_month_async(
    course, tenant, year: int, month_index: int
):
    """Async wrapper for create_payment_assignment_for_course_month."""
    try:
        target_date = date(year, month_index, 1)
        create_payment_assignment_for_course_month(
            course,
            tenant,
            year,
            month_index,
            target_date,
        )
    except Exception as exc:
        logger.exception(
            "create_payment_assignment_for_course_month_async failed "
            "course_id=%s schema=%s %s-%s",
            course.id,
            tenant.schema_name,
            year,
            month_index,
        )
        _discord_ms_payment_assignment_line(
            tenant,
            course,
            action=f"async create failed ({year}-{month_index:02d})",
            status_code=None,
            detail=str(exc),
        )
        raise


@django_q_task
def create_payment_assignment_for_course_async(course_id: int, schema_name: str):
    """Async wrapper for current month. Used on course creation."""
    today = date.today()
    create_payment_assignment_for_course_month_async.delay(
        course_id, schema_name, today.year, today.month
    )


@django_q_task
@tenant_async(entity=Course)
def cleanup_duplicate_payment_assignments_for_course_async(
    course,
    tenant,
    *,
    year: int | None = None,
    month_index: int | None = None,
):
    """Async wrapper: dedupe orphan payment assignments for one course."""
    try:
        result = cleanup_duplicate_payment_assignments_for_course(
            course,
            tenant,
            year=year,
            month_index=month_index,
            dry_run=False,
        )
        if result["found"]:
            logger.info(
                "cleanup_duplicate_payment_assignments course=%s found=%s deleted=%s failed=%s",
                course.id,
                result["found"],
                result["deleted"],
                result["failed"],
            )
        return result
    except Exception as exc:
        logger.exception(
            "cleanup_duplicate_payment_assignments_for_course_async failed course_id=%s: %s",
            course.id,
            exc,
        )
        _discord_ms_payment_assignment_line(
            tenant,
            course,
            action="cleanup_duplicate_payment_assignments failed",
            status_code=None,
            detail=str(exc),
        )
        raise


@django_q_task
@tenant_async(entity=PaymentAssignment)
def update_payment_assignment_async(pa, tenant):
    """Async wrapper for updating a single PaymentAssignment's display name and due date."""
    course = pa.course
    if not course.microsoft_group_id:
        return
    try:
        target_date = date(pa.year, pa.month_index, 1)
        display_name = get_assignment_display_name(course, pa.year, pa.month_index)
        due_dt = ensure_graph_due_datetime_in_future(
            get_due_date_for_month(target_date, tenant, course),
            tenant,
        )
        education = MSEducation(tenant)
        res = education.update_assignment(
            class_id=course.microsoft_group_id,
            assignment_id=pa.microsoft_assignment_id,
            display_name=display_name,
            due_datetime=due_dt,
        )
        if res.status_code in range(199, 300):
            logger.info(
                "Updated payment assignment %s for course %s (%s) %s-%s",
                pa.id,
                course.id,
                course.title,
                pa.year,
                pa.month_index,
            )
        else:
            logger.error(
                "Failed to update payment assignment %s: %s %s",
                pa.id,
                res.status_code,
                res.text[:200],
            )
            _discord_ms_payment_assignment_line(
                tenant,
                course,
                action=f"update_assignment failed (pa_id={pa.id})",
                status_code=res.status_code,
                detail=res.text or "",
            )
    except Exception as e:
        logger.exception(
            "Failed to update payment assignment %s (schema=%s): %s",
            pa.id,
            tenant.schema_name,
            e,
        )
        _discord_ms_payment_assignment_line(
            tenant,
            course,
            action=f"update_assignment exception (pa_id={pa.id})",
            status_code=None,
            detail=str(e),
        )


@django_q_task
@tenant_async(entity=PaymentAssignment)
def delete_payment_assignment_async(pa, tenant):
    """Async wrapper for deleting a single PaymentAssignment."""
    try:
        success, msg = delete_payment_assignment(pa, tenant)
        if success:
            logger.info(
                "Deleted payment assignment %s (course %s %s-%s): %s",
                pa.id,
                pa.course.id,
                pa.year,
                pa.month_index,
                msg,
            )
        else:
            logger.error("Failed to delete payment assignment %s: %s", pa.id, msg)
    except Exception as e:
        logger.exception(
            "Failed to delete payment assignment %s (schema=%s): %s",
            pa.id,
            tenant.schema_name,
            e,
        )
        _discord_ms_payment_assignment_line(
            tenant,
            pa.course,
            action=f"delete_assignment exception (pa_id={pa.id})",
            status_code=None,
            detail=str(e),
        )


def delete_payment_assignment(
    pa: PaymentAssignment, tenant: Organization
) -> tuple[bool, str]:
    """
    Delete a payment assignment from MS Teams and the database.
    Returns (success, message).
    """
    if not pa.course.microsoft_group_id:
        pa.delete()
        return True, "Deleted local record (no microsoft_group_id)"
    try:
        education = MSEducation(tenant)
        res = education.delete_assignment(
            class_id=pa.course.microsoft_group_id,
            assignment_id=pa.microsoft_assignment_id,
        )
        if res.status_code in (200, 204) or res.status_code in range(199, 300):
            pa.delete()
            return True, "Deleted from MS Teams and local DB"
        # Assignment may already be deleted in Teams
        if res.status_code == 404:
            pa.delete()
            return True, "Deleted local record (assignment not found in MS Teams)"
        detail = f"MS delete failed: {res.status_code} {res.text[:200]}"
        _discord_ms_payment_assignment_line(
            tenant,
            pa.course,
            action="delete_assignment Graph error",
            status_code=res.status_code,
            detail=detail,
        )
        return False, detail
    except Exception as e:
        logger.exception(f"Error deleting payment assignment {pa.id}: {e}")
        _discord_ms_payment_assignment_line(
            tenant,
            pa.course,
            action="delete_assignment exception",
            status_code=None,
            detail=str(e),
        )
        return False, str(e)


def delete_ineligible_payment_assignments(schema_name: str | None = None) -> dict:
    """
    Find and delete PaymentAssignments for courses whose category.is_payment_assignment_eligible is False.
    schema_name: if provided, process only this tenant; otherwise all Microsoft-enabled orgs.
    Returns {"deleted": int, "failed": int, "details": list}.
    """
    result = {"deleted": 0, "failed": 0, "details": []}

    with schema_context(get_public_schema_name()):
        if schema_name:
            orgs = list(
                Organization.objects.filter(
                    schema_name=schema_name, is_microsoft_on=True
                )
            )
        else:
            orgs = list(Organization.objects.filter(is_microsoft_on=True))

    for org in orgs:
        sn = getattr(org, "schema_name", None)
        if not sn:
            continue
        with schema_context(sn):
            ineligible = PaymentAssignment.objects.filter(
                course__category__is_payment_assignment_eligible=False
            ).select_related("course")
            for pa in ineligible:
                success, msg = delete_payment_assignment(pa, org)
                if success:
                    result["deleted"] += 1
                    result["details"].append(
                        f"Course {pa.course.id} ({pa.course.title}): {pa.year}-{pa.month_index} - {msg}"
                    )
                else:
                    result["failed"] += 1
                    result["details"].append(
                        f"Course {pa.course.id} ({pa.course.title}): {pa.year}-{pa.month_index} - FAILED: {msg}"
                    )

    return result

"""
Helpers for syncing MS Teams attendance. Used by django-q async_task.
"""

import logging
from datetime import datetime

import pytz
from django.utils import timezone

from app_course.models import (
    Course,
    ProcessedVideoAttendanceReport,
    UserAttendance,
    UserCourse,
    VideoAttendanceSource,
)
from app_course.rate_utils import get_hourly_rate_for_teacher_course
from app_microsoft.graph_wrapper.meeting import MSMeeting
from app_microsoft.meeting_helpers import graph_organizer_user_id_for_course
from utilitas.async_tasks import django_q_task, tenant_async

logger = logging.getLogger(__name__)


def tenant_teams_attendance_sync_enabled(tenant) -> bool:
    """True when nightly Teams attendance sync is allowed for this tenant."""
    return bool(
        getattr(tenant, "is_teams_attendance_sync_enabled", False)
        and getattr(tenant, "is_microsoft_on", False)
    )


def course_eligible_for_teams_attendance_sync(course, tenant) -> bool:
    """True when sync_attendance_for_course may run for this course row."""
    return tenant_teams_attendance_sync_enabled(tenant) and bool(
        (course.microsoft_meeting_id or "").strip()
    )


def _parse_ms_datetime(dt_str):
    """Parse Microsoft's ISO datetime string to timezone-aware datetime.
    Truncates fractional seconds to 6 digits (microseconds) - Python's fromisoformat
    does not support 7+ digits (e.g. .2386176 from MS Graph).
    """
    if not dt_str:
        return None
    try:
        s = dt_str.replace("Z", "+00:00")
        # Truncate fractional seconds to 6 digits (microseconds)
        if "." in s:
            dot_idx = s.index(".")
            rest = s[dot_idx + 1 :]
            digit_end = 0
            while digit_end < len(rest) and rest[digit_end].isdigit():
                digit_end += 1
            if digit_end > 6:
                s = s[: dot_idx + 1 + 6] + rest[digit_end:]
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = timezone.make_aware(dt)
        return dt
    except (ValueError, TypeError):
        return None


def _course_event_windows_utc(course, tenant):
    """
    Build each Event's [start, end] in UTC for overlap checks against Graph report times.
    Same date+time combine pattern as meeting_helpers.create_course_meeting_if_needed.
    """
    tz = pytz.timezone(tenant.timezone or "UTC")
    windows = []
    for ev in course.events.order_by("date"):
        event_date = ev.date
        date_part = event_date.date() if isinstance(event_date, datetime) else event_date
        start_local = datetime.combine(date_part, ev.time_from)
        end_local = datetime.combine(date_part, ev.time_to)
        start_local = tz.localize(start_local)
        end_local = tz.localize(end_local)
        windows.append((start_local.astimezone(pytz.UTC), end_local.astimezone(pytz.UTC)))
    return windows


def _report_overlaps_event_windows(report, windows):
    """True if report meeting interval overlaps any course event window (all UTC)."""
    rs = _parse_ms_datetime(report.get("meetingStartDateTime"))
    re = _parse_ms_datetime(report.get("meetingEndDateTime"))
    if not rs or not re:
        return False
    for ws, we in windows:
        if rs < we and re > ws:
            return True
    return False


@django_q_task
@tenant_async(entity=Course)
def sync_attendance_for_course_async(course, tenant, channel_meeting: bool = False):
    """Async wrapper for sync_attendance_for_course."""
    try:
        count = sync_attendance_for_course(course, tenant, channel_meeting=channel_meeting)
        if count > 0:
            logger.info(
                "Course %s (%s): %s attendance records",
                course.id,
                course.title,
                count,
            )
    except Exception as e:
        logger.exception("Error syncing course %s: %s", course.id, e)


def sync_attendance_for_course(course, tenant, channel_meeting=False):
    """
    Sync attendance from MS Teams for a single course.

    channel_meeting: When True, List attendanceReports may return reports for all meetings in the
    channel (Microsoft Graph behavior). We filter reports to those overlapping any Course Event
    window, then load rows via GET .../attendanceReports/{id}/attendanceRecords (not Get with $expand),
    which is the supported pattern for channel meetings per Microsoft docs.
    """
    if not tenant_teams_attendance_sync_enabled(tenant):
        logger.debug(
            "Course %s: skip - Teams attendance sync disabled for tenant",
            course.id,
        )
        return 0
    if not course.microsoft_meeting_id:
        logger.debug("Course %s: skip - no microsoft_meeting_id", course.id)
        return 0
    graph_user_id = graph_organizer_user_id_for_course(course, tenant)
    if not graph_user_id:
        logger.warning("Course %s: skip attendance - no organizer id for Graph", course.id)
        return 0

    teacher_ucs = list(
        UserCourse.objects.filter(
            course=course,
            assigned_as=UserCourse.AssignedAs.TEACHER,
        ).select_related("user")
    )
    teacher_users = [uc.user for uc in teacher_ucs]
    teacher_user_ids = {u.id for u in teacher_users}

    if not teacher_users:
        logger.debug(f"Course {course.id}: no teachers assigned")
        return 0

    user_by_ms_id = {
        u.microsoft_id: u
        for u in teacher_users
        if u.microsoft_id
    }
    user_by_email = {
        (u.email or "").lower(): u
        for u in teacher_users
        if u.email
    }

    meeting = MSMeeting(tenant, use_app_auth=True)
    list_res = meeting.list_attendance_reports(
        user_id=graph_user_id,
        meeting_id=course.microsoft_meeting_id,
    )
    if list_res.status_code not in range(199, 300):
        body_preview = (list_res.text or "")[:800]
        logger.warning(
            "Failed to list attendance reports for course %s: %s %s",
            course.id,
            list_res.status_code,
            body_preview,
        )
        return 0

    reports_data = list_res.json()
    reports = reports_data.get("value", [])

    if channel_meeting:
        windows = _course_event_windows_utc(course, tenant)
        if not windows:
            logger.warning(
                "Course %s: --channel-meeting requires at least one Course Event; skip",
                course.id,
            )
            return 0
        reports = [r for r in reports if _report_overlaps_event_windows(r, windows)]
        if not reports:
            logger.info(
                "Course %s: channel meeting mode — no attendance reports overlap course event windows",
                course.id,
            )
            return 0
        logger.debug(
            "Course %s: channel mode — %s report(s) after event-window filter",
            course.id,
            len(reports),
        )

    processed_report_ids = set(
        ProcessedVideoAttendanceReport.objects.filter(
            course=course,
            platform=VideoAttendanceSource.MICROSOFT_TEAMS,
        ).values_list("external_report_id", flat=True)
    )

    existing_keys = set(
        UserAttendance.objects.filter(
            course=course,
            user_id__in=teacher_user_ids,
        ).values_list("user_id", "join_datetime", "leave_datetime")
    )

    to_create = []
    newly_processed_report_ids = []
    for report in reports:
        report_id = report.get("id")
        if not report_id or report_id in processed_report_ids:
            continue

        if channel_meeting:
            fetch_res = meeting.list_attendance_records(
                graph_user_id,
                course.microsoft_meeting_id,
                report_id,
            )
            if fetch_res.status_code not in range(199, 300):
                logger.warning(
                    "Course %s: list_attendance_records failed for report %s: %s %s",
                    course.id,
                    report_id,
                    fetch_res.status_code,
                    (fetch_res.text or "")[:400],
                )
                continue
            records = fetch_res.json().get("value", [])
        else:
            get_res = meeting.get_attendance_report(
                user_id=graph_user_id,
                meeting_id=course.microsoft_meeting_id,
                report_id=report_id,
                expand_records=True,
            )
            if get_res.status_code not in range(199, 300):
                logger.warning(
                    f"Course {course.id}: get_attendance_report failed for report {report_id}: "
                    f"{get_res.status_code} - {get_res.text[:200]}."
                )
                continue
            report_detail = get_res.json()
            records = report_detail.get("attendanceRecords", [])

        created_from_this_report = 0

        for record in records:
            identity = record.get("identity", {})
            ms_user_id = identity.get("id") or (identity.get("user") or {}).get("id")
            email = (record.get("emailAddress") or "").strip().lower()

            user = user_by_ms_id.get(ms_user_id) if ms_user_id else None
            if not user and email:
                user = user_by_email.get(email)
            if not user:
                continue

            intervals = record.get("attendanceIntervals", [])
            for interval in intervals:
                join_dt = _parse_ms_datetime(interval.get("joinDateTime"))
                leave_dt = _parse_ms_datetime(interval.get("leaveDateTime"))
                duration = interval.get("durationInSeconds", 0)

                if not join_dt or not leave_dt:
                    continue

                key = (user.id, join_dt, leave_dt)
                if key in existing_keys:
                    continue

                existing_keys.add(key)
                tz = pytz.timezone(tenant.timezone or "UTC")
                attendance_date = join_dt.astimezone(tz).date()
                att = UserAttendance(
                    user=user,
                    course=course,
                    source=VideoAttendanceSource.MICROSOFT_TEAMS,
                    join_datetime=join_dt,
                    leave_datetime=leave_dt,
                    duration_seconds=duration,
                    attendance_date=attendance_date,
                )
                rate = get_hourly_rate_for_teacher_course(user, course, tenant)
                if rate is not None:
                    att.hourly_rate_at_creation = rate
                to_create.append(att)
                created_from_this_report += 1

        if created_from_this_report > 0:
            newly_processed_report_ids.append(report_id)
            processed_report_ids.add(report_id)

    if to_create:
        UserAttendance.objects.bulk_create(to_create)

    if newly_processed_report_ids:
        ProcessedVideoAttendanceReport.objects.bulk_create(
            [
                ProcessedVideoAttendanceReport(
                    course=course,
                    platform=VideoAttendanceSource.MICROSOFT_TEAMS,
                    external_report_id=rid,
                )
                for rid in newly_processed_report_ids
            ]
        )

    if len(to_create) == 0 and (reports or newly_processed_report_ids):
        logger.info(
            f"Course {course.id} ({course.title}): 0 attendance records. "
            f"Reports: {len(reports)}, fetched {len(newly_processed_report_ids)} new. "
            f"Teachers: {len(user_by_ms_id)} with microsoft_id, {len(user_by_email)} with email. "
            f"If reports had data, check teacher microsoft_id/email matches MS Graph."
        )

    return len(to_create)

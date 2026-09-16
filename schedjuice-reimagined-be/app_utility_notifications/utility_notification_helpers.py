"""Canonical utility notification catalog for a user in the current tenant schema."""

from __future__ import annotations

import datetime as dt
from calendar import monthrange
from datetime import date, datetime, time, timedelta
from typing import Any

from django.db import connection
from django.db.models import Count, F, Min, Q
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_announcement.models import Announcement
from app_attendance.models import UserEvent
from app_auth.models import User
from app_auth.shortcuts_availability_helpers import (
    user_can_access_admin_shortcuts,
)
from app_crm.models import Issue, IssueComment, IssueEvent, IssueSource
from app_course.course_status import effective_status_q
from app_course.models import Assignment, Course, Event, Submission, UserCourse
from app_finance.models import UserPayment
from app_finance.payment_scoping import can_view_unpaid
from app_finance.unpaid_helpers import unpaid_course_summary_rows
from app_rbac.resolution import effective_permissions
from app_organization.models import Organization
from app_utility_notifications.event_buckets import EventBucket, classify_event
from app_utility_notifications.tenant_time import (
    add_calendar_days_to_tenant_ymd,
    datetime_to_tenant_ymd,
    event_instant_in_timezone,
    get_tenant_day_boundaries,
    get_tenant_today_ymd,
)
from app_utility_notifications.utility_notification_kinds import UtilityNotificationKind

CLASS_STARTING_SOON_MIN = timedelta(minutes=15)
CLASS_STARTING_SOON_MAX = timedelta(minutes=60)
RECENT_WINDOW = timedelta(hours=48)
ANNOUNCEMENT_CAP = 5
ATTENDANCE_UNMARKED_CAP = 5
COMPLAINT_CAP = 5

_ATTENDANCE_STATUS_NOTIFICATION_LABELS = {
    UserEvent.AttendanceStatus.ABSENT_WITH_LEAVE: "absent with leave",
}


def _attendance_status_notification_label(status: str) -> str:
    return _ATTENDANCE_STATUS_NOTIFICATION_LABELS.get(status, status)

def stable_notification_id(kind: str, entity_id: str | int, date_bucket: str) -> str:
    return f"{kind}:{entity_id}:{date_bucket}"


def _sort_utility_notifications_newest_first(rows: list[dict[str, Any]]) -> None:
    """Newest notifications first (LIFO by created_at, then id)."""
    rows.sort(key=lambda row: (row["created_at"], row["id"]), reverse=True)


def _notification_row(
    *,
    kind: UtilityNotificationKind,
    severity: str,
    title: str,
    body: str,
    created_at: datetime,
    route: str,
    params: dict[str, Any],
    entity_id: str | int,
    date_bucket: str,
) -> dict[str, Any]:
    return {
        "id": stable_notification_id(kind.value, entity_id, date_bucket),
        "kind": kind.value,
        "severity": severity,
        "title": title,
        "body": body,
        "created_at": created_at,
        "route": route,
        "params": params,
    }


def _time_to_str(value: time | str) -> str:
    if isinstance(value, time):
        return value.strftime("%H:%M:%S")
    return str(value)


def _organization_for_current_schema() -> Organization | None:
    schema = connection.schema_name
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=schema).first()


def _crm_enabled_for_current_schema() -> bool:
    org = _organization_for_current_schema()
    return org is not None and org.is_crm_enabled


def _staff_complaint_route(issue_id: int) -> tuple[str, dict[str, Any]]:
    return "/crm/issues", {"issue": issue_id}


def _student_complaint_route(issue_id: int) -> tuple[str, dict[str, Any]]:
    return "/complaints/[id]", {"id": issue_id}


def _complaint_student_display_name(issue: Issue) -> str:
    student = issue.related_student
    if student is None:
        return "A student"
    name = (getattr(student, "name", "") or "").strip()
    return name or "A student"


def _complaint_comment_body_preview(body: str) -> str:
    text = (body or "").strip()
    if text:
        return text[:120]
    return "Sent a reply."


def _student_course_ids(user: User) -> list[int]:
    return list(
        UserCourse.objects.filter(
            user=user,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        ).values_list("course_id", flat=True)
    )


def _teacher_course_ids(user: User) -> list[int]:
    return list(
        UserCourse.objects.filter(
            user=user,
            assigned_as=UserCourse.AssignedAs.TEACHER,
        ).values_list("course_id", flat=True)
    )


def _tenant_today_date(now: datetime, tenant_tz: str) -> date:
    return date.fromisoformat(get_tenant_today_ymd(tenant_tz, now))


def _not_ended_course_ids(now: datetime, tenant_tz: str) -> list[int]:
    ref = _tenant_today_date(now, tenant_tz)
    return list(
        Course.objects.filter(
            ~effective_status_q(Course.CourseStatus.ENDED, reference=ref)
        ).values_list("id", flat=True)
    )


def _active_course_ids(
    course_ids: list[int],
    *,
    now: datetime,
    tenant_tz: str,
) -> list[int]:
    not_ended = set(_not_ended_course_ids(now, tenant_tz))
    return [course_id for course_id in course_ids if course_id in not_ended]


def _events_on_ymd(
    *,
    ymd: str,
    tenant_tz: str,
    now: datetime,
    course_ids: list[int] | None,
):
    start, end = get_tenant_day_boundaries(now, tenant_tz, ymd)
    ref = _tenant_today_date(now, tenant_tz)
    not_ended_course_qs = Course.objects.filter(
        ~effective_status_q(Course.CourseStatus.ENDED, reference=ref)
    ).values("id")
    qs = (
        Event.objects.filter(
            date__gte=start,
            date__lte=end,
            course_id__in=not_ended_course_qs,
        )
        .select_related("course")
    )
    if course_ids is not None:
        if not course_ids:
            return Event.objects.none()
        qs = qs.filter(course_id__in=course_ids)
    return qs.order_by("date", "time_from", "id")


def _due_ymd(dt_value: datetime, tenant_tz: str) -> str:
    return datetime_to_tenant_ymd(dt_value, tenant_tz)


def _tenant_day_start(now: datetime, tenant_tz: str, ymd: str) -> datetime:
    start, _ = get_tenant_day_boundaries(now, tenant_tz, ymd)
    return start


def _event_start_at(ev: Event, tenant_tz: str, *, fallback: datetime) -> datetime:
    start = event_instant_in_timezone(ev.date, _time_to_str(ev.time_from), tenant_tz)
    return start if start else fallback


def _starting_soon_created_at(ev: Event, tenant_tz: str, *, fallback: datetime) -> datetime:
    start = event_instant_in_timezone(ev.date, _time_to_str(ev.time_from), tenant_tz)
    if start:
        return start - CLASS_STARTING_SOON_MIN
    return fallback


def _starts_in_starting_soon_window(ev: Event, now: datetime, tenant_tz: str) -> bool:
    start = event_instant_in_timezone(ev.date, _time_to_str(ev.time_from), tenant_tz)
    if not start:
        return False
    delta = start - now
    return CLASS_STARTING_SOON_MIN <= delta <= CLASS_STARTING_SOON_MAX


def _current_month_payment_params(now: datetime, tenant_tz: str) -> dict[str, str]:
    today_ymd = get_tenant_today_ymd(tenant_tz, now)
    year, month, _ = map(int, today_ymd.split("-"))
    last_day = monthrange(year, month)[1]
    month_start_ymd = f"{year:04d}-{month:02d}-01"
    month_end_ymd = f"{year:04d}-{month:02d}-{last_day:02d}"
    start_dt, _ = get_tenant_day_boundaries(now, tenant_tz, month_start_ymd)
    _, end_dt = get_tenant_day_boundaries(now, tenant_tz, month_end_ymd)
    return {
        "issued_at__gte": start_dt.isoformat(),
        "issued_at__lte": end_dt.isoformat(),
    }


def _event_index_maps_by_course(course_ids: list[int]) -> dict[int, dict[int, int]]:
    """Map course_id -> {event_id: zero-based index in course schedule order}."""
    if not course_ids:
        return {}
    rows = (
        Event.objects.filter(course_id__in=course_ids)
        .order_by("course_id", "date", "time_from", "id")
        .values_list("course_id", "id")
    )
    maps: dict[int, dict[int, int]] = {}
    counters: dict[int, int] = {}
    for course_id, event_id in rows:
        index = counters.get(course_id, 0)
        maps.setdefault(course_id, {})[event_id] = index
        counters[course_id] = index + 1
    return maps


def _user_can_see_admin_unpaid_summary(user: User) -> bool:
    return can_view_unpaid(set(effective_permissions(user)))


def _append_class_event_notifications(
    rows: list[dict[str, Any]],
    *,
    events,
    now: datetime,
    tenant_tz: str,
    date_bucket: str,
    starting_soon_route: str,
    in_progress_route: str,
    include_in_progress: bool,
) -> None:
    for ev in events:
        bucket = classify_event(ev, now, tenant_tz)
        if bucket == EventBucket.UPCOMING and _starts_in_starting_soon_window(
            ev, now, tenant_tz
        ):
            rows.append(
                _notification_row(
                    kind=UtilityNotificationKind.CLASS_STARTING_SOON,
                    severity="warning",
                    title="Class starting soon",
                    body=f"{ev.course.title} starts within the next hour.",
                    created_at=_starting_soon_created_at(
                        ev, tenant_tz, fallback=now
                    ),
                    route=starting_soon_route,
                    params={"id": ev.course_id, "courseId": ev.course_id},
                    entity_id=ev.id,
                    date_bucket=date_bucket,
                )
            )
        elif (
            include_in_progress
            and bucket == EventBucket.IN_PROGRESS
            and ev.course.meeting_link
        ):
            rows.append(
                _notification_row(
                    kind=UtilityNotificationKind.CLASS_IN_PROGRESS,
                    severity="success",
                    title="Class in progress",
                    body=f"{ev.course.title} is happening now.",
                    created_at=_event_start_at(ev, tenant_tz, fallback=now),
                    route=in_progress_route,
                    params={"id": ev.course_id, "courseId": ev.course_id},
                    entity_id=ev.id,
                    date_bucket=date_bucket,
                )
            )


def _student_notification_rows(
    user: User,
    now: datetime,
    tenant_tz: str,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    today_ymd = get_tenant_today_ymd(tenant_tz, now)
    tomorrow_ymd = add_calendar_days_to_tenant_ymd(today_ymd, tenant_tz, 1)
    course_ids = _student_course_ids(user)

    today_events = list(_events_on_ymd(
        ymd=today_ymd,
        tenant_tz=tenant_tz,
        now=now,
        course_ids=course_ids,
    ))
    if today_events:
        rows.append(
            _notification_row(
                kind=UtilityNotificationKind.TODAY_SCHEDULE,
                severity="success",
                title="Today's schedule",
                body=f"You have {len(today_events)} class{'es' if len(today_events) != 1 else ''} today.",
                created_at=_tenant_day_start(now, tenant_tz, today_ymd),
                route="/shortcuts/todays-classes",
                params={"count": len(today_events)},
                entity_id=user.id,
                date_bucket=today_ymd,
            )
        )

    _append_class_event_notifications(
        rows,
        events=today_events,
        now=now,
        tenant_tz=tenant_tz,
        date_bucket=today_ymd,
        starting_soon_route="/class/course/[id]",
        in_progress_route="/class/course/[id]",
        include_in_progress=True,
    )

    active_course_ids = _active_course_ids(course_ids, now=now, tenant_tz=tenant_tz)
    if active_course_ids:
        assignments = Assignment.objects.filter(
            course_id__in=active_course_ids
        ).select_related("course")
        for assignment in assignments:
            due_ymd = _due_ymd(assignment.due_datetime, tenant_tz)
            if due_ymd not in (today_ymd, tomorrow_ymd):
                continue
            due_label = "tomorrow" if due_ymd == tomorrow_ymd else "today"
            rows.append(
                _notification_row(
                    kind=UtilityNotificationKind.ASSIGNMENT_DUE,
                    severity="warning",
                    title="Assignment due",
                    body=f"{assignment.title} is due {due_label}.",
                    created_at=assignment.due_datetime,
                    route="/class/course/assignment/[id]",
                    params={"id": assignment.id, "courseId": assignment.course_id},
                    entity_id=assignment.id,
                    date_bucket=due_ymd,
                )
            )

    pending_payment_stats = UserPayment.objects.filter(
        user=user,
        status=UserPayment.Status.PENDING_PAYMENT,
    ).aggregate(count=Count("id"), oldest=Min("created_at"))
    pending_payments = pending_payment_stats["count"] or 0
    if pending_payments:
        rows.append(
            _notification_row(
                kind=UtilityNotificationKind.PAYMENT_PENDING,
                severity="warning",
                title="Payment pending",
                body=f"You have {pending_payments} payment{'s' if pending_payments != 1 else ''} to complete.",
                created_at=pending_payment_stats["oldest"] or now,
                route="/finances/make-payment",
                params={"count": pending_payments},
                entity_id=user.id,
                date_bucket=today_ymd,
            )
        )

    pending_verification_stats = UserPayment.objects.filter(
        user=user,
        status=UserPayment.Status.PENDING_VERIFICATION,
    ).aggregate(count=Count("id"), oldest=Min("updated_at"))
    pending_verification = pending_verification_stats["count"] or 0
    if pending_verification:
        rows.append(
            _notification_row(
                kind=UtilityNotificationKind.PAYMENT_PENDING_VERIFICATION,
                severity="warning",
                title="Payment awaiting verification",
                body=f"{pending_verification} payment{'s' if pending_verification != 1 else ''} awaiting verification.",
                created_at=pending_verification_stats["oldest"] or now,
                route="/finances/student-payments",
                params={"count": pending_verification},
                entity_id=user.id,
                date_bucket=today_ymd,
            )
        )

    recent_cutoff = now - RECENT_WINDOW
    not_ended_course_qs = Course.objects.filter(
        ~effective_status_q(
            Course.CourseStatus.ENDED,
            reference=_tenant_today_date(now, tenant_tz),
        )
    ).values("id")
    marked_events = (
        UserEvent.objects.filter(
            user=user,
            is_deleted=False,
            attendance_status__in=(
                UserEvent.AttendanceStatus.ABSENT,
                UserEvent.AttendanceStatus.ABSENT_WITH_LEAVE,
                UserEvent.AttendanceStatus.LATE,
            ),
            updated_at__gte=recent_cutoff,
            event__course_id__in=not_ended_course_qs,
        )
        .select_related("event", "event__course")
        .order_by("-updated_at")[:ANNOUNCEMENT_CAP]
    )
    for ue in marked_events:
        status_label = _attendance_status_notification_label(ue.attendance_status)
        rows.append(
            _notification_row(
                kind=UtilityNotificationKind.ATTENDANCE_MARKED,
                severity="danger",
                title="Attendance updated",
                body=f"You were marked {status_label} for {ue.event.course.title}.",
                created_at=ue.updated_at,
                route="/class/course/[id]",
                params={"id": ue.event.course_id, "courseId": ue.event.course_id},
                entity_id=ue.id,
                date_bucket=today_ymd,
            )
        )

    announcement_cutoff = now - RECENT_WINDOW
    announcement_filter = Q(created_at__gte=announcement_cutoff)
    if course_ids:
        announcement_filter &= Q(course_id__in=course_ids) | Q(course_id__isnull=True)
    else:
        announcement_filter &= Q(course_id__isnull=True)
    announcements = (
        Announcement.objects.filter(announcement_filter)
        .select_related("course")
        .order_by("-created_at")[:ANNOUNCEMENT_CAP]
    )
    for announcement in announcements:
        course_id = announcement.course_id
        if course_id is not None:
            route = "/class/course/[id]/announcement/[announcementId]"
            params: dict[str, Any] = {
                "id": course_id,
                "courseId": course_id,
                "announcementId": announcement.id,
            }
        else:
            route = "/services/org-wide-announcements"
            params = {"announcementId": announcement.id}
        rows.append(
            _notification_row(
                kind=UtilityNotificationKind.ANNOUNCEMENT_NEW,
                severity="success",
                title="New announcement",
                body=announcement.title,
                created_at=announcement.created_at,
                route=route,
                params=params,
                entity_id=announcement.id,
                date_bucket=today_ymd,
            )
        )

    return rows


def _teacher_notification_rows(
    user: User,
    now: datetime,
    tenant_tz: str,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    today_ymd = get_tenant_today_ymd(tenant_tz, now)
    yesterday_ymd = add_calendar_days_to_tenant_ymd(today_ymd, tenant_tz, -1)
    teacher_course_ids = _teacher_course_ids(user)

    today_events = list(
        _events_on_ymd(
            ymd=today_ymd,
            tenant_tz=tenant_tz,
            now=now,
            course_ids=teacher_course_ids,
        )
    )
    if today_events:
        rows.append(
            _notification_row(
                kind=UtilityNotificationKind.TODAY_SCHEDULE,
                severity="success",
                title="Today's teaching schedule",
                body=f"You are teaching {len(today_events)} session{'s' if len(today_events) != 1 else ''} today.",
                created_at=_tenant_day_start(now, tenant_tz, today_ymd),
                route="/shortcuts/todays-classes",
                params={"count": len(today_events)},
                entity_id=user.id,
                date_bucket=today_ymd,
            )
        )

    _append_class_event_notifications(
        rows,
        events=today_events,
        now=now,
        tenant_tz=tenant_tz,
        date_bucket=today_ymd,
        starting_soon_route="/shortcuts/todays-classes",
        in_progress_route="/shortcuts/todays-classes",
        include_in_progress=False,
    )

    active_teacher_course_ids = _active_course_ids(
        teacher_course_ids,
        now=now,
        tenant_tz=tenant_tz,
    )
    if active_teacher_course_ids:
        y_start, y_end = get_tenant_day_boundaries(now, tenant_tz, yesterday_ymd)
        unmarked_events = (
            Event.objects.filter(
                course_id__in=active_teacher_course_ids,
                date__gte=y_start,
                date__lte=y_end,
            )
            .select_related("course")
            .annotate(
                unregistered_students=Count(
                    "userevent",
                    filter=Q(
                        userevent__is_deleted=False,
                        userevent__attendance_status=UserEvent.AttendanceStatus.UNREGISTERED,
                        userevent__user__user_courses__course_id=F("course_id"),
                        userevent__user__user_courses__assigned_as=UserCourse.AssignedAs.STUDENT,
                    ),
                    distinct=True,
                )
            )
            .filter(unregistered_students__gt=0)
            .order_by("date", "time_from", "id")[:ATTENDANCE_UNMARKED_CAP]
        )
        unmarked_list = list(unmarked_events)
        event_index_maps = _event_index_maps_by_course(
            list({ev.course_id for ev in unmarked_list})
        )
        for ev in unmarked_list:
            event_index = event_index_maps.get(ev.course_id, {}).get(ev.id, 0)
            rows.append(
                _notification_row(
                    kind=UtilityNotificationKind.ATTENDANCE_UNMARKED,
                    severity="warning",
                    title="Attendance not marked",
                    body=f"{ev.unregistered_students} student{'s' if ev.unregistered_students != 1 else ''} unregistered for {ev.course.title}.",
                    created_at=_event_start_at(ev, tenant_tz, fallback=y_start),
                    route="/class/course/attendance/marking/[eventIndex]",
                    params={
                        "id": ev.course_id,
                        "courseId": ev.course_id,
                        "eventIndex": event_index,
                    },
                    entity_id=ev.id,
                    date_bucket=yesterday_ymd,
                )
            )

        ungraded = (
            Submission.objects.filter(
                assignment__course_id__in=active_teacher_course_ids,
                is_graded=False,
            )
            .select_related("assignment", "assignment__course")
            .order_by("-created_at")[:ANNOUNCEMENT_CAP]
        )
        for submission in ungraded:
            rows.append(
                _notification_row(
                    kind=UtilityNotificationKind.ASSIGNMENT_TO_GRADE,
                    severity="warning",
                    title="Assignment to grade",
                    body=f"Submission for {submission.assignment.title} needs grading.",
                    created_at=submission.created_at,
                    route="/class/course/assignment/[id]",
                    params={
                        "id": submission.assignment_id,
                        "courseId": submission.assignment.course_id,
                    },
                    entity_id=submission.id,
                    date_bucket=today_ymd,
                )
            )

    return rows


def _staff_notification_rows(
    user: User,
    now: datetime,
    tenant_tz: str,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    today_ymd = get_tenant_today_ymd(tenant_tz, now)
    is_admin = user_can_access_admin_shortcuts(user)
    is_finance = User.UserRole.FINANCE in user.roles

    if not is_admin and not is_finance:
        return rows

    if is_admin:
        today_count = _events_on_ymd(
            ymd=today_ymd,
            tenant_tz=tenant_tz,
            now=now,
            course_ids=None,
        ).count()
        if today_count:
            rows.append(
                _notification_row(
                    kind=UtilityNotificationKind.ADMIN_TODAY_OVERVIEW,
                    severity="success",
                    title="Today's classes",
                    body=f"{today_count} session{'s' if today_count != 1 else ''} scheduled org-wide today.",
                    created_at=_tenant_day_start(now, tenant_tz, today_ymd),
                    route="/shortcuts/todays-classes",
                    params={"count": today_count},
                    entity_id="org",
                    date_bucket=today_ymd,
                )
            )

        org = _organization_for_current_schema()
        if (
            org
            and org.transaction_screenshot_strategy
            == Organization.TransactionScreenshotStrategy.ADMIN_UPLOAD
            and _user_can_see_admin_unpaid_summary(user)
        ):
            try:
                payment_params = _current_month_payment_params(now, tenant_tz)
                summary = unpaid_course_summary_rows(payment_params)
                courses_with_unpaid = [r for r in summary if r.get("unpaid_count", 0) > 0]
                if courses_with_unpaid:
                    total_unpaid = sum(r["unpaid_count"] for r in courses_with_unpaid)
                    rows.append(
                        _notification_row(
                            kind=UtilityNotificationKind.ADMIN_UNPAID_SUMMARY,
                            severity="danger",
                            title="Unpaid students",
                            body=f"{total_unpaid} unpaid student{'s' if total_unpaid != 1 else ''} across {len(courses_with_unpaid)} course{'s' if len(courses_with_unpaid) != 1 else ''}.",
                            created_at=_tenant_day_start(now, tenant_tz, today_ymd),
                            route="/shortcuts/unpaid-course-counts",
                            params={
                                "count": total_unpaid,
                                "courseCount": len(courses_with_unpaid),
                            },
                            entity_id="org",
                            date_bucket=today_ymd,
                        )
                    )
            except (ValueError, TypeError, KeyError):
                pass

    if is_admin or is_finance:
        verify_stats = UserPayment.objects.filter(
            status=UserPayment.Status.PENDING_VERIFICATION,
        ).aggregate(count=Count("id"), oldest=Min("updated_at"))
        verify_count = verify_stats["count"] or 0
        if verify_count:
            rows.append(
                _notification_row(
                    kind=UtilityNotificationKind.ADMIN_PAYMENTS_TO_VERIFY,
                    severity="warning",
                    title="Payments to verify",
                    body=f"{verify_count} payment{'s' if verify_count != 1 else ''} awaiting verification.",
                    created_at=verify_stats["oldest"] or now,
                    route="/finances/recent-transactions",
                    params={"count": verify_count},
                    entity_id="org",
                    date_bucket=today_ymd,
                )
            )

    return rows


def _complaint_notification_rows(
    user: User,
    now: datetime,
    tenant_tz: str,
) -> list[dict[str, Any]]:
    if not _crm_enabled_for_current_schema():
        return []

    rows: list[dict[str, Any]] = []
    today_ymd = get_tenant_today_ymd(tenant_tz, now)
    recent_cutoff = now - RECENT_WINDOW
    is_admin = user_can_access_admin_shortcuts(user)

    parent_complaint_q = Q(issue__source=IssueSource.PARENT_COMPLAINT)

    if user.is_student():
        staff_replies = (
            IssueComment.objects.filter(
                parent_complaint_q,
                issue__related_student=user,
                created_at__gte=recent_cutoff,
            )
            .exclude(author_id=user.id)
            .select_related("issue")
            .order_by("-created_at", "-id")[:COMPLAINT_CAP]
        )
        for comment in staff_replies:
            route, params = _student_complaint_route(comment.issue_id)
            rows.append(
                _notification_row(
                    kind=UtilityNotificationKind.COMPLAINT_REPLY,
                    severity="success",
                    title="Reply from school administration",
                    body=_complaint_comment_body_preview(comment.body),
                    created_at=comment.created_at,
                    route=route,
                    params=params,
                    entity_id=comment.id,
                    date_bucket=datetime_to_tenant_ymd(comment.created_at, tenant_tz),
                )
            )

    assigned_events = (
        IssueEvent.objects.filter(
            parent_complaint_q,
            event_type=IssueEvent.EventType.ASSIGNEE_CHANGED,
            created_at__gte=recent_cutoff,
            issue__assignee=user,
        )
        .select_related("issue")
        .order_by("-created_at", "-id")[:COMPLAINT_CAP]
    )
    for event in assigned_events:
        route, params = _staff_complaint_route(event.issue_id)
        rows.append(
            _notification_row(
                kind=UtilityNotificationKind.COMPLAINT_ASSIGNED,
                severity="warning",
                title="Complaint assigned to you",
                body=event.issue.title,
                created_at=event.created_at,
                route=route,
                params=params,
                entity_id=event.id,
                date_bucket=datetime_to_tenant_ymd(event.created_at, tenant_tz),
            )
        )

    reopen_events = (
        IssueEvent.objects.filter(
            parent_complaint_q,
            event_type=IssueEvent.EventType.STATUS_CHANGED,
            created_at__gte=recent_cutoff,
            actor_id=F("issue__related_student_id"),
        )
        .select_related("issue", "issue__related_student")
        .order_by("-created_at", "-id")
    )
    reopen_count = 0
    for event in reopen_events:
        if reopen_count >= COMPLAINT_CAP:
            break
        issue = event.issue
        if issue.assignee_id:
            if user.id != issue.assignee_id:
                continue
        elif not is_admin or user.id in {
            issue.related_student_id,
            issue.created_by_id,
        }:
            continue

        route, params = _staff_complaint_route(issue.id)
        rows.append(
            _notification_row(
                kind=UtilityNotificationKind.COMPLAINT_REOPENED,
                severity="warning",
                title="Complaint reopened",
                body=f"{_complaint_student_display_name(issue)} reopened a parent complaint.",
                created_at=event.created_at,
                route=route,
                params=params,
                entity_id=event.id,
                date_bucket=datetime_to_tenant_ymd(event.created_at, tenant_tz),
            )
        )
        reopen_count += 1

    if is_admin:
        new_complaints = (
            Issue.objects.filter(
                source=IssueSource.PARENT_COMPLAINT,
                created_at__gte=recent_cutoff,
            )
            .exclude(related_student=user)
            .exclude(created_by=user)
            .select_related("related_student")
            .order_by("-created_at", "-id")[:COMPLAINT_CAP]
        )
        for issue in new_complaints:
            route, params = _staff_complaint_route(issue.id)
            rows.append(
                _notification_row(
                    kind=UtilityNotificationKind.COMPLAINT_NEW,
                    severity="warning",
                    title="New parent complaint",
                    body=f"{_complaint_student_display_name(issue)} filed a parent complaint.",
                    created_at=issue.created_at,
                    route=route,
                    params=params,
                    entity_id=issue.id,
                    date_bucket=datetime_to_tenant_ymd(issue.created_at, tenant_tz),
                )
            )

    return rows


def utility_notifications_for_user(
    user: User,
    *,
    now: datetime,
    tenant_tz: str,
) -> list[dict[str, Any]]:
    """Return the v1 utility notification catalog for `user` in the current tenant schema."""
    if now.tzinfo is None:
        now = now.replace(tzinfo=dt.timezone.utc)

    rows: list[dict[str, Any]] = []

    if user.is_student():
        rows.extend(_student_notification_rows(user, now, tenant_tz))

    if User.UserRole.TEACHER in user.roles:
        rows.extend(_teacher_notification_rows(user, now, tenant_tz))

    rows.extend(_staff_notification_rows(user, now, tenant_tz))
    rows.extend(_complaint_notification_rows(user, now, tenant_tz))

    _sort_utility_notifications_newest_first(rows)
    return rows


def events_in_class_starting_soon_window(
    *,
    now: datetime,
    tenant_tz: str,
) -> list[Event]:
    """Today's events whose start is 15–60 minutes from ``now`` (tenant timezone)."""
    if now.tzinfo is None:
        now = now.replace(tzinfo=dt.timezone.utc)
    today_ymd = get_tenant_today_ymd(tenant_tz, now)
    return [
        ev
        for ev in _events_on_ymd(
            ymd=today_ymd,
            tenant_tz=tenant_tz,
            now=now,
            course_ids=None,
        )
        if _starts_in_starting_soon_window(ev, now, tenant_tz)
    ]


def class_starting_soon_push_rows_for_membership(
    event: Event,
    *,
    assigned_as: str,
    now: datetime,
    tenant_tz: str,
) -> list[dict[str, Any]]:
    """Build CLASS_STARTING_SOON push rows for one roster membership on ``event``."""
    if now.tzinfo is None:
        now = now.replace(tzinfo=dt.timezone.utc)
    route = (
        "/class/course/[id]"
        if assigned_as == UserCourse.AssignedAs.STUDENT
        else "/shortcuts/todays-classes"
    )
    today_ymd = get_tenant_today_ymd(tenant_tz, now)
    rows: list[dict[str, Any]] = []
    _append_class_event_notifications(
        rows,
        events=[event],
        now=now,
        tenant_tz=tenant_tz,
        date_bucket=today_ymd,
        starting_soon_route=route,
        in_progress_route=route,
        include_in_progress=False,
    )
    return rows


def class_starting_soon_push_targets_by_user(
    *,
    now: datetime,
    tenant_tz: str,
) -> list[tuple[User, list[dict[str, Any]]]]:
    """
    Event-centric targets for the class-starting-soon push cron.

    Loads only today's events in the 15–60 minute window and active roster
    members on those courses — not the full utility notification catalog.
    """
    if now.tzinfo is None:
        now = now.replace(tzinfo=dt.timezone.utc)

    events = events_in_class_starting_soon_window(now=now, tenant_tz=tenant_tz)
    if not events:
        return []

    events_by_course: dict[int, list[Event]] = {}
    for ev in events:
        events_by_course.setdefault(ev.course_id, []).append(ev)

    memberships = UserCourse.objects.filter(
        course_id__in=events_by_course.keys(),
        assigned_as__in=(
            UserCourse.AssignedAs.STUDENT,
            UserCourse.AssignedAs.TEACHER,
        ),
        user__is_active=True,
    ).select_related("user")

    grouped: dict[int, dict[str, Any]] = {}
    for membership in memberships:
        for event in events_by_course.get(membership.course_id, []):
            batch = class_starting_soon_push_rows_for_membership(
                event,
                assigned_as=membership.assigned_as,
                now=now,
                tenant_tz=tenant_tz,
            )
            if not batch:
                continue
            slot = grouped.setdefault(
                membership.user_id,
                {"user": membership.user, "rows": []},
            )
            slot["rows"].extend(batch)

    return [(entry["user"], entry["rows"]) for entry in grouped.values()]

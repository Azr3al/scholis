"""
Course insights: detect setup gaps on effectively active courses.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from app_course.event_overlap import has_overlapping_events as shared_has_overlapping_events

from django.db.models import Q
from django.utils import timezone

from app_attendance.god_view_services import paginate_rows
from app_attendance.models import UserEvent
from app_course.course_status import apply_effective_status_filter
from app_course.models import AssignedAsRole, Course, Event, UserCourse
from app_organization.models import Organization

ISSUE_NO_SCHEDULE = "no_schedule"
ISSUE_OVERLAPPING_EVENTS = "overlapping_events"
ISSUE_NO_STUDENTS = "no_students"
ISSUE_NO_MAIN_TEACHER = "no_main_teacher"
ISSUE_NO_ASSISTANT_TEACHER = "no_assistant_teacher"
ISSUE_MISSING_SESSION_DATA = "missing_session_data"

ALL_ISSUES = (
    ISSUE_NO_SCHEDULE,
    ISSUE_OVERLAPPING_EVENTS,
    ISSUE_NO_STUDENTS,
    ISSUE_NO_MAIN_TEACHER,
    ISSUE_NO_ASSISTANT_TEACHER,
    ISSUE_MISSING_SESSION_DATA,
)

TEACHING_SENIORITIES = (
    AssignedAsRole.Seniority.MAIN_TEACHER,
    AssignedAsRole.Seniority.ASSISTANT_TEACHER,
)


@dataclass
class DataHealthFilters:
    issues: list[str] | None = None
    category_id: int | None = None
    program_id: int | None = None
    intake_id: int | None = None
    q: str | None = None
    page: int = 1
    size: int = 25


def parse_data_health_filters(body: dict, query_params) -> DataHealthFilters:
    raw_issues = body.get("issues")
    if raw_issues is None and hasattr(query_params, "getlist"):
        listed = query_params.getlist("issues")
        raw_issues = listed if listed else None
    issues = None
    if raw_issues:
        issues = [str(i) for i in raw_issues if str(i) in ALL_ISSUES]

    def _parse_int(value):
        if value in (None, ""):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    page = max(1, _parse_int(body.get("page") or query_params.get("page")) or 1)
    size = _parse_int(body.get("size") or query_params.get("size")) or 25
    if size < 0:
        size = 10_000

    q = body.get("q") or query_params.get("q")
    if q is not None:
        q = str(q).strip() or None

    return DataHealthFilters(
        issues=issues,
        category_id=_parse_int(body.get("category_id") or query_params.get("category_id")),
        program_id=_parse_int(body.get("program_id") or query_params.get("program_id")),
        intake_id=_parse_int(body.get("intake_id") or query_params.get("intake_id")),
        q=q,
        page=page,
        size=size,
    )


def _org_timezone(org: Organization) -> ZoneInfo:
    try:
        return ZoneInfo(org.timezone or "UTC")
    except Exception:
        return ZoneInfo("UTC")


def _local_today(org: Organization) -> date:
    return timezone.now().astimezone(_org_timezone(org)).date()


def _event_local_date(event: Event, tz: ZoneInfo) -> date:
    dt = event.date
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt.astimezone(tz).date()


def _event_sort_key(event: Event) -> tuple[datetime, Any]:
    return (event.date, event.time_from)


def _past_events(events: list[Event], today: date, tz: ZoneInfo) -> list[Event]:
    past = [ev for ev in events if _event_local_date(ev, tz) < today]
    return sorted(past, key=_event_sort_key)


def _has_overlapping_events(events: list[Event], tz: ZoneInfo) -> bool:
    return shared_has_overlapping_events(events, tz)


def _tracking_modes_enabled(org: Organization) -> bool:
    return bool(
        org.use_student_attendance
        or org.use_student_checkin
        or org.use_teacher_session_checkin
    )


def _teaching_teachers(user_courses: list[UserCourse]) -> list[UserCourse]:
    teachers = []
    for uc in user_courses:
        if uc.assigned_as != UserCourse.AssignedAs.TEACHER:
            continue
        role = uc.assigned_as_role
        if role is None:
            continue
        if role.seniority in TEACHING_SENIORITIES:
            teachers.append(uc)
    return teachers


def _teacher_seniorities(user_courses: list[UserCourse]) -> set[str]:
    seniorities: set[str] = set()
    for uc in user_courses:
        if uc.assigned_as != UserCourse.AssignedAs.TEACHER:
            continue
        role = uc.assigned_as_role
        if role is not None and role.seniority:
            seniorities.add(role.seniority)
    return seniorities


def _students(user_courses: list[UserCourse]) -> list[UserCourse]:
    return [
        uc
        for uc in user_courses
        if uc.assigned_as == UserCourse.AssignedAs.STUDENT
    ]


def _session_fails(
    event: Event,
    students: list[UserCourse],
    teachers: list[UserCourse],
    user_events: dict[tuple[int, int], UserEvent],
    org: Organization,
) -> bool:
    if org.use_student_attendance:
        for uc in students:
            ue = user_events.get((uc.user_id, event.id))
            if ue is None or ue.attendance_status == UserEvent.AttendanceStatus.UNREGISTERED:
                return True
    if org.use_student_checkin:
        for uc in students:
            ue = user_events.get((uc.user_id, event.id))
            if ue is None or ue.checkin_time is None:
                return True
    if org.use_teacher_session_checkin:
        for uc in teachers:
            ue = user_events.get((uc.user_id, event.id))
            if ue is None or ue.checkin_time is None:
                return True
    return False


def evaluate_course_issues(
    *,
    events: list[Event],
    user_courses: list[UserCourse],
    user_events: dict[tuple[int, int], UserEvent],
    org: Organization,
    today: date | None = None,
) -> tuple[list[str], int]:
    tz = _org_timezone(org)
    ref_today = today if today is not None else _local_today(org)
    issues: list[str] = []
    missing_session_data_count = 0

    if not events:
        issues.append(ISSUE_NO_SCHEDULE)
    elif _has_overlapping_events(events, tz):
        issues.append(ISSUE_OVERLAPPING_EVENTS)

    student_rows = _students(user_courses)
    if not student_rows:
        issues.append(ISSUE_NO_STUDENTS)

    seniorities = _teacher_seniorities(user_courses)
    if AssignedAsRole.Seniority.MAIN_TEACHER not in seniorities:
        issues.append(ISSUE_NO_MAIN_TEACHER)
    if AssignedAsRole.Seniority.ASSISTANT_TEACHER not in seniorities:
        issues.append(ISSUE_NO_ASSISTANT_TEACHER)

    if _tracking_modes_enabled(org):
        past = _past_events(events, ref_today, tz)
        lookback = org.course_data_health_session_lookback or 5
        window = past[-lookback:] if lookback else past
        teaching_teachers = _teaching_teachers(user_courses)
        failing_sessions = 0
        for event in window:
            if _session_fails(event, student_rows, teaching_teachers, user_events, org):
                failing_sessions += 1
        if failing_sessions:
            issues.append(ISSUE_MISSING_SESSION_DATA)
            missing_session_data_count = failing_sessions

    return issues, missing_session_data_count


def _active_courses_queryset(filters: DataHealthFilters, today: date):
    qs = Course.objects.select_related("category", "program")
    qs = apply_effective_status_filter(
        qs,
        [Course.CourseStatus.ACTIVE],
        reference=today,
    )
    if filters.category_id:
        qs = qs.filter(category_id=filters.category_id)
    if filters.program_id:
        qs = qs.filter(program_id=filters.program_id)
    if filters.intake_id:
        qs = qs.filter(intake_id=filters.intake_id)
    if filters.q:
        qs = qs.filter(Q(title__icontains=filters.q) | Q(code__icontains=filters.q))
    return qs.order_by("title")


def _empty_summary(total_active_courses: int = 0) -> dict[str, Any]:
    return {
        "total_active_courses": total_active_courses,
        "faulty_courses": 0,
        "issue_counts": {issue: 0 for issue in ALL_ISSUES},
    }


def build_data_health_rows(
    filters: DataHealthFilters,
    org: Organization,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    today = _local_today(org)
    courses = list(_active_courses_queryset(filters, today))
    total_active = len(courses)
    if not courses:
        return _empty_summary(0), []

    course_ids = [course.id for course in courses]
    events_by_course: dict[int, list[Event]] = defaultdict(list)
    for event in Event.objects.filter(course_id__in=course_ids).order_by("date", "time_from"):
        events_by_course[event.course_id].append(event)

    user_courses_by_course: dict[int, list[UserCourse]] = defaultdict(list)
    for uc in UserCourse.objects.filter(course_id__in=course_ids).select_related(
        "assigned_as_role"
    ):
        user_courses_by_course[uc.course_id].append(uc)

    lookback = org.course_data_health_session_lookback or 5
    tz = _org_timezone(org)
    eval_event_ids: set[int] = set()
    if _tracking_modes_enabled(org):
        for course_id in course_ids:
            past = _past_events(events_by_course.get(course_id, []), today, tz)
            window = past[-lookback:] if lookback else past
            eval_event_ids.update(ev.id for ev in window)

    user_events: dict[tuple[int, int], UserEvent] = {}
    if eval_event_ids:
        for ue in UserEvent.objects.filter(event_id__in=eval_event_ids, is_deleted=False):
            user_events[(ue.user_id, ue.event_id)] = ue

    rows: list[dict[str, Any]] = []
    issue_counts = {issue: 0 for issue in ALL_ISSUES}

    for course in courses:
        issues, missing_count = evaluate_course_issues(
            events=events_by_course.get(course.id, []),
            user_courses=user_courses_by_course.get(course.id, []),
            user_events=user_events,
            org=org,
            today=today,
        )
        if not issues:
            continue
        for issue in issues:
            issue_counts[issue] += 1
        row = {
            "course_id": course.id,
            "course_title": course.title,
            "course_code": course.code or "",
            "category_id": course.category_id,
            "category_name": course.category.name if course.category_id else "",
            "program_id": course.program_id,
            "program_name": course.program.name if course.program_id else "",
            "issues": issues,
            "missing_session_data_count": missing_count,
        }
        rows.append(row)

    summary = {
        "total_active_courses": total_active,
        "faulty_courses": len(rows),
        "issue_counts": issue_counts,
    }

    if filters.issues:
        required = set(filters.issues)
        rows = [row for row in rows if required.issubset(set(row["issues"]))]

    rows.sort(key=lambda row: row["course_title"].lower())
    return summary, rows


__all__ = [
    "ALL_ISSUES",
    "DataHealthFilters",
    "ISSUE_MISSING_SESSION_DATA",
    "ISSUE_NO_ASSISTANT_TEACHER",
    "ISSUE_NO_MAIN_TEACHER",
    "ISSUE_NO_SCHEDULE",
    "ISSUE_NO_STUDENTS",
    "ISSUE_OVERLAPPING_EVENTS",
    "build_data_health_rows",
    "evaluate_course_issues",
    "paginate_rows",
    "parse_data_health_filters",
]

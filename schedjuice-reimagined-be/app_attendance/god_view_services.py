"""
Student attendance god-view: aggregate UserEvent + Event metrics per student/course.
"""

from __future__ import annotations

import csv
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from enum import Enum
from io import StringIO
from typing import Any, Dict, List, Optional, Tuple

from django.db.models import Count, Q
from django.http import HttpResponse
from django.utils import timezone

from app_attendance.models import UserEvent
from app_auth.models import User
from app_course.models import Course, Event, UserCourse


ATTENDED_STATUSES = {
    UserEvent.AttendanceStatus.PRESENT,
    UserEvent.AttendanceStatus.LATE,
}
ABSENT_STATUSES = {
    UserEvent.AttendanceStatus.ABSENT,
    UserEvent.AttendanceStatus.ABSENT_WITH_LEAVE,
}
UNREGISTERED_STATUS = UserEvent.AttendanceStatus.UNREGISTERED
DEFAULT_AT_RISK_THRESHOLD = 75.0
LATE_HEAVY_RATE_THRESHOLD = 30.0


class DailyAttendanceStatusFilter(str, Enum):
    PRESENT = "present"
    LATE = "late"
    ABSENT = "absent"
    UNREGISTERED = "unregistered"


class CourseMarkingProblemStatus(str, Enum):
    UNREGISTERED = "unregistered"
    ABSENT = "absent"
    LATE = "late"
    PRESENT = "present"
    ALL = "all"


DOMINANT_PROBLEM_ORDER = (
    UNREGISTERED_STATUS,
    UserEvent.AttendanceStatus.ABSENT,
    UserEvent.AttendanceStatus.LATE,
    UserEvent.AttendanceStatus.PRESENT,
)


@dataclass
class GodViewFilters:
    date_from: date
    date_to: date
    course_id: Optional[int] = None
    student_id: Optional[int] = None
    teacher_id: Optional[int] = None
    category_id: Optional[int] = None
    category_ids: Optional[List[int]] = None
    program_id: Optional[int] = None
    intake_id: Optional[int] = None
    level_id: Optional[int] = None
    section_id: Optional[int] = None
    campus_id: Optional[int] = None
    min_attendance_rate: Optional[float] = None
    max_attendance_rate: Optional[float] = None
    at_risk_threshold: float = DEFAULT_AT_RISK_THRESHOLD
    sort: str = "attendance_rate_asc"
    daily_status_filter: Optional[DailyAttendanceStatusFilter] = None
    problem_status: CourseMarkingProblemStatus = CourseMarkingProblemStatus.UNREGISTERED
    min_rate: Optional[float] = None
    stalled_after_marking: bool = False
    page: int = 1
    size: int = 25


def parse_god_view_filters(body: dict, query_params) -> GodViewFilters:
    today = timezone.localdate()
    default_from = today - timedelta(days=30)
    date_from = _parse_date(body.get("date_from") or query_params.get("date_from")) or default_from
    date_to = _parse_date(body.get("date_to") or query_params.get("date_to")) or today
    if date_from > date_to:
        date_from, date_to = date_to, date_from

    page = max(1, int(query_params.get("page") or body.get("page") or 1))
    size = int(query_params.get("size") or body.get("size") or 25)
    if size == 0:
        size = 25
    if size < 0:
        size = 10_000

    mode = str(body.get("mode") or query_params.get("mode") or "")
    if mode == "course_marking_gaps":
        if "min_rate" in body:
            min_rate = _parse_float(body.get("min_rate"))
        elif query_params.get("min_rate") is not None:
            min_rate = _parse_float(query_params.get("min_rate"))
        else:
            min_rate = 80.0
    else:
        min_rate = _parse_float(body.get("min_rate") or query_params.get("min_rate"))

    if "category_ids" in body:
        category_ids = _parse_int_list(body.get("category_ids"))
    elif query_params.get("category_ids") is not None:
        category_ids = _parse_int_list(query_params.get("category_ids"))
    else:
        category_ids = None

    stalled_after_marking = _parse_bool(
        body.get("stalled_after_marking")
        if "stalled_after_marking" in body
        else query_params.get("stalled_after_marking")
    )

    return GodViewFilters(
        date_from=date_from,
        date_to=date_to,
        course_id=_parse_int(body.get("course_id")),
        student_id=_parse_int(body.get("student_id")),
        teacher_id=_parse_int(body.get("teacher_id")),
        category_id=_parse_int(body.get("category_id")),
        category_ids=category_ids,
        program_id=_parse_int(body.get("program_id")),
        intake_id=_parse_int(body.get("intake_id")),
        level_id=_parse_int(body.get("level_id")),
        section_id=_parse_int(body.get("section_id")),
        campus_id=_parse_int(body.get("campus_id")),
        min_attendance_rate=_parse_float(body.get("min_attendance_rate")),
        max_attendance_rate=_parse_float(body.get("max_attendance_rate")),
        at_risk_threshold=float(
            body.get("at_risk_threshold") or DEFAULT_AT_RISK_THRESHOLD
        ),
        sort=str(body.get("sort") or "attendance_rate_asc"),
        daily_status_filter=_parse_daily_status_filter(
            body.get("daily_status_filter")
        ),
        problem_status=_parse_problem_status(
            body.get("problem_status") or query_params.get("problem_status")
        ),
        min_rate=min_rate,
        stalled_after_marking=stalled_after_marking,
        page=page,
        size=size,
    )


def _parse_date(value) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    s = str(value).strip()[:10]
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        return None


def _parse_int(value) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_bool(value) -> bool:
    if value is True or value is False:
        return value
    if value is None or value == "":
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _parse_int_list(value) -> Optional[List[int]]:
    """Parse a list/CSV of ints. Empty list is a valid (restrict-to-none) value."""
    if value is None:
        return None
    if isinstance(value, list):
        out: List[int] = []
        for item in value:
            parsed = _parse_int(item)
            if parsed is not None:
                out.append(parsed)
        return out
    if isinstance(value, str):
        if value.strip() == "":
            return []
        out = []
        for part in value.split(","):
            parsed = _parse_int(part.strip())
            if parsed is not None:
                out.append(parsed)
        return out
    parsed = _parse_int(value)
    return [parsed] if parsed is not None else []


def _parse_float(value) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_daily_status_filter(value) -> Optional[DailyAttendanceStatusFilter]:
    if value is None or value == "":
        return None
    try:
        return DailyAttendanceStatusFilter(str(value))
    except ValueError:
        return None


def _parse_problem_status(value) -> CourseMarkingProblemStatus:
    if value is None or value == "":
        return CourseMarkingProblemStatus.UNREGISTERED
    try:
        return CourseMarkingProblemStatus(str(value))
    except ValueError:
        return CourseMarkingProblemStatus.UNREGISTERED


def _session_status(ue: Optional[UserEvent]) -> str:
    if ue is None:
        return UNREGISTERED_STATUS
    return ue.attendance_status


def _is_unregistered_status(status: str) -> bool:
    return status == UNREGISTERED_STATUS


def _tally_session_status(status: str) -> str:
    if status == UserEvent.AttendanceStatus.PRESENT:
        return "present"
    if status == UserEvent.AttendanceStatus.LATE:
        return "late"
    if status in ABSENT_STATUSES:
        return "absent"
    if _is_unregistered_status(status):
        return UNREGISTERED_STATUS
    return UNREGISTERED_STATUS


def _dominant_problem(counts: Dict[str, int]) -> str:
    buckets = {
        UNREGISTERED_STATUS: counts[UNREGISTERED_STATUS],
        UserEvent.AttendanceStatus.ABSENT: counts["absent"],
        UserEvent.AttendanceStatus.LATE: counts["late"],
        UserEvent.AttendanceStatus.PRESENT: counts["present"],
    }
    max_count = max(buckets.values())
    for key in DOMINANT_PROBLEM_ORDER:
        if buckets[key] == max_count:
            return key
    return UNREGISTERED_STATUS


def _passes_course_marking_filters(
    row: Dict[str, Any],
    filters: GodViewFilters,
) -> bool:
    scheduled = row["scheduled_count"]
    if scheduled == 0:
        return False

    def rate(count_key: str) -> float:
        return (row[count_key] / scheduled) * 100

    problem = filters.problem_status
    min_rate = filters.min_rate

    if problem in (
        CourseMarkingProblemStatus.UNREGISTERED,
        CourseMarkingProblemStatus.ALL,
    ):
        if min_rate is not None and rate("unregistered_count") < min_rate:
            return False
        return True

    status_key = {
        CourseMarkingProblemStatus.ABSENT: "absent_count",
        CourseMarkingProblemStatus.LATE: "late_count",
        CourseMarkingProblemStatus.PRESENT: "present_count",
    }[problem]
    expected_dominant = {
        CourseMarkingProblemStatus.ABSENT: UserEvent.AttendanceStatus.ABSENT,
        CourseMarkingProblemStatus.LATE: UserEvent.AttendanceStatus.LATE,
        CourseMarkingProblemStatus.PRESENT: UserEvent.AttendanceStatus.PRESENT,
    }[problem]
    if row["dominant_problem"] != expected_dominant:
        return False
    if min_rate is not None and rate(status_key) < min_rate:
        return False
    return True


def _matches_course_marking_problem_status(
    status: str,
    problem_status: CourseMarkingProblemStatus,
) -> bool:
    if problem_status == CourseMarkingProblemStatus.ALL:
        return True
    if problem_status == CourseMarkingProblemStatus.UNREGISTERED:
        return _is_unregistered_status(status)
    if problem_status == CourseMarkingProblemStatus.ABSENT:
        return status in {s.value for s in ABSENT_STATUSES}
    return status == problem_status.value


def _filter_courses(filters: GodViewFilters):
    qs = Course.objects.all()
    if filters.course_id:
        qs = qs.filter(id=filters.course_id)
    if filters.category_ids is not None:
        if len(filters.category_ids) == 0:
            return qs.none()
        qs = qs.filter(category_id__in=filters.category_ids)
    elif filters.category_id:
        qs = qs.filter(category_id=filters.category_id)
    if filters.program_id:
        qs = qs.filter(program_id=filters.program_id)
    if filters.intake_id:
        qs = qs.filter(intake_id=filters.intake_id)
    if filters.level_id:
        qs = qs.filter(level_id=filters.level_id)
    if filters.section_id:
        qs = qs.filter(section_id=filters.section_id)
    if filters.campus_id:
        qs = qs.filter(campus_id=filters.campus_id)
    if filters.teacher_id:
        qs = qs.filter(
            user_courses__assigned_as=UserCourse.AssignedAs.TEACHER,
            user_courses__user_id=filters.teacher_id,
        ).distinct()
    return qs


def _date_range_bounds(filters: GodViewFilters) -> Tuple[datetime, datetime]:
    start_dt = timezone.make_aware(
        datetime.combine(filters.date_from, datetime.min.time())
    )
    end_dt = timezone.make_aware(
        datetime.combine(filters.date_to, datetime.max.time())
    )
    return start_dt, end_dt


def _event_date_range_q(filters: GodViewFilters) -> Q:
    start_dt, end_dt = _date_range_bounds(filters)
    return Q(date__gte=start_dt, date__lte=end_dt)


def _user_event_date_range_q(filters: GodViewFilters) -> Q:
    start_dt, end_dt = _date_range_bounds(filters)
    return Q(event__date__gte=start_dt, event__date__lte=end_dt)


def _compute_streak_and_last(
    events_ordered_desc: List[Tuple[int, datetime, str]],
) -> Tuple[int, Optional[str], Optional[str]]:
    """events: (event_id, date, status). Newest first."""
    streak = 0
    last_attended_date = None
    last_status = None
    if events_ordered_desc:
        last_status = events_ordered_desc[0][2]
    for _eid, ev_date, status in events_ordered_desc:
        if status in ATTENDED_STATUSES:
            if last_attended_date is None:
                last_attended_date = ev_date.date().isoformat() if hasattr(ev_date, "date") else str(ev_date)[:10]
            break
        if status in ABSENT_STATUSES or status == UNREGISTERED_STATUS:
            streak += 1
        else:
            break
    return streak, last_attended_date, last_status


def _sort_events_desc(events: List[Event]) -> List[Event]:
    return sorted(events, key=lambda e: e.date, reverse=True)


def _roster_student_course_pairs(
    filters: GodViewFilters,
    course_ids: list[int],
) -> list[tuple[int, int]]:
    uc_qs = UserCourse.objects.filter(
        course_id__in=course_ids,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    )
    if filters.student_id:
        uc_qs = uc_qs.filter(user_id=filters.student_id)
    return list(uc_qs.values_list("user_id", "course_id"))


def _load_god_view_roster_entries(
    filters: GodViewFilters,
    course_ids: list[int],
) -> list[dict[str, Any]]:
    pairs = _roster_student_course_pairs(filters, course_ids)
    if not pairs:
        return []
    user_ids = {user_id for user_id, _ in pairs}
    course_id_set = {course_id for _, course_id in pairs}
    user_map = {
        user.id: user
        for user in User.objects.filter(id__in=user_ids).only(
            "id", "name", "email", "phone_number"
        )
    }
    course_map = {
        course.id: course
        for course in Course.objects.filter(id__in=course_id_set)
        .select_related("category", "program")
        .only(
            "id",
            "title",
            "code",
            "category_id",
            "program_id",
            "category__name",
            "program__name",
        )
    }
    entries: list[dict[str, Any]] = []
    for user_id, course_id in pairs:
        user = user_map.get(user_id)
        course = course_map.get(course_id)
        if user is None or course is None:
            continue
        entries.append(
            {
                "user_id": user_id,
                "course_id": course_id,
                "user": user,
                "course": course,
            }
        )
    return entries


def hydrate_god_view_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not rows:
        return rows

    student_ids = {row["student_id"] for row in rows}
    course_ids = {row["course_id"] for row in rows}
    enrollment_map = {
        (uc.user_id, uc.course_id): uc
        for uc in UserCourse.objects.filter(
            user_id__in=student_ids,
            course_id__in=course_ids,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        .select_related("user", "course", "course__category", "course__program")
        .only(
            "user_id",
            "course_id",
            "user__id",
            "user__name",
            "user__email",
            "user__phone_number",
            "course__id",
            "course__title",
            "course__code",
            "course__category_id",
            "course__program_id",
            "course__category__name",
            "course__program__name",
        )
    }
    user_map = {
        u.id: u
        for u in User.objects.filter(id__in=student_ids).only(
            "id", "name", "email", "phone_number"
        )
    }
    course_map = {
        c.id: c
        for c in Course.objects.filter(id__in=course_ids)
        .select_related("category", "program")
        .only(
            "id",
            "title",
            "code",
            "category_id",
            "program_id",
            "category__name",
            "program__name",
        )
    }

    hydrated: List[Dict[str, Any]] = []
    for row in rows:
        uc = enrollment_map.get((row["student_id"], row["course_id"]))
        user = uc.user if uc else user_map.get(row["student_id"])
        course = uc.course if uc else course_map.get(row["course_id"])
        hydrated.append(
            {
                **row,
                "student_name": user.name or "" if user else "",
                "student_email": user.email or "" if user else "",
                "student_phone": getattr(user, "phone_number", None) or "" if user else "",
                "course_title": course.title if course else "",
                "course_code": course.code or "" if course else "",
                "category_id": course.category_id if course else None,
                "category_name": course.category.name if course and course.category_id else "",
                "program_id": course.program_id if course else None,
                "program_name": course.program.name if course and course.program_id else "",
            }
        )
    return hydrated


def build_god_view_rows(
    filters: GodViewFilters,
    *,
    hydrate: bool = True,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    from app_attendance.god_view_sql import fetch_god_view_page

    # `hydrate` is unused: SQL already joins student/course names.
    _ = hydrate
    summary, rows, _count = fetch_god_view_page(filters)
    return summary, rows


def _build_daily_summary(rows: List[Dict[str, Any]], filters: GodViewFilters) -> Dict[str, Any]:
    return {
        "present_count": sum(
            1
            for row in rows
            if row["attendance_status"] == UserEvent.AttendanceStatus.PRESENT
        ),
        "late_count": sum(
            1
            for row in rows
            if row["attendance_status"] == UserEvent.AttendanceStatus.LATE
        ),
        "absent_count": sum(
            1 for row in rows if row["attendance_status"] in ABSENT_STATUSES
        ),
        "unregistered_count": sum(
            1 for row in rows if row["attendance_status"] == UNREGISTERED_STATUS
        ),
        "courses_affected_count": len({row["course_id"] for row in rows}),
        "students_with_streaks_count": len(
            {row["student_id"] for row in rows if row["recent_absence_streak"] > 1}
        ),
        "date_from": filters.date_from.isoformat(),
        "date_to": filters.date_to.isoformat(),
    }


def _with_scheduled_sessions_flag(
    summary: Dict[str, Any],
    filters: GodViewFilters,
    has_events: Optional[bool],
) -> Dict[str, Any]:
    if filters.course_id is None:
        return summary
    summary["has_scheduled_sessions"] = bool(has_events)
    return summary


def _build_student_course_timeline(
    student_id: int,
    course_id: int,
    course_events: List[Event],
    ue_by_user_event: Dict[Tuple[int, int], UserEvent],
) -> List[Tuple[int, datetime, str]]:
    timeline: List[Tuple[int, datetime, str]] = []
    for ev in course_events:
        ue = ue_by_user_event.get((student_id, ev.id))
        status = _session_status(ue)
        timeline.append((ev.id, ev.date, status))
    return timeline


def build_daily_absence_rows(
    filters: GodViewFilters,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    course_qs = _filter_courses(filters)
    course_ids = list(course_qs.values_list("id", flat=True))
    if not course_ids:
        return _build_daily_summary([], filters), []

    roster_entries = _load_god_view_roster_entries(filters, course_ids)
    if not roster_entries:
        return _build_daily_summary([], filters), []

    student_ids = {entry["user_id"] for entry in roster_entries}
    roster_by_course: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
    for entry in roster_entries:
        roster_by_course[entry["course_id"]].append(entry)

    streak_filters = GodViewFilters(
        date_from=filters.date_from - timedelta(days=90),
        date_to=filters.date_to,
        course_id=filters.course_id,
        student_id=filters.student_id,
        category_id=filters.category_id,
        category_ids=filters.category_ids,
        program_id=filters.program_id,
        intake_id=filters.intake_id,
        level_id=filters.level_id,
        section_id=filters.section_id,
        campus_id=filters.campus_id,
    )
    streak_events = list(
        Event.objects.filter(course_id__in=course_ids)
        .filter(_event_date_range_q(streak_filters))
        .only("id", "date", "course_id", "time_from")
        .order_by("date", "time_from")
    )
    streak_events_by_course: Dict[int, List[Event]] = defaultdict(list)
    for ev in streak_events:
        streak_events_by_course[ev.course_id].append(ev)
    for course_events in streak_events_by_course.values():
        course_events.sort(key=lambda e: e.date, reverse=True)

    streak_ue_by_user_event = {
        (ue.user_id, ue.event_id): ue
        for ue in UserEvent.objects.filter(
            user_id__in=student_ids,
            event_id__in=[ev.id for ev in streak_events],
        ).only("user_id", "event_id", "attendance_status")
    }

    timeline_cache: Dict[Tuple[int, int], List[Tuple[int, datetime, str]]] = {}

    def get_timeline(student_id: int, course_id: int) -> List[Tuple[int, datetime, str]]:
        key = (student_id, course_id)
        if key not in timeline_cache:
            timeline_cache[key] = _build_student_course_timeline(
                student_id,
                course_id,
                streak_events_by_course.get(course_id, []),
                streak_ue_by_user_event,
            )
        return timeline_cache[key]

    events = list(
        Event.objects.filter(course_id__in=course_ids)
        .filter(_event_date_range_q(filters))
        .select_related("course", "course__category", "course__program")
        .only(
            "id",
            "title",
            "date",
            "time_from",
            "time_to",
            "course_id",
            "course__id",
            "course__title",
            "course__code",
            "course__category_id",
            "course__program_id",
            "course__category__name",
            "course__program__name",
        )
        .order_by("date", "time_from", "course__title")
    )
    if not events:
        summary = _build_daily_summary([], filters)
        return _with_scheduled_sessions_flag(summary, filters, False), []

    day_ue_by_user_event = {
        (ue.user_id, ue.event_id): ue
        for ue in UserEvent.objects.filter(
            user_id__in=student_ids,
            event_id__in=[ev.id for ev in events],
        ).only("user_id", "event_id", "attendance_status", "attendance_note")
    }

    rows: List[Dict[str, Any]] = []
    for ev in events:
        course = ev.course
        for entry in roster_by_course.get(ev.course_id, []):
            ue = day_ue_by_user_event.get((entry["user_id"], ev.id))
            status = _session_status(ue)

            streak, last_attended, _last_status = _compute_streak_and_last(
                get_timeline(entry["user_id"], entry["course_id"])
            )
            student = entry["user"]
            course = entry["course"]

            rows.append(
                {
                    "student_id": entry["user_id"],
                    "student_name": student.name or "",
                    "student_email": student.email or "",
                    "student_phone": getattr(student, "phone_number", None) or "",
                    "course_id": entry["course_id"],
                    "course_title": course.title,
                    "course_code": course.code or "",
                    "category_id": course.category_id,
                    "category_name": course.category.name if course.category_id else "",
                    "program_id": course.program_id,
                    "program_name": course.program.name if course.program_id else "",
                    "event_id": ev.id,
                    "event_title": ev.title,
                    "event_date": ev.date.isoformat() if ev.date else None,
                    "time_from": str(ev.time_from),
                    "time_to": str(ev.time_to),
                    "attendance_status": status,
                    "attendance_note": ue.attendance_note if ue else None,
                    "recent_absence_streak": streak,
                    "last_attended_date": last_attended,
                }
            )

    summary = _build_daily_summary(rows, filters)
    if filters.daily_status_filter:
        filter_value = filters.daily_status_filter.value
        if filters.daily_status_filter == DailyAttendanceStatusFilter.ABSENT:
            absent_values = {s.value for s in ABSENT_STATUSES}
            rows = [row for row in rows if row["attendance_status"] in absent_values]
        else:
            rows = [row for row in rows if row["attendance_status"] == filter_value]
    summary = _with_scheduled_sessions_flag(summary, filters, True)
    return summary, rows


def _empty_course_marking_gap_summary(
    filters: GodViewFilters,
    *,
    has_scheduled_sessions: Optional[bool] = None,
) -> Dict[str, Any]:
    summary = {
        "courses_affected_count": 0,
        "unregistered_slots_count": 0,
        "worst_course": None,
        "date_from": filters.date_from.isoformat(),
        "date_to": filters.date_to.isoformat(),
    }
    if filters.course_id is not None and has_scheduled_sessions is not None:
        summary["has_scheduled_sessions"] = has_scheduled_sessions
    return summary


def _build_course_marking_gap_summary(
    rows: List[Dict[str, Any]],
    filters: GodViewFilters,
) -> Dict[str, Any]:
    if not rows:
        return _empty_course_marking_gap_summary(filters)
    worst = max(rows, key=lambda row: (row["unregistered_rate"], row["course_title"].lower()))
    return {
        "courses_affected_count": len(rows),
        "unregistered_slots_count": sum(row["unregistered_count"] for row in rows),
        "worst_course": {
            "course_id": worst["course_id"],
            "course_title": worst["course_title"],
            "unregistered_rate": worst["unregistered_rate"],
        },
        "date_from": filters.date_from.isoformat(),
        "date_to": filters.date_to.isoformat(),
    }


def _event_local_date(ev: Event) -> date:
    raw = ev.date
    if isinstance(raw, datetime):
        if timezone.is_aware(raw):
            return timezone.localtime(raw).date()
        return raw.date()
    return raw


def _marked_count_by_event_id(
    event_ids: List[int],
    student_ids: List[int],
) -> Dict[int, int]:
    """Count present+late+absent UserEvents per event_id."""
    counts: Dict[int, int] = defaultdict(int)
    if not event_ids or not student_ids:
        return {}
    for row in (
        UserEvent.objects.filter(
            event_id__in=event_ids,
            user_id__in=student_ids,
            attendance_status__in=[
                UserEvent.AttendanceStatus.PRESENT,
                UserEvent.AttendanceStatus.LATE,
                *ABSENT_STATUSES,
            ],
        )
        .values("event_id")
        .annotate(n=Count("id"))
    ):
        counts[row["event_id"]] = row["n"]
    return dict(counts)


def _course_matches_stalled_after_marking(
    course_events: List[Event],
    roster_size: int,
    marked_by_event_id: Dict[int, int],
) -> bool:
    if roster_size <= 0 or len(course_events) == 0:
        return False

    events_by_date: Dict[date, List[Event]] = defaultdict(list)
    for ev in course_events:
        events_by_date[_event_local_date(ev)].append(ev)

    day_flags: List[Tuple[date, bool, bool]] = []
    for day in sorted(events_by_date.keys()):
        day_events = events_by_date[day]
        scheduled = roster_size * len(day_events)
        if scheduled <= 0:
            continue
        marked = sum(marked_by_event_id.get(ev.id, 0) for ev in day_events)
        has_any_marked = marked > 0
        is_fully_unregistered = marked == 0
        day_flags.append((day, has_any_marked, is_fully_unregistered))

    if len(day_flags) < 2:
        return False
    if not any(has_any for _, has_any, _ in day_flags):
        return False
    for i in range(len(day_flags) - 1):
        if day_flags[i][2] and day_flags[i + 1][2]:
            return True
    return False


def _load_course_marking_gap_aggregate(
    filters: GodViewFilters,
) -> Tuple[
    Dict[int, int],
    Dict[int, List[Event]],
    Dict[int, Dict[str, int]],
]:
    course_qs = _filter_courses(filters)
    course_ids = list(course_qs.values_list("id", flat=True))
    if not course_ids:
        return {}, {}, {}

    uc_qs = UserCourse.objects.filter(
        course_id__in=course_ids,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    )
    if filters.student_id:
        uc_qs = uc_qs.filter(user_id=filters.student_id)

    roster_size_by_course = dict(
        uc_qs.values("course_id")
        .annotate(n=Count("user_id"))
        .values_list("course_id", "n")
    )
    if not roster_size_by_course:
        return {}, {}, {}

    student_ids = list(uc_qs.values_list("user_id", flat=True).distinct())

    events = list(
        Event.objects.filter(course_id__in=course_ids)
        .filter(_event_date_range_q(filters))
        .select_related("course", "course__category", "course__program")
        .order_by("date", "time_from", "course__title")
    )
    if not events:
        return roster_size_by_course, {}, {}

    events_by_course: Dict[int, List[Event]] = defaultdict(list)
    for ev in events:
        events_by_course[ev.course_id].append(ev)

    event_ids = [ev.id for ev in events]
    status_counts_by_course: Dict[int, Dict[str, int]] = defaultdict(
        lambda: {"present": 0, "late": 0, "absent": 0}
    )
    for row in (
        UserEvent.objects.filter(
            user_id__in=student_ids,
            event_id__in=event_ids,
        )
        .values("event__course_id", "attendance_status")
        .annotate(n=Count("id"))
    ):
        course_id = row["event__course_id"]
        bucket = _tally_session_status(row["attendance_status"])
        if bucket == UNREGISTERED_STATUS:
            continue
        status_counts_by_course[course_id][bucket] += row["n"]

    return roster_size_by_course, dict(events_by_course), dict(status_counts_by_course)


def _load_course_marking_gap_detail_context(
    filters: GodViewFilters,
) -> Tuple[
    Dict[int, List[UserCourse]],
    Dict[int, List[Event]],
    Dict[Tuple[int, int], UserEvent],
]:
    course_qs = _filter_courses(filters)
    course_ids = list(course_qs.values_list("id", flat=True))
    if not course_ids:
        return {}, {}, {}

    uc_qs = UserCourse.objects.filter(
        course_id__in=course_ids,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).select_related("user", "course", "course__category", "course__program")
    if filters.student_id:
        uc_qs = uc_qs.filter(user_id=filters.student_id)

    roster = list(uc_qs)
    if not roster:
        return {}, {}, {}

    student_ids = {uc.user_id for uc in roster}
    roster_by_course: Dict[int, List[UserCourse]] = defaultdict(list)
    for uc in roster:
        roster_by_course[uc.course_id].append(uc)

    events = list(
        Event.objects.filter(course_id__in=course_ids)
        .filter(_event_date_range_q(filters))
        .select_related("course", "course__category", "course__program")
        .order_by("date", "time_from", "course__title")
    )
    events_by_course: Dict[int, List[Event]] = defaultdict(list)
    for ev in events:
        events_by_course[ev.course_id].append(ev)

    day_ue_by_user_event = {
        (ue.user_id, ue.event_id): ue
        for ue in UserEvent.objects.filter(
            user_id__in=student_ids,
            event_id__in=[ev.id for ev in events],
        ).only("user_id", "event_id", "attendance_status", "attendance_note")
    }
    return roster_by_course, events_by_course, day_ue_by_user_event


def build_course_marking_gap_rows(
    filters: GodViewFilters,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    roster_size_by_course, events_by_course, status_counts_by_course = (
        _load_course_marking_gap_aggregate(filters)
    )
    if not events_by_course:
        return (
            _empty_course_marking_gap_summary(
                filters,
                has_scheduled_sessions=False if filters.course_id else None,
            ),
            [],
        )

    marked_by_event_id: Dict[int, int] = {}
    if filters.stalled_after_marking:
        all_event_ids = [ev.id for evs in events_by_course.values() for ev in evs]
        student_ids = list(
            UserCourse.objects.filter(
                course_id__in=list(events_by_course.keys()),
                assigned_as=UserCourse.AssignedAs.STUDENT,
            ).values_list("user_id", flat=True)
        )
        if filters.student_id:
            student_ids = [sid for sid in student_ids if sid == filters.student_id]
        marked_by_event_id = _marked_count_by_event_id(all_event_ids, student_ids)

    rows: List[Dict[str, Any]] = []
    for course_id, course_events in events_by_course.items():
        roster_size = roster_size_by_course.get(course_id, 0)
        if roster_size == 0:
            continue

        events_count = len(course_events)
        scheduled = events_count * roster_size
        marked = status_counts_by_course.get(
            course_id,
            {"present": 0, "late": 0, "absent": 0},
        )
        present = marked["present"]
        late = marked["late"]
        absent = marked["absent"]
        unregistered = scheduled - present - late - absent
        counts = {
            "present": present,
            "late": late,
            "absent": absent,
            UNREGISTERED_STATUS: unregistered,
        }

        course = course_events[0].course
        unregistered_rate = round((unregistered / scheduled) * 100, 2)
        row = {
            "course_id": course_id,
            "course_title": course.title,
            "course_code": course.code or "",
            "category_id": course.category_id,
            "category_name": course.category.name if course.category_id else "",
            "program_id": course.program_id,
            "program_name": course.program.name if course.program_id else "",
            "event_date_from": filters.date_from.isoformat(),
            "event_date_to": filters.date_to.isoformat(),
            "scheduled_count": scheduled,
            "present_count": present,
            "late_count": late,
            "absent_count": absent,
            "unregistered_count": unregistered,
            "unregistered_rate": unregistered_rate,
            "dominant_problem": _dominant_problem(counts),
        }
        if filters.stalled_after_marking:
            if _course_matches_stalled_after_marking(
                course_events, roster_size, marked_by_event_id
            ):
                rows.append(row)
        elif _passes_course_marking_filters(row, filters):
            rows.append(row)

    rows.sort(key=lambda r: (-r["unregistered_rate"], r["course_title"].lower()))
    summary = _build_course_marking_gap_summary(rows, filters)
    summary = _with_scheduled_sessions_flag(summary, filters, True)
    return summary, rows


def build_course_marking_gap_detail(
    course_id: int,
    filters: GodViewFilters,
    problem_status: CourseMarkingProblemStatus = CourseMarkingProblemStatus.UNREGISTERED,
) -> List[Dict[str, Any]]:
    scoped_filters = GodViewFilters(
        date_from=filters.date_from,
        date_to=filters.date_to,
        course_id=course_id,
        student_id=filters.student_id,
        category_id=filters.category_id,
        category_ids=filters.category_ids,
        program_id=filters.program_id,
        intake_id=filters.intake_id,
        level_id=filters.level_id,
        section_id=filters.section_id,
        campus_id=filters.campus_id,
    )
    roster_by_course, events_by_course, day_ue_by_user_event = (
        _load_course_marking_gap_detail_context(scoped_filters)
    )
    course_events = events_by_course.get(course_id, [])
    roster = roster_by_course.get(course_id, [])
    if not course_events or not roster:
        return []

    streak_filters = GodViewFilters(
        date_from=filters.date_to - timedelta(days=90),
        date_to=filters.date_to,
        course_id=course_id,
    )
    streak_events = list(
        Event.objects.filter(course_id=course_id)
        .filter(_event_date_range_q(streak_filters))
        .only("id", "date", "time_from")
        .order_by("date", "time_from")
    )
    streak_events_desc = _sort_events_desc(streak_events)
    streak_ue_by_user_event = {
        (ue.user_id, ue.event_id): ue
        for ue in UserEvent.objects.filter(
            user_id__in={uc.user_id for uc in roster},
            event_id__in=[ev.id for ev in streak_events],
        ).only("user_id", "event_id", "attendance_status")
    }
    timeline_cache: Dict[int, List[Tuple[int, datetime, str]]] = {}

    def get_timeline(student_id: int) -> List[Tuple[int, datetime, str]]:
        if student_id not in timeline_cache:
            timeline_cache[student_id] = _build_student_course_timeline(
                student_id,
                course_id,
                streak_events_desc,
                streak_ue_by_user_event,
            )
        return timeline_cache[student_id]

    rows: List[Dict[str, Any]] = []
    course = course_events[0].course
    for ev in course_events:
        for uc in roster:
            ue = day_ue_by_user_event.get((uc.user_id, ev.id))
            status = _session_status(ue)
            if not _matches_course_marking_problem_status(status, problem_status):
                continue

            streak, last_attended, _last_status = _compute_streak_and_last(
                get_timeline(uc.user_id)
            )
            rows.append(
                {
                    "student_id": uc.user_id,
                    "student_name": uc.user.name or "",
                    "student_email": uc.user.email or "",
                    "student_phone": getattr(uc.user, "phone_number", None) or "",
                    "course_id": course_id,
                    "course_title": course.title,
                    "course_code": course.code or "",
                    "category_id": course.category_id,
                    "category_name": course.category.name if course.category_id else "",
                    "program_id": course.program_id,
                    "program_name": course.program.name if course.program_id else "",
                    "event_id": ev.id,
                    "event_title": ev.title,
                    "event_date": ev.date.isoformat() if ev.date else None,
                    "time_from": str(ev.time_from),
                    "time_to": str(ev.time_to),
                    "attendance_status": status,
                    "attendance_note": ue.attendance_note if ue else None,
                    "recent_absence_streak": streak,
                    "last_attended_date": last_attended,
                }
            )

    rows.sort(
        key=lambda row: (
            row["student_name"].lower(),
            row["time_from"],
            row["event_title"].lower(),
        )
    )
    return rows


def _empty_monthly_summary(filters: GodViewFilters) -> Dict[str, Any]:
    return {
        "students_at_risk_count": 0,
        "total_absences": 0,
        "unregistered_count": 0,
        "worst_course": None,
        "date_from": filters.date_from.isoformat(),
        "date_to": filters.date_to.isoformat(),
        "at_risk_threshold": filters.at_risk_threshold,
    }


def _pick_worst_course(
    course_rows: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if not course_rows:
        return None
    worst = sorted(
        course_rows,
        key=lambda row: (
            -row["absent_count"],
            row["attendance_rate"],
            row["course_title"].lower(),
        ),
    )[0]
    return {
        "course_id": worst["course_id"],
        "course_title": worst["course_title"],
        "attendance_rate": worst["attendance_rate"],
        "absent_count": worst["absent_count"],
    }


def build_monthly_student_rows(
    filters: GodViewFilters,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    _risk_summary, course_rows = build_god_view_rows(filters)
    if not course_rows:
        return _empty_monthly_summary(filters), []

    grouped: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
    for row in course_rows:
        grouped[row["student_id"]].append(row)

    monthly_rows: List[Dict[str, Any]] = []
    for student_id, rows in grouped.items():
        first = rows[0]
        scheduled = sum(row["scheduled_classes"] for row in rows)
        present = sum(row["present_count"] for row in rows)
        late = sum(row["late_count"] for row in rows)
        absent = sum(row["absent_count"] for row in rows)
        unregistered = sum(row["unregistered_count"] for row in rows)
        attended = present + late
        attendance_rate = round((attended / scheduled) * 100, 2) if scheduled else 0.0
        absence_rate = round((absent / scheduled) * 100, 2) if scheduled else 0.0
        late_rate = round((late / scheduled) * 100, 2) if scheduled else 0.0
        last_attended_dates = [
            row["last_attended_date"] for row in rows if row["last_attended_date"]
        ]
        last_attended = max(last_attended_dates) if last_attended_dates else None
        streak = max(row["recent_absence_streak"] for row in rows)
        worst_course = _pick_worst_course(rows)

        monthly_rows.append(
            {
                "student_id": student_id,
                "student_name": first["student_name"],
                "student_email": first["student_email"],
                "student_phone": first["student_phone"],
                "course_count": len(rows),
                "scheduled_classes": scheduled,
                "present_count": present,
                "late_count": late,
                "absent_count": absent,
                "unregistered_count": unregistered,
                "attendance_rate": attendance_rate,
                "absence_rate": absence_rate,
                "late_rate": late_rate,
                "worst_course": worst_course,
                "recent_absence_streak": streak,
                "last_attended_date": last_attended,
                "is_at_risk": attendance_rate < filters.at_risk_threshold,
                "is_late_heavy": late_rate >= LATE_HEAVY_RATE_THRESHOLD,
                "has_unregistered": unregistered > 0,
            }
        )

    monthly_rows = sorted(
        monthly_rows,
        key=lambda row: (
            row["attendance_rate"],
            -row["absent_count"],
            row["student_name"].lower(),
        ),
    )
    worst_courses = [
        row["worst_course"] for row in monthly_rows if row.get("worst_course")
    ]
    summary = {
        "students_at_risk_count": sum(1 for row in monthly_rows if row["is_at_risk"]),
        "total_absences": sum(row["absent_count"] for row in monthly_rows),
        "unregistered_count": sum(row["unregistered_count"] for row in monthly_rows),
        "worst_course": sorted(
            worst_courses,
            key=lambda row: (-row["absent_count"], row["course_title"].lower()),
        )[0]
        if worst_courses
        else None,
        "date_from": filters.date_from.isoformat(),
        "date_to": filters.date_to.isoformat(),
        "at_risk_threshold": filters.at_risk_threshold,
    }
    return summary, monthly_rows


def build_monthly_student_detail(
    student_id: int,
    filters: GodViewFilters,
) -> Dict[str, Any]:
    scoped_filters = GodViewFilters(
        date_from=filters.date_from,
        date_to=filters.date_to,
        course_id=filters.course_id,
        student_id=student_id,
        category_id=filters.category_id,
        category_ids=filters.category_ids,
        program_id=filters.program_id,
        intake_id=filters.intake_id,
        level_id=filters.level_id,
        section_id=filters.section_id,
        campus_id=filters.campus_id,
        at_risk_threshold=filters.at_risk_threshold,
        sort=filters.sort,
        page=1,
        size=-1,
    )
    _summary, course_rows = build_god_view_rows(scoped_filters)
    records_by_course = build_god_view_detail_bulk(
        student_id,
        [row["course_id"] for row in course_rows],
        filters.date_from,
        filters.date_to,
    )
    course_records = [
        {
            "course_id": row["course_id"],
            "course_title": row["course_title"],
            "records": records_by_course.get(row["course_id"], []),
        }
        for row in course_rows
    ]

    return {
        "student_id": student_id,
        "date_from": filters.date_from.isoformat(),
        "date_to": filters.date_to.isoformat(),
        "course_breakdown": course_rows,
        "course_records": course_records,
    }


def _empty_summary(filters: GodViewFilters) -> Dict[str, Any]:
    return {
        "average_attendance_rate": 0.0,
        "at_risk_count": 0,
        "absent_last_7_days_total": 0,
        "late_heavy_count": 0,
        "total_student_course_pairs": 0,
        "date_from": filters.date_from.isoformat(),
        "date_to": filters.date_to.isoformat(),
        "at_risk_threshold": filters.at_risk_threshold,
    }


def _build_summary(rows: List[Dict[str, Any]], filters: GodViewFilters) -> Dict[str, Any]:
    if not rows:
        return _empty_summary(filters)
    total_scheduled = sum(r["scheduled_classes"] for r in rows)
    weighted_attended = sum(
        (r["present_count"] + r["late_count"]) for r in rows
    )
    avg_rate = (
        round((weighted_attended / total_scheduled) * 100, 2)
        if total_scheduled
        else 0.0
    )
    return {
        "average_attendance_rate": avg_rate,
        "at_risk_count": sum(1 for r in rows if r["is_at_risk"]),
        "absent_last_7_days_total": sum(r["absent_last_7_days"] for r in rows),
        "late_heavy_count": sum(1 for r in rows if r["is_late_heavy"]),
        "total_student_course_pairs": len(rows),
        "date_from": filters.date_from.isoformat(),
        "date_to": filters.date_to.isoformat(),
        "at_risk_threshold": filters.at_risk_threshold,
    }


def _student_sort_name(rows: List[Dict[str, Any]]) -> Dict[int, str]:
    if not rows:
        return {}
    if "student_name" in rows[0]:
        return {
            row["student_id"]: row.get("student_name") or ""
            for row in rows
        }
    student_ids = {row["student_id"] for row in rows}
    return dict(
        User.objects.filter(id__in=student_ids).values_list("id", "name")
    )


def _sort_rows(rows: List[Dict[str, Any]], sort: str) -> List[Dict[str, Any]]:
    if sort == "attendance_rate_desc":
        return sorted(rows, key=lambda r: r["attendance_rate"], reverse=True)
    if sort == "student_name":
        names = _student_sort_name(rows)
        return sorted(
            rows,
            key=lambda r: (
                (names.get(r["student_id"]) or "").lower(),
                r["course_id"],
            ),
        )
    if sort == "recent_risk":
        return sorted(
            rows,
            key=lambda r: (
                -r["recent_absence_streak"],
                -r["absent_last_7_days"],
                r["attendance_rate"],
            ),
        )
    names = _student_sort_name(rows)
    return sorted(
        rows,
        key=lambda r: (
            r["attendance_rate"],
            -r["recent_absence_streak"],
            (names.get(r["student_id"]) or "").lower(),
        ),
    )


def paginate_rows(
    rows: List[Dict[str, Any]], page: int, size: int
) -> Tuple[List[Dict[str, Any]], int]:
    count = len(rows)
    if size < 0:
        return rows, count
    start = (page - 1) * size
    end = start + size
    return rows[start:end], count


def _event_detail_date_bounds(date_from: date, date_to: date) -> Tuple[datetime, datetime]:
    start_dt = timezone.make_aware(datetime.combine(date_from, datetime.min.time()))
    end_dt = timezone.make_aware(datetime.combine(date_to, datetime.max.time()))
    return start_dt, end_dt


def _build_detail_record(ev: Event, ue: Optional[UserEvent]) -> Dict[str, Any]:
    if ue is None:
        status = UNREGISTERED_STATUS
        note = None
        checkin = checkout = None
        is_extra_class = False
    else:
        status = ue.attendance_status
        note = ue.attendance_note
        checkin = ue.checkin_time.isoformat() if ue.checkin_time else None
        checkout = ue.checkout_time.isoformat() if ue.checkout_time else None
        is_extra_class = ue.is_extra_class
    return {
        "event_id": ev.id,
        "event_title": ev.title,
        "event_date": ev.date.isoformat() if ev.date else None,
        "time_from": str(ev.time_from),
        "time_to": str(ev.time_to),
        "attendance_status": status,
        "attendance_note": note,
        "checkin_time": checkin,
        "checkout_time": checkout,
        "is_extra_class": is_extra_class,
    }


def build_god_view_detail_bulk(
    student_id: int,
    course_ids: List[int],
    date_from: date,
    date_to: date,
) -> Dict[int, List[Dict[str, Any]]]:
    if not course_ids:
        return {}

    start_dt, end_dt = _event_detail_date_bounds(date_from, date_to)
    events = list(
        Event.objects.filter(
            course_id__in=course_ids,
            date__gte=start_dt,
            date__lte=end_dt,
        )
        .only("id", "title", "date", "time_from", "time_to", "course_id")
        .order_by("course_id", "-date")
    )
    ue_map = {
        ue.event_id: ue
        for ue in UserEvent.objects.filter(
            user_id=student_id,
            event__course_id__in=course_ids,
            event__date__gte=start_dt,
            event__date__lte=end_dt,
        ).only(
            "event_id",
            "attendance_status",
            "attendance_note",
            "checkin_time",
            "checkout_time",
            "is_extra_class",
        )
    }

    records_by_course: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
    for ev in events:
        records_by_course[ev.course_id].append(
            _build_detail_record(ev, ue_map.get(ev.id))
        )
    return dict(records_by_course)


def build_god_view_detail(
    student_id: int,
    course_id: int,
    date_from: date,
    date_to: date,
) -> List[Dict[str, Any]]:
    return build_god_view_detail_bulk(
        student_id,
        [course_id],
        date_from,
        date_to,
    ).get(course_id, [])


SUMMARY_CSV_HEADERS = [
    "student_name",
    "student_email",
    "course_title",
    "attendance_rate",
    "present_count",
    "late_count",
    "absent_count",
    "unregistered_count",
    "scheduled_classes",
    "recent_absence_streak",
    "last_attended_date",
    "last_class_status",
    "absent_last_7_days",
]

DAILY_ABSENCE_CSV_HEADERS = [
    "student_id",
    "student_name",
    "student_email",
    "student_phone",
    "course_id",
    "course_title",
    "event_id",
    "event_title",
    "event_date",
    "time_from",
    "time_to",
    "attendance_status",
    "attendance_note",
    "recent_absence_streak",
    "last_attended_date",
]

COURSE_MARKING_GAP_CSV_HEADERS = [
    "course_id",
    "course_title",
    "course_code",
    "event_date_from",
    "event_date_to",
    "scheduled_count",
    "present_count",
    "late_count",
    "absent_count",
    "unregistered_count",
    "unregistered_rate",
    "dominant_problem",
]

COURSE_MARKING_GAP_DETAIL_CSV_HEADERS = DAILY_ABSENCE_CSV_HEADERS


def god_view_date_range_filename_suffix(date_from: date, date_to: date) -> str:
    if date_from == date_to:
        return date_from.isoformat()
    return f"{date_from.isoformat()}_to_{date_to.isoformat()}"


MONTHLY_STUDENT_CSV_HEADERS = [
    "student_id",
    "student_name",
    "student_email",
    "student_phone",
    "course_count",
    "attendance_rate",
    "present_count",
    "late_count",
    "absent_count",
    "unregistered_count",
    "scheduled_classes",
    "recent_absence_streak",
    "last_attended_date",
    "worst_course_title",
    "is_at_risk",
    "has_unregistered",
]

DETAIL_CSV_HEADERS = [
    "student_id",
    "course_id",
    "event_date",
    "event_title",
    "attendance_status",
    "attendance_note",
    "checkin_time",
    "checkout_time",
]


def god_view_csv_response(
    rows: List[Dict[str, Any]],
    headers: List[str],
    filename: str,
) -> HttpResponse:
    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(headers)
    for row in rows:
        csv_row = []
        for header in headers:
            value = row.get(header, "")
            if header == "worst_course_title":
                worst = row.get("worst_course")
                value = worst.get("course_title", "") if worst else ""
            csv_row.append(value)
        writer.writerow(csv_row)
    response = HttpResponse(buffer.getvalue(), content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def god_view_summary_csv_response(rows: List[Dict[str, Any]], filename: str) -> HttpResponse:
    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(SUMMARY_CSV_HEADERS)
    for r in rows:
        writer.writerow([r.get(h, "") for h in SUMMARY_CSV_HEADERS])
    response = HttpResponse(buffer.getvalue(), content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def god_view_detail_csv_response(
    student_id: int,
    course_id: int,
    records: List[Dict[str, Any]],
    filename: str,
) -> HttpResponse:
    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(DETAIL_CSV_HEADERS)
    for rec in records:
        writer.writerow(
            [
                student_id,
                course_id,
                rec.get("event_date"),
                rec.get("event_title"),
                rec.get("attendance_status"),
                rec.get("attendance_note"),
                rec.get("checkin_time"),
                rec.get("checkout_time"),
            ]
        )
    response = HttpResponse(buffer.getvalue(), content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def god_view_course_marking_gap_detail_csv_response(
    course_id: int,
    records: List[Dict[str, Any]],
    filename: str,
) -> HttpResponse:
    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(COURSE_MARKING_GAP_DETAIL_CSV_HEADERS)
    for rec in records:
        writer.writerow([rec.get(h, "") for h in COURSE_MARKING_GAP_DETAIL_CSV_HEADERS])
    response = HttpResponse(buffer.getvalue(), content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response

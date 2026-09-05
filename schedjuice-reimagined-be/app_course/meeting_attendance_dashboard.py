"""
Aggregate course meeting attendance (UserAttendance from Teams/Zoom) for the staff dashboard.
Session counts use Event rows; attendance uses UserAttendance.attendance_date (tenant-local).
"""

import calendar
from collections import defaultdict
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

import pytz
from django.utils import timezone as django_tz

from app_course.models import AssignedAsRole, Course, Event, UserAttendance, UserCourse
from app_course.teaching_assignment import is_teaching_assignment

ON_TIME_TOLERANCE_SECONDS = 60


def _tz(tenant) -> pytz.BaseTzInfo:
    return pytz.timezone(getattr(tenant, "timezone", None) or "UTC")


def _seniority_rank(uc: Optional[UserCourse]) -> int:
    if uc is None or uc.assigned_as_role is None:
        return 2
    s = uc.assigned_as_role.seniority
    if s == AssignedAsRole.Seniority.MAIN_TEACHER:
        return 0
    if s == AssignedAsRole.Seniority.ASSISTANT_TEACHER:
        return 1
    return 2


def _assigned_role_seniority_populated(uc: UserCourse) -> bool:
    """Top summary cards only: main or assistant teachers (excludes seniority OTHER)."""
    return is_teaching_assignment(uc)


def _events_by_local_date(
    course: Course, tz: pytz.BaseTzInfo, month_start: date, month_end: date
) -> Dict[date, List[Event]]:
    """Tenant-local calendar date -> events whose Event.date falls on that local day."""
    by_date: Dict[date, List[Event]] = defaultdict(list)
    for ev in course.events.all():
        dt_aware = (
            django_tz.make_aware(ev.date, django_tz.utc)
            if django_tz.is_naive(ev.date)
            else ev.date
        )
        local_d = dt_aware.astimezone(tz).date()
        if month_start <= local_d <= month_end:
            by_date[local_d].append(ev)
    return by_date


def _lateness_for_interval(
    join_dt,
    events_that_day: List[Event],
    tz: pytz.BaseTzInfo,
) -> Tuple[Optional[str], Optional[int]]:
    if not events_that_day:
        return None, None
    join_aware = (
        django_tz.make_aware(join_dt, django_tz.utc)
        if django_tz.is_naive(join_dt)
        else join_dt
    )
    join_local = join_aware.astimezone(tz)

    best_delta = None
    for ev in events_that_day:
        ev_aware = (
            django_tz.make_aware(ev.date, django_tz.utc)
            if django_tz.is_naive(ev.date)
            else ev.date
        )
        ev_local = ev_aware.astimezone(tz)
        d_ev = ev_local.date()
        start = tz.localize(datetime.combine(d_ev, ev.time_from))
        delta_sec = (join_local - start).total_seconds()
        if best_delta is None or abs(delta_sec) < abs(best_delta):
            best_delta = delta_sec
    if best_delta is None:
        return None, None
    if abs(best_delta) <= ON_TIME_TOLERANCE_SECONDS:
        return "On time", 0
    mins = int(round(best_delta / 60))
    if mins > 0:
        return f"{mins} min late", mins
    if mins < 0:
        return f"{abs(mins)} min early", mins
    return "On time", 0


def build_meeting_attendance_dashboard(course: Course, tenant, year: int, month: int) -> Dict[str, Any]:
    tz = _tz(tenant)
    month_start = date(year, month, 1)
    last_d = calendar.monthrange(year, month)[1]
    month_end = date(year, month, last_d)

    events_by_date = _events_by_local_date(course, tz, month_start, month_end)
    events_in_month = sum(len(v) for v in events_by_date.values())
    events_total = course.events.count()

    teacher_ucs = list(
        UserCourse.objects.filter(
            course=course,
            assigned_as=UserCourse.AssignedAs.TEACHER,
        ).select_related("user", "assigned_as_role")
    )
    teacher_ucs.sort(key=lambda uc: (_seniority_rank(uc), uc.user.name or "", uc.user_id))

    teacher_ucs_for_cards = [
        uc for uc in teacher_ucs if _assigned_role_seniority_populated(uc)
    ]

    uc_by_user_id = {uc.user_id: uc for uc in teacher_ucs}
    user_rank = {uid: _seniority_rank(uc_by_user_id.get(uid)) for uid in uc_by_user_id}

    attendances = list(
        UserAttendance.objects.filter(
            course=course,
            attendance_date__gte=month_start,
            attendance_date__lte=month_end,
        ).select_related("user")
    )

    dates_union = set(events_by_date.keys())
    for a in attendances:
        if a.attendance_date:
            dates_union.add(a.attendance_date)

    sorted_days = sorted(d for d in dates_union if month_start <= d <= month_end)

    distinct_days_by_user: Dict[int, set] = defaultdict(set)
    duration_by_user_month: Dict[int, int] = defaultdict(int)
    for a in attendances:
        if a.attendance_date:
            distinct_days_by_user[a.user_id].add(a.attendance_date)
            duration_by_user_month[a.user_id] += int(a.duration_seconds or 0)

    teachers_out: List[Dict[str, Any]] = []
    sessions_scheduled = events_in_month
    for uc in teacher_ucs_for_cards:
        uid = uc.user_id
        role = uc.assigned_as_role
        attended = len(distinct_days_by_user.get(uid, set()))
        pct = round(100.0 * attended / sessions_scheduled, 1) if sessions_scheduled else 0.0
        teachers_out.append(
            {
                "user_id": uid,
                "user_name": uc.user.name or "",
                "user_email": uc.user.email or "",
                "assigned_as_role_name": role.name if role else "",
                "sessions_attended": attended,
                "sessions_scheduled": sessions_scheduled,
                "pct": pct,
                "total_duration_seconds": duration_by_user_month.get(uid, 0),
            }
        )

    days_out: List[Dict[str, Any]] = []
    att_by_day = defaultdict(list)
    for a in attendances:
        if a.attendance_date:
            att_by_day[a.attendance_date].append(a)

    for d in sorted_days:
        evs = events_by_date.get(d, [])
        day_atts = att_by_day.get(d, [])
        has_event = len(evs) > 0
        has_att = len(day_atts) > 0
        scheduled_but_not_synced = has_event and not has_att

        intervals: List[Dict[str, Any]] = []
        # Earliest join per user that day → only that row gets vs-class-start lateness.
        first_join_id_by_user: Dict[int, int] = {}
        for a in sorted(day_atts, key=lambda x: (x.join_datetime, x.id)):
            if a.user_id not in first_join_id_by_user:
                first_join_id_by_user[a.user_id] = a.id

        day_atts_sorted = sorted(
            day_atts,
            key=lambda x: (
                user_rank.get(x.user_id, 99),
                x.join_datetime,
                x.id,
            ),
        )
        for a in day_atts_sorted:
            is_first_join_today = first_join_id_by_user.get(a.user_id) == a.id
            if is_first_join_today:
                label, mins = _lateness_for_interval(a.join_datetime, evs, tz)
            else:
                label, mins = None, None
            intervals.append(
                {
                    "id": a.id,
                    "user_id": a.user_id,
                    "user_name": a.user.name or "",
                    "join_datetime": django_tz.localtime(a.join_datetime, tz).isoformat(),
                    "leave_datetime": django_tz.localtime(a.leave_datetime, tz).isoformat(),
                    "duration_seconds": a.duration_seconds,
                    "lateness_label": label,
                    "minutes_delta": mins,
                }
            )

        per_user_duration: Dict[int, int] = defaultdict(int)
        per_user_count: Dict[int, int] = defaultdict(int)
        for a in day_atts:
            per_user_duration[a.user_id] += int(a.duration_seconds or 0)
            per_user_count[a.user_id] += 1

        def _sort_name(uid: int) -> str:
            uc = uc_by_user_id.get(uid)
            if uc:
                return uc.user.name or ""
            for row in day_atts:
                if row.user_id == uid:
                    return row.user.name or ""
            return ""

        per_user_day_totals: List[Dict[str, Any]] = []
        for uid in sorted(
            per_user_duration.keys(),
            key=lambda x: (user_rank.get(x, 99), _sort_name(x), x),
        ):
            per_user_day_totals.append(
                {
                    "user_id": uid,
                    "user_name": _sort_name(uid),
                    "total_duration_seconds": per_user_duration[uid],
                    "interval_count": per_user_count[uid],
                }
            )

        days_out.append(
            {
                "date": d.isoformat(),
                "has_scheduled_event": has_event,
                "has_any_attendance": has_att,
                "scheduled_but_not_synced": scheduled_but_not_synced,
                "intervals": intervals,
                "per_user_day_totals": per_user_day_totals,
            }
        )

    first_ev = course.events.order_by("date").first()
    time_from_s = first_ev.time_from.isoformat() if first_ev else None
    time_to_s = first_ev.time_to.isoformat() if first_ev else None

    return {
        "course": {
            "id": course.id,
            "title": course.title,
            "time_from": time_from_s,
            "time_to": time_to_s,
            "start_date": course.start_date.isoformat() if course.start_date else None,
            "end_date": course.end_date.isoformat() if course.end_date else None,
            "events_total": events_total,
            "events_in_month": events_in_month,
        },
        "teachers": teachers_out,
        "days": days_out,
    }

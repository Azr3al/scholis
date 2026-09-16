"""Set-based SQL for attendance god-view risk rows.

Event recency rank is a per-course property; UserEvent rows are sparse.
This query ranks events once, aggregates marks by student/course, and derives
unregistered counts and absence streaks arithmetically.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any, Optional

from django.db import connection
from django.utils import timezone

from app_attendance.god_view_services import (
    DEFAULT_AT_RISK_THRESHOLD,
    GodViewFilters,
    LATE_HEAVY_RATE_THRESHOLD,
    _date_range_bounds,
    _empty_summary,
)

ORDER_BY_SQL = {
    "attendance_rate_desc": "f.attendance_rate DESC, f.student_id, f.course_id",
    "student_name": "LOWER(COALESCE(u.name, '')), f.course_id",
    "recent_risk": (
        "f.recent_absence_streak DESC, f.absent_last_7_days DESC, "
        "f.attendance_rate, f.student_id, f.course_id"
    ),
}
DEFAULT_ORDER_BY_SQL = (
    "f.attendance_rate, f.recent_absence_streak DESC, "
    "LOWER(COALESCE(u.name, '')), f.course_id"
)

GOD_VIEW_SQL = """
WITH scoped_courses AS (
    SELECT c.id
    FROM app_course_course c
    WHERE TRUE
      {course_predicates}
),
scoped_events AS (
    SELECT
        e.id,
        e.course_id,
        (e.date AT TIME ZONE 'UTC')::date AS event_utc_date,
        ROW_NUMBER() OVER (
            PARTITION BY e.course_id
            ORDER BY e.date DESC, e.time_from DESC, e.id DESC
        ) AS rn
    FROM app_course_event e
    JOIN scoped_courses sc ON sc.id = e.course_id
    WHERE e.date >= %(range_start)s
      AND e.date <= %(range_end)s
),
course_totals AS (
    SELECT
        course_id,
        COUNT(*) AS scheduled,
        COUNT(*) FILTER (
            WHERE event_utc_date BETWEEN %(week_ago)s AND %(today)s
        ) AS recent_window_events
    FROM scoped_events
    GROUP BY course_id
),
roster AS (
    SELECT uc.user_id, uc.course_id
    FROM app_course_usercourse uc
    JOIN course_totals ct ON ct.course_id = uc.course_id
    WHERE uc.assigned_as = 'student'
      AND uc.left_at IS NULL
      {student_predicate}
),
marks AS (
    SELECT
        ue.user_id,
        se.course_id,
        COUNT(*) FILTER (WHERE ue.attendance_status = 'present') AS present_count,
        COUNT(*) FILTER (WHERE ue.attendance_status = 'late') AS late_count,
        COUNT(*) FILTER (
            WHERE ue.attendance_status IN ('absent', 'absent_with_leave')
        ) AS absent_count,
        MIN(se.rn) FILTER (
            WHERE ue.attendance_status IN ('present', 'late')
        ) AS first_attended_rn,
        MAX(ue.attendance_status) FILTER (WHERE se.rn = 1) AS latest_session_status,
        COUNT(*) FILTER (
            WHERE ue.attendance_status IN ('present', 'late')
              AND se.event_utc_date BETWEEN %(week_ago)s AND %(today)s
        ) AS recent_window_attended
    FROM app_attendance_userevent ue
    JOIN scoped_events se ON se.id = ue.event_id
    WHERE ue.is_deleted = FALSE
    GROUP BY ue.user_id, se.course_id
),
pair_rows AS (
    SELECT
        r.user_id AS student_id,
        r.course_id,
        ct.scheduled AS scheduled_classes,
        COALESCE(m.present_count, 0) AS present_count,
        COALESCE(m.late_count, 0) AS late_count,
        COALESCE(m.absent_count, 0) AS absent_count,
        ct.scheduled
            - COALESCE(m.present_count, 0)
            - COALESCE(m.late_count, 0)
            - COALESCE(m.absent_count, 0) AS unregistered_count,
        ct.recent_window_events - COALESCE(m.recent_window_attended, 0)
            AS absent_last_7_days,
        COALESCE(m.first_attended_rn - 1, ct.scheduled) AS recent_absence_streak,
        COALESCE(m.latest_session_status, 'unregistered') AS last_class_status,
        m.first_attended_rn,
        ROUND(
            (COALESCE(m.present_count, 0) + COALESCE(m.late_count, 0))::numeric
                * 100 / ct.scheduled,
            2
        ) AS attendance_rate,
        ROUND(COALESCE(m.absent_count, 0)::numeric * 100 / ct.scheduled, 2)
            AS absence_rate,
        ROUND(COALESCE(m.late_count, 0)::numeric * 100 / ct.scheduled, 2)
            AS late_rate
    FROM roster r
    JOIN course_totals ct ON ct.course_id = r.course_id
    LEFT JOIN marks m
           ON m.user_id = r.user_id
          AND m.course_id = r.course_id
),
filtered AS (
    SELECT * FROM pair_rows
    WHERE TRUE
      {rate_predicates}
),
pair_page AS (
    SELECT
        f.student_id,
        f.course_id,
        f.scheduled_classes,
        f.present_count,
        f.late_count,
        f.absent_count,
        f.unregistered_count,
        f.absent_last_7_days,
        f.recent_absence_streak,
        f.last_class_status,
        f.attendance_rate,
        f.absence_rate,
        f.late_rate,
        (f.attendance_rate < %(at_risk_threshold)s) AS is_at_risk,
        (f.late_rate >= %(late_heavy_threshold)s) AS is_late_heavy,
        la.event_utc_date AS last_attended_date,
        COALESCE(u.name, '') AS student_name,
        COALESCE(u.email, '') AS student_email,
        COALESCE(u.phone_number, '') AS student_phone,
        c.title AS course_title,
        COALESCE(c.code, '') AS course_code,
        c.category_id,
        COALESCE(cat.name, '') AS category_name,
        c.program_id,
        COALESCE(prog.name, '') AS program_name
    FROM filtered f
    JOIN app_auth_user u ON u.id = f.student_id
    JOIN app_course_course c ON c.id = f.course_id
    LEFT JOIN app_course_category cat ON cat.id = c.category_id
    LEFT JOIN app_course_program prog ON prog.id = c.program_id
    LEFT JOIN scoped_events la
           ON la.course_id = f.course_id
          AND la.rn = f.first_attended_rn
    ORDER BY {order_by}
    {limit_clause}
),
summary AS (
    SELECT
        COUNT(*)::bigint AS total_pairs,
        COALESCE(SUM(scheduled_classes), 0)::bigint AS total_scheduled,
        COALESCE(SUM(present_count + late_count), 0)::bigint AS total_attended,
        COALESCE(SUM(absent_last_7_days), 0)::bigint AS total_absent_last_7,
        COUNT(*) FILTER (
            WHERE attendance_rate < %(at_risk_threshold)s
        )::bigint AS at_risk_count,
        COUNT(*) FILTER (
            WHERE late_rate >= %(late_heavy_threshold)s
        )::bigint AS late_heavy_count
    FROM filtered
)
SELECT
    p.student_id,
    p.course_id,
    p.scheduled_classes,
    p.present_count,
    p.late_count,
    p.absent_count,
    p.unregistered_count,
    p.absent_last_7_days,
    p.recent_absence_streak,
    p.last_class_status,
    p.attendance_rate,
    p.absence_rate,
    p.late_rate,
    p.is_at_risk,
    p.is_late_heavy,
    p.last_attended_date,
    p.student_name,
    p.student_email,
    p.student_phone,
    p.course_title,
    p.course_code,
    p.category_id,
    p.category_name,
    p.program_id,
    p.program_name,
    s.total_pairs,
    s.total_scheduled,
    s.total_attended,
    s.total_absent_last_7,
    s.at_risk_count,
    s.late_heavy_count
FROM summary s
LEFT JOIN pair_page p ON TRUE
"""


def _order_by_sql(sort: str) -> str:
    return ORDER_BY_SQL.get(sort, DEFAULT_ORDER_BY_SQL)


def _compose_predicates(filters: GodViewFilters) -> tuple[str, str, str, dict[str, Any]]:
    params: dict[str, Any] = {}
    course_parts: list[str] = []

    if filters.course_id is not None:
        course_parts.append("AND c.id = %(course_id)s")
        params["course_id"] = filters.course_id

    if filters.category_ids is not None:
        course_parts.append("AND c.category_id = ANY(%(category_ids)s)")
        params["category_ids"] = list(filters.category_ids)
    elif filters.category_id is not None:
        course_parts.append("AND c.category_id = %(category_id)s")
        params["category_id"] = filters.category_id

    for field in ("program_id", "intake_id", "level_id", "section_id", "campus_id"):
        value = getattr(filters, field)
        if value is not None:
            course_parts.append(f"AND c.{field} = %({field})s")
            params[field] = value

    if filters.teacher_id is not None:
        # Related-join uses UserCourse.including_ended (no left_at filter).
        course_parts.append(
            "AND EXISTS ("
            " SELECT 1 FROM app_course_usercourse tuc"
            " WHERE tuc.course_id = c.id"
            " AND tuc.assigned_as = 'teacher'"
            " AND tuc.user_id = %(teacher_id)s"
            ")"
        )
        params["teacher_id"] = filters.teacher_id

    student_predicate = ""
    if filters.student_id is not None:
        student_predicate = "AND uc.user_id = %(student_id)s"
        params["student_id"] = filters.student_id

    rate_parts: list[str] = []
    if filters.min_attendance_rate is not None:
        rate_parts.append("AND attendance_rate >= %(min_rate)s")
        params["min_rate"] = filters.min_attendance_rate
    if filters.max_attendance_rate is not None:
        rate_parts.append("AND attendance_rate <= %(max_rate)s")
        params["max_rate"] = filters.max_attendance_rate

    return (
        "\n      ".join(course_parts),
        student_predicate,
        "\n      ".join(rate_parts),
        params,
    )


def _isoformat_date(value) -> Optional[str]:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)[:10]


def _row_from_sql(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "student_id": raw["student_id"],
        "course_id": raw["course_id"],
        "attendance_rate": float(raw["attendance_rate"]),
        "absence_rate": float(raw["absence_rate"]),
        "late_rate": float(raw["late_rate"]),
        "present_count": int(raw["present_count"]),
        "late_count": int(raw["late_count"]),
        "absent_count": int(raw["absent_count"]),
        "unregistered_count": int(raw["unregistered_count"]),
        "scheduled_classes": int(raw["scheduled_classes"]),
        "recent_absence_streak": int(raw["recent_absence_streak"]),
        "last_attended_date": _isoformat_date(raw["last_attended_date"]),
        "last_class_status": raw["last_class_status"],
        "absent_last_7_days": int(raw["absent_last_7_days"]),
        "is_at_risk": bool(raw["is_at_risk"]),
        "is_late_heavy": bool(raw["is_late_heavy"]),
        "student_name": raw["student_name"] or "",
        "student_email": raw["student_email"] or "",
        "student_phone": raw["student_phone"] or "",
        "course_title": raw["course_title"] or "",
        "course_code": raw["course_code"] or "",
        "category_id": raw["category_id"],
        "category_name": raw["category_name"] or "",
        "program_id": raw["program_id"],
        "program_name": raw["program_name"] or "",
    }


def _summary_from_sql(raw: dict[str, Any], filters: GodViewFilters) -> dict[str, Any]:
    total_scheduled = int(raw["total_scheduled"] or 0)
    total_attended = int(raw["total_attended"] or 0)
    avg_rate = (
        round((total_attended / total_scheduled) * 100, 2) if total_scheduled else 0.0
    )
    return {
        "average_attendance_rate": avg_rate,
        "at_risk_count": int(raw["at_risk_count"] or 0),
        "absent_last_7_days_total": int(raw["total_absent_last_7"] or 0),
        "late_heavy_count": int(raw["late_heavy_count"] or 0),
        "total_student_course_pairs": int(raw["total_pairs"] or 0),
        "date_from": filters.date_from.isoformat(),
        "date_to": filters.date_to.isoformat(),
        "at_risk_threshold": filters.at_risk_threshold,
    }


def fetch_god_view_page(
    filters: GodViewFilters,
    *,
    limit: Optional[int] = None,
    offset: int = 0,
) -> tuple[dict[str, Any], list[dict[str, Any]], int]:
    """Return (summary, rows, total_count). Summary is over the full filtered set."""
    if filters.category_ids is not None and len(filters.category_ids) == 0:
        empty = _empty_summary(filters)
        return empty, [], 0

    course_predicates, student_predicate, rate_predicates, extra_params = (
        _compose_predicates(filters)
    )
    start_dt, end_dt = _date_range_bounds(filters)
    today = timezone.localdate()
    params: dict[str, Any] = {
        "range_start": start_dt,
        "range_end": end_dt,
        "week_ago": today - timedelta(days=7),
        "today": today,
        "at_risk_threshold": filters.at_risk_threshold or DEFAULT_AT_RISK_THRESHOLD,
        "late_heavy_threshold": LATE_HEAVY_RATE_THRESHOLD,
        **extra_params,
    }

    if limit is None:
        limit_clause = ""
    else:
        limit_clause = "LIMIT %(limit)s OFFSET %(offset)s"
        params["limit"] = int(limit)
        params["offset"] = max(0, int(offset))

    sql = GOD_VIEW_SQL.format(
        course_predicates=course_predicates,
        student_predicate=student_predicate,
        rate_predicates=rate_predicates,
        order_by=_order_by_sql(filters.sort),
        limit_clause=limit_clause,
    )

    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        columns = [col[0] for col in cursor.description]
        raw_rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    if not raw_rows:
        empty = _empty_summary(filters)
        return empty, [], 0

    summary = _summary_from_sql(raw_rows[0], filters)
    rows = [
        _row_from_sql(raw) for raw in raw_rows if raw.get("student_id") is not None
    ]
    return summary, rows, summary["total_student_course_pairs"]

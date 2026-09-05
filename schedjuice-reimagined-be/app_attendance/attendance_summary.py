"""Course attendance summary: per-student monthly + whole-course percentages."""

from __future__ import annotations

from calendar import month_name
from collections import defaultdict
from datetime import date, datetime
from typing import Any

from django.db.models import Count, Q

from app_attendance.models import UserEvent
from app_attendance.removed_students import get_removed_course_student_ids
from app_auth.models import User
from app_course.models import Course, Event, UserCourse

ATTENDED_STATUSES = {
    UserEvent.AttendanceStatus.PRESENT,
    UserEvent.AttendanceStatus.LATE,
}


def count_attended(statuses: list[str]) -> int:
    return sum(1 for s in statuses if s in ATTENDED_STATUSES)


def attendance_pct(attended: int, total: int) -> float:
    if total == 0:
        return 0.0
    return round((attended / total) * 100, 2)


def _attendance_counts(attended: int, total: int) -> dict[str, Any]:
    return {
        "attended": attended,
        "total": total,
        "pct": attendance_pct(attended, total),
    }


def month_anchors_from_course(course: Course) -> list[str]:
    """Return YYYY-MM-01 anchors from course start through end (inclusive)."""
    if not course.start_date or not course.end_date:
        return []
    start = course.start_date
    end = course.end_date
    if isinstance(start, datetime):
        start = start.date()
    if isinstance(end, datetime):
        end = end.date()

    anchors: list[str] = []
    cursor = date(start.year, start.month, 1)
    last = date(end.year, end.month, 1)
    while cursor <= last:
        anchors.append(f"{cursor.year:04d}-{cursor.month:02d}-01")
        if cursor.month == 12:
            cursor = date(cursor.year + 1, 1, 1)
        else:
            cursor = date(cursor.year, cursor.month + 1, 1)
    return anchors


def _month_label(year: int, month: int) -> str:
    return f"{month_name[month]} {year}"


def _parse_anchor(anchor: str) -> tuple[int, int]:
    parts = anchor.split("-")
    return int(parts[0]), int(parts[1])


def list_course_students_for_attendance(
    course_id: int,
    *,
    include_removed: bool = False,
) -> list[dict[str, Any]]:
    active_qs = (
        User.objects.filter(
            roles__contains="{student}",
            user_courses__course_id=course_id,
            user_courses__assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        .order_by("name")
        .distinct()
    )
    students = [
        {"id": u.id, "name": u.name, "is_removed": False} for u in active_qs
    ]
    if not include_removed:
        return students

    removed_ids = get_removed_course_student_ids(course_id)
    if not removed_ids:
        return students

    active_ids = {s["id"] for s in students}
    removed_users = User.objects.filter(id__in=removed_ids - active_ids).order_by(
        "name"
    )
    students.extend(
        {"id": u.id, "name": u.name, "is_removed": True} for u in removed_users
    )
    return students


def build_course_attendance_summary(
    course_id: int,
    course: Course | None = None,
    *,
    include_removed: bool = False,
) -> dict:
    if course is None:
        course = Course.objects.filter(id=course_id).first()
    if course is None:
        return {"months": [], "students": [], "class_aggregate": {"by_month": {}, "course": _attendance_counts(0, 0)}}

    anchors = month_anchors_from_course(course)
    students = list_course_students_for_attendance(
        course_id, include_removed=include_removed
    )
    if not students or not anchors:
        return {
            "months": [],
            "students": [],
            "class_aggregate": {"by_month": {}, "course": _attendance_counts(0, 0)},
        }

    student_ids = [s["id"] for s in students]

    # Session counts per calendar month
    session_counts: dict[str, int] = {a: 0 for a in anchors}
    event_rows = (
        Event.objects.filter(course_id=course_id)
        .values("date__year", "date__month")
        .annotate(count=Count("id"))
    )
    for row in event_rows:
        anchor = f"{row['date__year']:04d}-{row['date__month']:02d}-01"
        if anchor in session_counts:
            session_counts[anchor] = row["count"]

    months_meta = []
    for anchor in anchors:
        year, month = _parse_anchor(anchor)
        months_meta.append(
            {
                "anchor": anchor,
                "label": _month_label(year, month),
                "session_count": session_counts[anchor],
            }
        )

    # Attended counts per (user, month) from existing UserEvent rows
    attended_by_user_month: dict[tuple[int, str], int] = defaultdict(int)
    ue_rows = (
        UserEvent.objects.filter(
            event__course_id=course_id,
            user_id__in=student_ids,
            attendance_status__in=ATTENDED_STATUSES,
        )
        .values("user_id", "event__date__year", "event__date__month")
        .annotate(count=Count("id"))
    )
    for row in ue_rows:
        anchor = f"{row['event__date__year']:04d}-{row['event__date__month']:02d}-01"
        if anchor in session_counts:
            attended_by_user_month[(row["user_id"], anchor)] = row["count"]

    student_rows = []
    class_by_month: dict[str, dict[str, Any]] = {
        a: _attendance_counts(0, session_counts[a] * len(students)) for a in anchors
    }
    course_attended = 0
    course_total = 0

    for student in students:
        sid = student["id"]
        by_month: dict[str, dict[str, Any]] = {}
        student_course_attended = 0
        student_course_total = 0

        for anchor in anchors:
            total = session_counts[anchor]
            attended = attended_by_user_month.get((sid, anchor), 0)
            by_month[anchor] = _attendance_counts(attended, total)
            student_course_attended += attended
            student_course_total += total

            agg = class_by_month[anchor]
            agg["attended"] += attended

        student_rows.append(
            {
                "id": sid,
                "name": student["name"],
                "is_removed": student.get("is_removed", False),
                "by_month": by_month,
                "course": _attendance_counts(student_course_attended, student_course_total),
            }
        )
        course_attended += student_course_attended
        course_total += student_course_total

    for anchor in anchors:
        agg = class_by_month[anchor]
        agg["pct"] = attendance_pct(agg["attended"], agg["total"])

    return {
        "months": months_meta,
        "students": student_rows,
        "class_aggregate": {
            "by_month": class_by_month,
            "course": _attendance_counts(course_attended, course_total),
        },
    }


def build_monthly_attendance_matrix(
    course_id: int,
    *,
    year: int | None = None,
    month: int | None = None,
    all_months: bool = False,
    include_removed: bool = False,
) -> list[list] | None:
    """
    Build 2D string matrix for MonthlyAttendanceView.
    Returns None when no sessions or no students.
    """
    session_filter = Q(course_id=course_id)
    if not all_months and year is not None and month is not None:
        session_filter &= Q(date__year=year, date__month=month)

    total_attendance_count = Event.objects.filter(session_filter).count()
    if total_attendance_count == 0:
        return None

    monthly_events = Event.objects.filter(session_filter).order_by("date").all()
    monthly_attendances = (
        UserEvent.objects.filter(event__course_id=course_id)
        .prefetch_related("user", "event")
    )
    if not all_months and year is not None and month is not None:
        monthly_attendances = monthly_attendances.filter(
            event__date__year=year, event__date__month=month
        )
    monthly_attendances = monthly_attendances.all()

    students = list_course_students_for_attendance(
        course_id, include_removed=include_removed
    )
    if not students:
        return None

    attendance_lookup: dict[tuple[int, int], str] = {
        (a.user_id, a.event_id): a.attendance_status for a in monthly_attendances
    }

    table: list[list] = [
        [
            "Student Name",
            "Total Attendance",
            "Attendance Percentage",
            *[e.date for e in monthly_events],
        ]
    ]

    for student in students:
        sid = student["id"]
        statuses = []
        for event in monthly_events:
            statuses.append(
                attendance_lookup.get(
                    (sid, event.id),
                    UserEvent.AttendanceStatus.UNREGISTERED,
                )
            )
        total_attendance = count_attended(statuses)
        row = [
            student["name"],
            total_attendance,
            attendance_pct(total_attendance, total_attendance_count),
            *statuses,
        ]
        table.append(row)

    return table

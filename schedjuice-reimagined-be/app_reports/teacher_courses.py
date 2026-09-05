from __future__ import annotations

import datetime
import io
from datetime import timezone as dt_timezone
from zoneinfo import ZoneInfo

import xlsxwriter
from django.http import HttpResponse
from django.utils import timezone

from app_course.course_month_type import month_type_for_course
from app_course.models import AssignedAsRole, UserCourse
from app_reports.analytics_services import _tz_for_tenant
from app_reports.services import create_formats, get_course_type

_MT_AT_SENIORITY = (
    AssignedAsRole.Seniority.MAIN_TEACHER,
    AssignedAsRole.Seniority.ASSISTANT_TEACHER,
)
_ROLE_CODE = {
    AssignedAsRole.Seniority.MAIN_TEACHER: "MT",
    AssignedAsRole.Seniority.ASSISTANT_TEACHER: "AT",
}

TC_COLUMNS: list[tuple[str, str, float]] = [
    ("name", "Name", 25),
    ("email", "Email", 28),
    ("assigned_classes", "Assigned Classes", 40),
    ("course_type", "Type", 12),
    ("duration", "Duration", 14),
]


def teacher_courses_columns_meta() -> list[dict]:
    return [
        {"key": key, "title": title, "width": width}
        for key, title, width in TC_COLUMNS
    ]


def _aware_utc(dt: datetime.datetime) -> datetime.datetime:
    if timezone.is_naive(dt):
        return dt.replace(tzinfo=dt_timezone.utc)
    return dt


def _local_date(dt: datetime.datetime | None, tz: ZoneInfo) -> datetime.date | None:
    if dt is None:
        return None
    return _aware_utc(dt).astimezone(tz).date()


def assignment_overlaps_local_dates(
    joined_at,
    left_at,
    date_from: datetime.date,
    date_to: datetime.date,
    tz: ZoneInfo,
) -> bool:
    joined_local = _local_date(joined_at, tz)
    if joined_local is None or joined_local > date_to:
        return False
    left_local = _local_date(left_at, tz)
    return left_local is None or left_local >= date_from


def _first_event(course):
    events = list(course.events.all())
    if not events:
        return None
    return min(events, key=lambda event: (event.date, event.time_from))


def format_class_duration(time_from, time_to) -> str:
    start = datetime.datetime.combine(datetime.date.min, time_from)
    end = datetime.datetime.combine(datetime.date.min, time_to)
    minutes = int((end - start).total_seconds() // 60)
    if minutes <= 0:
        return "—"
    hours, remainder = divmod(minutes, 60)
    if hours and remainder:
        return f"{hours}h {remainder}m"
    if hours:
        return f"{hours}h"
    return f"{remainder}m"


def duration_for_course(course) -> str:
    first = _first_event(course)
    if first is None:
        return "—"
    return format_class_duration(first.time_from, first.time_to)


def format_assigned_class_line(course, role_code: str) -> str:
    return f"{course.title} ({role_code}) {month_type_for_course(course)}"


def teacher_courses_rows(date_from, date_to, *, org) -> list[dict]:
    tz = _tz_for_tenant(org)
    assignments = (
        UserCourse.including_ended.filter(
            assigned_as=UserCourse.AssignedAs.TEACHER,
            assigned_as_role__seniority__in=_MT_AT_SENIORITY,
        )
        .select_related("user", "course", "assigned_as_role")
        .prefetch_related("course__events")
        .order_by("user__name", "course__title", "id")
    )
    seen: set[tuple[int, int]] = set()
    rows = []
    for uc in assignments:
        if not assignment_overlaps_local_dates(
            uc.joined_at, uc.left_at, date_from, date_to, tz
        ):
            continue
        role = uc.assigned_as_role
        role_code = _ROLE_CODE.get(role.seniority if role else None)
        if not role_code:
            continue
        key = (uc.user_id, uc.course_id)
        if key in seen:
            continue
        seen.add(key)
        label = format_assigned_class_line(uc.course, role_code)
        rows.append(
            {
                "name": uc.user.name,
                "email": uc.user.email,
                "user_id": uc.user_id,
                "course_id": uc.course_id,
                "assigned_classes": label,
                "course_type": get_course_type(uc.course),
                "duration": duration_for_course(uc.course),
                "courses": [{"id": uc.course_id, "title": label}],
            }
        )
    return rows


def get_teacher_courses_xlsx(date_from, date_to, *, org) -> HttpResponse:
    rows = teacher_courses_rows(date_from, date_to, org=org)
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {"in_memory": True})
    fmts = create_formats(workbook)
    ws = workbook.add_worksheet("Teacher Courses")
    for col_index, (_, _header, width) in enumerate(TC_COLUMNS):
        ws.set_column(col_index, col_index, width)
    for col_index, (_, header, _width) in enumerate(TC_COLUMNS):
        ws.write(0, col_index, header, fmts["header"])
    ws.freeze_panes(1, 0)
    for row_index, row in enumerate(rows, start=1):
        for col_index, (key, _header, _width) in enumerate(TC_COLUMNS):
            ws.write(row_index, col_index, row.get(key, ""), fmts["cell"])
    workbook.close()
    output.seek(0)
    filename = (
        f"teacher_courses_{date_from.isoformat()}_{date_to.isoformat()}.xlsx"
    )
    response = HttpResponse(
        output,
        content_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response

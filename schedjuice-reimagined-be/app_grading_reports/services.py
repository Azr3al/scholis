from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from django.utils import timezone

from app_attendance.models import UserEvent
from app_course.models import Event, UserCourse
from app_grading_reports.constants import DEFAULT_GRADING_BANDS
from app_grading_reports.models import (
    GradingScale,
    MonthlyReport,
    MonthlyReportBatch,
    MonthlyResultSheet,
    ResultCell,
    ResultColumn,
)


def resolve_grading_scale(course) -> list:
    override = GradingScale.objects.filter(course=course).first()
    if override and override.bands:
        return override.bands
    tenant_default = GradingScale.objects.filter(course__isnull=True).first()
    if tenant_default and tenant_default.bands:
        return tenant_default.bands
    return DEFAULT_GRADING_BANDS


def compute_grade(marks: int, max_marks: int, bands: list) -> dict:
    if max_marks <= 0:
        return {"pct": 0.0, "grade": bands[-1]["label"]}
    pct = float(
        (Decimal(marks) / Decimal(max_marks) * Decimal(100)).quantize(
            Decimal("0.1"), rounding=ROUND_HALF_UP
        )
    )
    grade = bands[-1]["label"]
    for band in bands:
        if band["min_pct"] <= pct <= band["max_pct"]:
            grade = band["label"]
            break
    return {"pct": pct, "grade": grade}


def validate_bands(bands: list) -> None:
    if not bands:
        raise ValueError("bands cannot be empty")
    sorted_bands = sorted(bands, key=lambda b: b["min_pct"])
    if sorted_bands[0]["min_pct"] != 0:
        raise ValueError("bands must start at 0")
    if sorted_bands[-1]["max_pct"] != 100:
        raise ValueError("bands must end at 100")
    for i, band in enumerate(sorted_bands):
        if band["min_pct"] > band["max_pct"]:
            raise ValueError("invalid band range")
        if i > 0 and sorted_bands[i - 1]["max_pct"] + 1 != band["min_pct"]:
            raise ValueError("bands must be contiguous")


def get_monthly_attendance_summaries(
    course_id: int, year: int, month: int, student_ids: list[int]
) -> dict:
    total_days = Event.objects.filter(
        course_id=course_id, date__year=year, date__month=month
    ).count()
    if total_days == 0:
        return {
            sid: {"total_days": 0, "attended": 0, "absent": 0, "pct": 0.0}
            for sid in student_ids
        }
    present_statuses = {
        UserEvent.AttendanceStatus.PRESENT,
        UserEvent.AttendanceStatus.LATE,
    }
    result = {}
    for sid in student_ids:
        attended = UserEvent.objects.filter(
            user_id=sid,
            event__course_id=course_id,
            event__date__year=year,
            event__date__month=month,
            attendance_status__in=present_statuses,
        ).count()
        absent = max(total_days - attended, 0)
        pct = round((attended / total_days) * 100, 1) if total_days else 0.0
        result[sid] = {
            "total_days": total_days,
            "attended": attended,
            "absent": absent,
            "pct": pct,
        }
    return result


def active_course_student_ids(course_id: int) -> list[int]:
    return list(
        UserCourse.objects.filter(
            course_id=course_id,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        ).values_list("user_id", flat=True)
    )


def course_roster_students(course_id: int) -> list[dict]:
    rows = (
        UserCourse.objects.filter(
            course_id=course_id,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        .select_related("user")
        .order_by("user__name", "user_id")
    )
    return [
        {
            "id": uc.user_id,
            "name": uc.user.name,
            "code": uc.user.code,
            "alternative_name": uc.user.alternative_name or "",
            "communication_email": uc.user.communication_email or "",
        }
        for uc in rows
    ]


def build_report_batch(
    *,
    course,
    sheet: MonthlyResultSheet,
    column_ids: list[int],
    project_templates: list[dict],
    actor,
) -> MonthlyReportBatch:
    columns = list(
        ResultColumn.objects.filter(
            sheet=sheet, id__in=column_ids, is_named_test=True
        ).order_by("sort_order", "id")
    )
    if not columns:
        raise ValueError("At least one named test column required")

    selected_sources = [
        {
            "source_type": "external_column",
            "column_id": col.id,
            "title": col.title,
            "max_marks": col.max_marks,
        }
        for col in columns
    ]
    batch = MonthlyReportBatch.objects.create(
        course=course,
        sheet=sheet,
        report_year=sheet.year,
        report_month=sheet.month,
        selected_sources=selected_sources,
        project_templates=project_templates,
        created_by=actor,
    )

    cells = ResultCell.objects.filter(column_id__in=[c.id for c in columns])
    cell_map = {(c.column_id, c.student_id): c.marks for c in cells}
    bands = resolve_grading_scale(course)
    student_ids = active_course_student_ids(course.id)
    attendance_map = get_monthly_attendance_summaries(
        course.id, sheet.year, sheet.month, student_ids
    )
    project_ratings = [
        {"title": p["title"], "done": False, "rating": None}
        for p in project_templates
    ]

    reports = []
    for sid in student_ids:
        test_lines = []
        total_marks = 0
        total_max = 0
        for col in columns:
            marks = cell_map.get((col.id, sid))
            if marks is None:
                continue
            graded = compute_grade(marks, col.max_marks, bands)
            test_lines.append(
                {
                    "title": col.title,
                    "marks": marks,
                    "max_marks": col.max_marks,
                    "pct": graded["pct"],
                    "grade": graded["grade"],
                }
            )
            total_marks += marks
            total_max += col.max_marks
        overall = {
            "total_marks": 0,
            "total_max": 0,
            "pct": 0.0,
            "grade": bands[-1]["label"],
        }
        if total_max > 0:
            overall_graded = compute_grade(total_marks, total_max, bands)
            overall = {
                "total_marks": total_marks,
                "total_max": total_max,
                "pct": overall_graded["pct"],
                "grade": overall_graded["grade"],
            }
        reports.append(
            MonthlyReport(
                batch=batch,
                student_id=sid,
                attendance=attendance_map.get(
                    sid, {"total_days": 0, "attended": 0, "absent": 0, "pct": 0.0}
                ),
                test_lines=test_lines,
                overall=overall,
                project_ratings=list(project_ratings),
            )
        )
    MonthlyReport.objects.bulk_create(reports)
    return batch


def rebuild_batch_reports(batch: MonthlyReportBatch) -> MonthlyReportBatch:
    if batch.reports.filter(status=MonthlyReport.Status.FINALIZED).exists():
        raise ValueError("Cannot regenerate while finalized reports exist.")
    column_ids = [
        s["column_id"]
        for s in batch.selected_sources
        if s.get("source_type") == "external_column"
    ]
    batch.reports.filter(status=MonthlyReport.Status.DRAFT).delete()
    columns = list(
        ResultColumn.objects.filter(
            sheet=batch.sheet, id__in=column_ids, is_named_test=True
        ).order_by("sort_order", "id")
    )
    cells = ResultCell.objects.filter(column_id__in=[c.id for c in columns])
    cell_map = {(c.column_id, c.student_id): c.marks for c in cells}
    bands = resolve_grading_scale(batch.course)
    student_ids = active_course_student_ids(batch.course_id)
    attendance_map = get_monthly_attendance_summaries(
        batch.course_id, batch.report_year, batch.report_month, student_ids
    )
    project_ratings = [
        {"title": p["title"], "done": False, "rating": None}
        for p in batch.project_templates
    ]
    reports = []
    for sid in student_ids:
        test_lines = []
        total_marks = 0
        total_max = 0
        for col in columns:
            marks = cell_map.get((col.id, sid))
            if marks is None:
                continue
            graded = compute_grade(marks, col.max_marks, bands)
            test_lines.append(
                {
                    "title": col.title,
                    "marks": marks,
                    "max_marks": col.max_marks,
                    "pct": graded["pct"],
                    "grade": graded["grade"],
                }
            )
            total_marks += marks
            total_max += col.max_marks
        overall = {
            "total_marks": 0,
            "total_max": 0,
            "pct": 0.0,
            "grade": bands[-1]["label"],
        }
        if total_max > 0:
            overall_graded = compute_grade(total_marks, total_max, bands)
            overall = {
                "total_marks": total_marks,
                "total_max": total_max,
                "pct": overall_graded["pct"],
                "grade": overall_graded["grade"],
            }
        reports.append(
            MonthlyReport(
                batch=batch,
                student_id=sid,
                attendance=attendance_map.get(
                    sid, {"total_days": 0, "attended": 0, "absent": 0, "pct": 0.0}
                ),
                test_lines=test_lines,
                overall=overall,
                project_ratings=list(project_ratings),
            )
        )
    MonthlyReport.objects.bulk_create(reports)
    return batch


def finalize_report(report: MonthlyReport, actor) -> MonthlyReport:
    if report.status == MonthlyReport.Status.FINALIZED:
        raise ValueError("Report is already finalized.")
    report.status = MonthlyReport.Status.FINALIZED
    report.finalized_at = timezone.now()
    report.finalized_by = actor
    report.save(
        update_fields=["status", "finalized_at", "finalized_by", "updated_at"]
    )
    return report


def get_tenant_grading_scale() -> GradingScale | None:
    return GradingScale.objects.filter(course__isnull=True).first()


def upsert_tenant_grading_scale(bands: list) -> GradingScale:
    validate_bands(bands)
    scale = get_tenant_grading_scale()
    if scale is None:
        return GradingScale.objects.create(course=None, bands=bands)
    scale.bands = bands
    scale.save(update_fields=["bands", "updated_at"])
    return scale


def upsert_course_grading_scale(course, bands: list) -> GradingScale:
    validate_bands(bands)
    scale, _created = GradingScale.objects.update_or_create(
        course=course, defaults={"bands": bands}
    )
    return scale

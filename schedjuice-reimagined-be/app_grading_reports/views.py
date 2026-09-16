from __future__ import annotations

from django.db import IntegrityError, transaction

from app_course.course_scoping import acting_user, check_course_read
from app_course.models import Course
from app_grading_reports import models, serializers, services
from app_grading_reports.constants import DEFAULT_GRADING_BANDS
from app_rbac.views import RBACView
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication

_AUTH = [TenantBoundJWTStatelessAuthentication]


def _get_course(course_id: int) -> Course | None:
    return Course.objects.filter(pk=course_id).first()


def _get_sheet(sheet_id: int) -> models.MonthlyResultSheet | None:
    return models.MonthlyResultSheet.objects.filter(pk=sheet_id).first()


class TenantGradingScaleView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"GET": "grade.manage", "PUT": "grade.manage"}

    def get(self, request):
        scale = services.get_tenant_grading_scale()
        if scale is None:
            return self.send_response(
                False,
                "success",
                {"data": {"bands": DEFAULT_GRADING_BANDS}},
            )
        return self.send_response(
            False,
            "success",
            {"data": serializers.GradingScaleSerializer(scale).data},
        )

    def put(self, request):
        bands = request.data.get("bands")
        if not isinstance(bands, list):
            return self.bad_request("bands must be a list.")
        try:
            scale = services.upsert_tenant_grading_scale(bands)
        except ValueError as exc:
            return self.bad_request(str(exc))
        return self.send_response(
            False,
            "success",
            {"data": serializers.GradingScaleSerializer(scale).data},
        )


class CourseGradingScaleView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {
        "GET": "grade.manage",
        "PUT": "grade.manage",
        "DELETE": "grade.manage",
    }

    def get(self, request, course_id: int):
        course = _get_course(course_id)
        if course is None:
            return self.not_found("Course not found.")
        user = acting_user(request)
        try:
            check_course_read(user, course)
        except Exception:
            return self.forbidden("Not allowed for this course.")
        scale = models.GradingScale.objects.filter(course=course).first()
        if scale is None:
            return self.send_response(False, "success", {"data": None})
        return self.send_response(
            False,
            "success",
            {"data": serializers.GradingScaleSerializer(scale).data},
        )

    def put(self, request, course_id: int):
        course = _get_course(course_id)
        if course is None:
            return self.not_found("Course not found.")
        user = acting_user(request)
        try:
            check_course_read(user, course)
        except Exception:
            return self.forbidden("Not allowed for this course.")
        bands = request.data.get("bands")
        if not isinstance(bands, list):
            return self.bad_request("bands must be a list.")
        try:
            scale = services.upsert_course_grading_scale(course, bands)
        except ValueError as exc:
            return self.bad_request(str(exc))
        return self.send_response(
            False,
            "success",
            {"data": serializers.GradingScaleSerializer(scale).data},
        )

    def delete(self, request, course_id: int):
        course = _get_course(course_id)
        if course is None:
            return self.not_found("Course not found.")
        models.GradingScale.objects.filter(course=course).delete()
        return self.send_response(False, "success", {"data": None})


class CourseGradingScaleResolvedView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"GET": ["grade.manage", "grade.view_all"]}

    def get(self, request, course_id: int):
        course = _get_course(course_id)
        if course is None:
            return self.not_found("Course not found.")
        user = acting_user(request)
        try:
            check_course_read(user, course)
        except Exception:
            return self.forbidden("Not allowed for this course.")
        return self.send_response(
            False,
            "success",
            {"data": {"bands": services.resolve_grading_scale(course)}},
        )


class CourseResultSheetListView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {
        "GET": ["grade.manage", "grade.view_all"],
        "POST": "grade.manage",
    }

    def get(self, request, course_id: int):
        course = _get_course(course_id)
        if course is None:
            return self.not_found("Course not found.")
        user = acting_user(request)
        try:
            check_course_read(user, course)
        except Exception:
            return self.forbidden("Not allowed for this course.")
        sheets = models.MonthlyResultSheet.objects.filter(course=course).prefetch_related(
            "columns"
        )
        data = serializers.MonthlyResultSheetSerializer(sheets, many=True).data
        return self.send_response(False, "success", {"data": data})

    def post(self, request, course_id: int):
        course = _get_course(course_id)
        if course is None:
            return self.not_found("Course not found.")
        user = acting_user(request)
        try:
            check_course_read(user, course)
        except Exception:
            return self.forbidden("Not allowed for this course.")
        payload = {
            "course": course.id,
            "year": request.data.get("year"),
            "month": request.data.get("month"),
            "exam_date": request.data.get("exam_date"),
        }
        ser = serializers.MonthlyResultSheetSerializer(data=payload)
        if not ser.is_valid():
            return self.bad_request(ser.errors)
        try:
            sheet = ser.save(created_by=user)
        except IntegrityError:
            return self.bad_request(
                "A result sheet already exists for this course and month."
            )
        return self.send_response(
            False,
            "created",
            {"data": serializers.MonthlyResultSheetSerializer(sheet).data},
            status=201,
        )


class ResultSheetDetailView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {
        "GET": ["grade.manage", "grade.view_all"],
        "PATCH": "grade.manage",
    }

    def get(self, request, sheet_id: int):
        sheet = _get_sheet(sheet_id)
        if sheet is None:
            return self.not_found("Sheet not found.")
        user = acting_user(request)
        try:
            check_course_read(user, sheet.course)
        except Exception:
            return self.forbidden("Not allowed for this course.")
        return self.send_response(
            False,
            "success",
            {"data": serializers.MonthlyResultSheetSerializer(sheet).data},
        )

    def patch(self, request, sheet_id: int):
        sheet = _get_sheet(sheet_id)
        if sheet is None:
            return self.not_found("Sheet not found.")
        user = acting_user(request)
        try:
            check_course_read(user, sheet.course)
        except Exception:
            return self.forbidden("Not allowed for this course.")
        ser = serializers.MonthlyResultSheetSerializer(
            sheet, data=request.data, partial=True
        )
        if not ser.is_valid():
            return self.bad_request(ser.errors)
        sheet = ser.save()
        return self.send_response(
            False,
            "success",
            {"data": serializers.MonthlyResultSheetSerializer(sheet).data},
        )


class ResultSheetGridView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"GET": ["grade.manage", "grade.view_all"]}

    def get(self, request, sheet_id: int):
        sheet = _get_sheet(sheet_id)
        if sheet is None:
            return self.not_found("Sheet not found.")
        user = acting_user(request)
        try:
            check_course_read(user, sheet.course)
        except Exception:
            return self.forbidden("Not allowed for this course.")
        students = services.course_roster_students(sheet.course_id)
        columns = list(sheet.columns.order_by("sort_order", "id"))
        cells_qs = models.ResultCell.objects.filter(column__sheet=sheet)
        cells = {
            f"{cell.column_id}:{cell.student_id}": cell.marks for cell in cells_qs
        }
        payload = {
            "sheet": {
                "id": sheet.id,
                "year": sheet.year,
                "month": sheet.month,
                "exam_date": sheet.exam_date.isoformat(),
            },
            "students": students,
            "columns": serializers.ResultColumnSerializer(columns, many=True).data,
            "cells": cells,
        }
        return self.send_response(False, "success", {"data": payload})


class ResultSheetColumnListView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {
        "GET": ["grade.manage", "grade.view_all"],
        "POST": "grade.manage",
    }

    def get(self, request, sheet_id: int):
        sheet = _get_sheet(sheet_id)
        if sheet is None:
            return self.not_found("Sheet not found.")
        columns = sheet.columns.order_by("sort_order", "id")
        return self.send_response(
            False,
            "success",
            {"data": serializers.ResultColumnSerializer(columns, many=True).data},
        )

    def post(self, request, sheet_id: int):
        sheet = _get_sheet(sheet_id)
        if sheet is None:
            return self.not_found("Sheet not found.")
        user = acting_user(request)
        try:
            check_course_read(user, sheet.course)
        except Exception:
            return self.forbidden("Not allowed for this course.")
        next_order = sheet.columns.count()
        payload = {**request.data, "sort_order": next_order}
        ser = serializers.ResultColumnSerializer(data=payload)
        if not ser.is_valid():
            return self.bad_request(ser.errors)
        column = ser.save(sheet=sheet)
        return self.send_response(
            False,
            "created",
            {"data": serializers.ResultColumnSerializer(column).data},
            status=201,
        )


class ResultColumnDetailView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"PATCH": "grade.manage", "DELETE": "grade.manage"}

    def patch(self, request, column_id: int):
        column = models.ResultColumn.objects.filter(pk=column_id).select_related(
            "sheet__course"
        ).first()
        if column is None:
            return self.not_found("Column not found.")
        ser = serializers.ResultColumnSerializer(
            column, data=request.data, partial=True
        )
        if not ser.is_valid():
            return self.bad_request(ser.errors)
        column = ser.save()
        return self.send_response(
            False,
            "success",
            {"data": serializers.ResultColumnSerializer(column).data},
        )

    def delete(self, request, column_id: int):
        column = models.ResultColumn.objects.filter(pk=column_id).first()
        if column is None:
            return self.not_found("Column not found.")
        column.delete()
        return self.send_response(False, "success", {"data": None})


class ResultSheetCellsView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"PATCH": "grade.manage"}

    def patch(self, request, sheet_id: int):
        sheet = _get_sheet(sheet_id)
        if sheet is None:
            return self.not_found("Sheet not found.")
        cells = request.data.get("cells")
        if not isinstance(cells, list):
            return self.bad_request("cells must be a list.")
        ser = serializers.ResultCellUpsertSerializer(data=cells, many=True)
        if not ser.is_valid():
            return self.bad_request(ser.errors)
        column_ids = {item["column_id"] for item in ser.validated_data}
        valid_columns = set(
            models.ResultColumn.objects.filter(
                sheet=sheet, id__in=column_ids
            ).values_list("id", flat=True)
        )
        with transaction.atomic():
            for item in ser.validated_data:
                if item["column_id"] not in valid_columns:
                    continue
                models.ResultCell.objects.update_or_create(
                    column_id=item["column_id"],
                    student_id=item["student_id"],
                    defaults={"marks": item.get("marks")},
                )
        return self.send_response(False, "success", {"data": None})


class CourseReportBatchListView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {
        "GET": ["grade.manage", "grade.view_all"],
        "POST": "grade.manage",
    }

    def get(self, request, course_id: int):
        course = _get_course(course_id)
        if course is None:
            return self.not_found("Course not found.")
        batches = models.MonthlyReportBatch.objects.filter(course=course).order_by(
            "-created_at"
        )
        data = serializers.MonthlyReportBatchSerializer(batches, many=True).data
        return self.send_response(False, "success", {"data": data})

    def post(self, request, course_id: int):
        course = _get_course(course_id)
        if course is None:
            return self.not_found("Course not found.")
        user = acting_user(request)
        ser = serializers.ReportBatchCreateSerializer(data=request.data)
        if not ser.is_valid():
            return self.bad_request(ser.errors)
        sheet = _get_sheet(ser.validated_data["sheet_id"])
        if sheet is None or sheet.course_id != course.id:
            return self.bad_request("Invalid sheet for this course.")
        try:
            batch = services.build_report_batch(
                course=course,
                sheet=sheet,
                column_ids=ser.validated_data["column_ids"],
                project_templates=ser.validated_data.get("project_templates") or [],
                actor=user,
            )
        except ValueError as exc:
            return self.bad_request(str(exc))
        batch = models.MonthlyReportBatch.objects.prefetch_related(
            "reports__student"
        ).get(pk=batch.id)
        return self.send_response(
            False,
            "created",
            {"data": serializers.MonthlyReportBatchSerializer(batch).data},
            status=201,
        )


class ReportBatchDetailView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"GET": ["grade.manage", "grade.view_all"]}

    def get(self, request, batch_id: int):
        batch = (
            models.MonthlyReportBatch.objects.filter(pk=batch_id)
            .prefetch_related("reports__student")
            .first()
        )
        if batch is None:
            return self.not_found("Batch not found.")
        user = acting_user(request)
        try:
            check_course_read(user, batch.course)
        except Exception:
            return self.forbidden("Not allowed for this course.")
        return self.send_response(
            False,
            "success",
            {"data": serializers.MonthlyReportBatchSerializer(batch).data},
        )


class ReportBatchRegenerateView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"POST": "grade.manage"}

    def post(self, request, batch_id: int):
        batch = models.MonthlyReportBatch.objects.filter(pk=batch_id).first()
        if batch is None:
            return self.not_found("Batch not found.")
        try:
            batch = services.rebuild_batch_reports(batch)
        except ValueError as exc:
            return self.bad_request(str(exc))
        batch = models.MonthlyReportBatch.objects.prefetch_related(
            "reports__student"
        ).get(pk=batch.id)
        return self.send_response(
            False,
            "success",
            {"data": serializers.MonthlyReportBatchSerializer(batch).data},
        )


class MonthlyReportDetailView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {
        "GET": ["grade.manage", "grade.view_all"],
        "PATCH": "grade.manage",
    }

    def get(self, request, report_id: int):
        report = (
            models.MonthlyReport.objects.filter(pk=report_id)
            .select_related("student", "batch__course")
            .first()
        )
        if report is None:
            return self.not_found("Report not found.")
        user = acting_user(request)
        try:
            check_course_read(user, report.batch.course)
        except Exception:
            return self.forbidden("Not allowed for this course.")
        return self.send_response(
            False,
            "success",
            {"data": serializers.MonthlyReportSerializer(report).data},
        )

    def patch(self, request, report_id: int):
        report = models.MonthlyReport.objects.filter(pk=report_id).first()
        if report is None:
            return self.not_found("Report not found.")
        if report.status == models.MonthlyReport.Status.FINALIZED:
            return self.forbidden("Finalized reports cannot be edited.")
        ser = serializers.MonthlyReportUpdateSerializer(
            report, data=request.data, partial=True
        )
        if not ser.is_valid():
            return self.bad_request(ser.errors)
        report = ser.save()
        return self.send_response(
            False,
            "success",
            {"data": serializers.MonthlyReportSerializer(report).data},
        )


class MonthlyReportFinalizeView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"POST": "grade.manage"}

    def post(self, request, report_id: int):
        report = models.MonthlyReport.objects.filter(pk=report_id).first()
        if report is None:
            return self.not_found("Report not found.")
        try:
            report = services.finalize_report(report, acting_user(request))
        except ValueError as exc:
            return self.bad_request(str(exc))
        return self.send_response(
            False,
            "success",
            {"data": serializers.MonthlyReportSerializer(report).data},
        )

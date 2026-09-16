from __future__ import annotations

from django.db import transaction

from app_course.course_scoping import acting_user, check_course_read
from app_course.models import Course
from app_grading_reports import mark_sheet_services as ms
from app_grading_reports import models, serializers
from app_grading_reports.mark_sheet_header_flatten import flatten_two_row_headers
from app_grading_reports.mark_sheet_inference import (
    infer_import_columns,
    rubric_columns_for_commit,
    validate_section_max_marks,
)
from app_rbac.views import RBACView
from app_utils.import_parse import parse_import_file
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication

_AUTH = [TenantBoundJWTStatelessAuthentication]
IMPORT_MAX_ROWS = 5000


def _get_course(course_id: int) -> Course | None:
    return Course.objects.filter(pk=course_id).first()


def _get_mark_sheet(sheet_id: int) -> models.MarkSheet | None:
    return (
        models.MarkSheet.objects.filter(pk=sheet_id)
        .select_related("course", "rubric")
        .first()
    )


def _check_course(user, course: Course):
    try:
        check_course_read(user, course)
    except Exception as exc:
        raise PermissionError("Not allowed for this course.") from exc


def _serialize_grid(sheet: models.MarkSheet) -> dict:
    payload = ms.build_grid_payload(sheet)
    return {
        "sheet": serializers.MarkSheetSerializer(payload["sheet"]).data,
        "rubric": serializers.CourseRubricSerializer(payload["rubric"]).data,
        "students": payload["students"],
        "cells": payload["cells"],
        "computed": payload["computed"],
    }


class CourseRubricListView(RBACView):
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
            _check_course(user, course)
        except PermissionError as exc:
            return self.forbidden(str(exc))
        rubrics = models.CourseRubric.objects.filter(course=course)
        data = serializers.CourseRubricSerializer(rubrics, many=True).data
        return self.send_response(False, "success", {"data": data})

    def post(self, request, course_id: int):
        course = _get_course(course_id)
        if course is None:
            return self.not_found("Course not found.")
        user = acting_user(request)
        try:
            _check_course(user, course)
        except PermissionError as exc:
            return self.forbidden(str(exc))
        title = request.data.get("title")
        if not title:
            return self.bad_request("title is required.")
        if ms.find_rubric_title_conflict(course.id, title):
            return self.bad_request("A rubric with this title already exists.")
        ser = serializers.CourseRubricSerializer(
            data={
                "course": course.id,
                "title": title,
                "columns": request.data.get("columns") or [],
                "source": models.CourseRubric.Source.MANUAL,
            }
        )
        if not ser.is_valid():
            return self.bad_request(ser.errors)
        rubric = ser.save(created_by=user)
        return self.send_response(
            False,
            "created",
            {"data": serializers.CourseRubricSerializer(rubric).data},
            status=201,
        )


class RubricDetailView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"GET": ["grade.manage", "grade.view_all"]}

    def get(self, request, rubric_id: int):
        rubric = (
            models.CourseRubric.objects.filter(pk=rubric_id)
            .select_related("course")
            .first()
        )
        if rubric is None:
            return self.not_found("Rubric not found.")
        user = acting_user(request)
        try:
            _check_course(user, rubric.course)
        except PermissionError as exc:
            return self.forbidden(str(exc))
        return self.send_response(
            False,
            "success",
            {"data": serializers.CourseRubricSerializer(rubric).data},
        )


class CourseRubricMatchView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"POST": "grade.manage"}

    def post(self, request, course_id: int):
        course = _get_course(course_id)
        if course is None:
            return self.not_found("Course not found.")
        user = acting_user(request)
        try:
            _check_course(user, course)
        except PermissionError as exc:
            return self.forbidden(str(exc))
        ser = serializers.RubricMatchRequestSerializer(data=request.data)
        if not ser.is_valid():
            return self.bad_request(ser.errors)
        suggestions = ms.suggest_rubrics(course.id, ser.validated_data["columns"])
        data = [
            {
                "rubric": serializers.CourseRubricSerializer(item["rubric"]).data,
                "similarity": item["similarity"],
            }
            for item in suggestions
        ]
        return self.send_response(False, "success", {"data": data})


class CourseMarkSheetListView(RBACView):
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
            _check_course(user, course)
        except PermissionError as exc:
            return self.forbidden(str(exc))
        qs = models.MarkSheet.objects.filter(course=course).select_related("rubric")
        year = request.query_params.get("year")
        month = request.query_params.get("month")
        if year:
            qs = qs.filter(year=int(year))
        if month:
            qs = qs.filter(month=int(month))
        data = serializers.MarkSheetSerializer(qs, many=True).data
        return self.send_response(False, "success", {"data": data})

    def post(self, request, course_id: int):
        course = _get_course(course_id)
        if course is None:
            return self.not_found("Course not found.")
        user = acting_user(request)
        try:
            _check_course(user, course)
        except PermissionError as exc:
            return self.forbidden(str(exc))
        ser = serializers.MarkSheetCreateSerializer(data=request.data)
        if not ser.is_valid():
            return self.bad_request(ser.errors)
        rubric = models.CourseRubric.objects.filter(
            pk=ser.validated_data["rubric_id"], course=course
        ).first()
        if rubric is None:
            return self.bad_request("Rubric not found for this course.")
        title = ser.validated_data.get("title") or rubric.title
        sheet = models.MarkSheet.objects.create(
            course=course,
            rubric=rubric,
            title=title,
            year=ser.validated_data["year"],
            month=ser.validated_data["month"],
            exam_date=ser.validated_data.get("exam_date"),
            created_by=user,
        )
        return self.send_response(
            False,
            "created",
            {"data": serializers.MarkSheetSerializer(sheet).data},
            status=201,
        )


class MarkSheetDetailView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {
        "GET": ["grade.manage", "grade.view_all"],
        "PATCH": "grade.manage",
    }

    def get(self, request, sheet_id: int):
        sheet = _get_mark_sheet(sheet_id)
        if sheet is None:
            return self.not_found("Mark sheet not found.")
        user = acting_user(request)
        try:
            _check_course(user, sheet.course)
        except PermissionError as exc:
            return self.forbidden(str(exc))
        return self.send_response(
            False,
            "success",
            {"data": serializers.MarkSheetSerializer(sheet).data},
        )

    def patch(self, request, sheet_id: int):
        sheet = _get_mark_sheet(sheet_id)
        if sheet is None:
            return self.not_found("Mark sheet not found.")
        user = acting_user(request)
        try:
            _check_course(user, sheet.course)
        except PermissionError as exc:
            return self.forbidden(str(exc))
        ser = serializers.MarkSheetSerializer(
            sheet, data=request.data, partial=True
        )
        if not ser.is_valid():
            return self.bad_request(ser.errors)
        sheet = ser.save()
        return self.send_response(
            False,
            "success",
            {"data": serializers.MarkSheetSerializer(sheet).data},
        )


class MarkSheetGridView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"GET": ["grade.manage", "grade.view_all"]}

    def get(self, request, sheet_id: int):
        sheet = _get_mark_sheet(sheet_id)
        if sheet is None:
            return self.not_found("Mark sheet not found.")
        user = acting_user(request)
        try:
            _check_course(user, sheet.course)
        except PermissionError as exc:
            return self.forbidden(str(exc))
        return self.send_response(False, "success", {"data": _serialize_grid(sheet)})


class MarkSheetCellsView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"PATCH": "grade.manage"}

    def patch(self, request, sheet_id: int):
        sheet = _get_mark_sheet(sheet_id)
        if sheet is None:
            return self.not_found("Mark sheet not found.")
        user = acting_user(request)
        try:
            _check_course(user, sheet.course)
        except PermissionError as exc:
            return self.forbidden(str(exc))
        cells = request.data.get("cells")
        if not isinstance(cells, list):
            return self.bad_request("cells must be a list.")
        ser = serializers.MarkSheetCellUpsertSerializer(data=cells, many=True)
        if not ser.is_valid():
            return self.bad_request(ser.errors)

        score_keys = set(ms.score_column_keys(sheet.rubric.columns))
        computed_keys = set(ms.computed_column_keys(sheet.rubric.columns))
        roster_ids = ms.roster_user_ids(sheet.course_id)

        with transaction.atomic():
            for item in ser.validated_data:
                column_key = item["column_key"]
                if column_key in computed_keys:
                    return self.bad_request(
                        message=f"Column '{column_key}' is computed and cannot be edited.",
                    )
                if column_key not in score_keys:
                    return self.bad_request(f"Invalid column key '{column_key}'.")
                if item["student_id"] not in roster_ids:
                    return self.bad_request("Student is not on the course roster.")
                models.MarkSheetCell.objects.update_or_create(
                    sheet=sheet,
                    student_id=item["student_id"],
                    column_key=column_key,
                    defaults={"marks": item.get("marks")},
                )
        return self.send_response(False, "success", {"data": None})


class MarkSheetImportParseView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"POST": "grade.manage"}

    def post(self, request, course_id: int):
        course = _get_course(course_id)
        if course is None:
            return self.not_found("Course not found.")
        user = acting_user(request)
        try:
            _check_course(user, course)
        except PermissionError as exc:
            return self.forbidden(str(exc))

        paste = request.data.get("paste")
        upload = request.FILES.get("file")
        try:
            if upload is not None:
                parsed = parse_import_file(
                    upload.file,
                    filename=upload.name,
                    sheet=None,
                    max_rows=IMPORT_MAX_ROWS,
                )
            elif paste:
                from io import BytesIO

                parsed = parse_import_file(
                    BytesIO(paste.encode("utf-8")),
                    filename="paste.tsv",
                    sheet=None,
                    max_rows=IMPORT_MAX_ROWS,
                )
            else:
                return self.bad_request("Provide a file or paste text.")
        except ValueError as exc:
            return self.bad_request(str(exc))

        headers = parsed.get("headers") or []
        rows = parsed.get("rows") or []
        headers, rows = flatten_two_row_headers(headers, rows)
        inferred, column_mapping = infer_import_columns(headers, rows)
        warnings = validate_section_max_marks(inferred)
        return self.send_response(
            False,
            "success",
            {
                "data": {
                    "headers": headers,
                    "rows": rows,
                    "inferred_columns": inferred,
                    "column_mapping": column_mapping,
                    "warnings": warnings,
                }
            },
        )


class MarkSheetImportMatchStudentsView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"POST": "grade.manage"}

    def post(self, request, course_id: int):
        course = _get_course(course_id)
        if course is None:
            return self.not_found("Course not found.")
        user = acting_user(request)
        try:
            _check_course(user, course)
        except PermissionError as exc:
            return self.forbidden(str(exc))

        rows = request.data.get("rows")
        column_mapping = request.data.get("column_mapping")
        if not isinstance(rows, list) or not isinstance(column_mapping, dict):
            return self.bad_request("rows and column_mapping are required.")

        specs = []
        for field_key, col_index in column_mapping.items():
            if col_index is None:
                continue
            values = []
            for row in rows:
                if col_index < len(row):
                    val = row[col_index]
                    if val not in (None, ""):
                        values.append(str(val).strip())
            if not values:
                continue
            match_type = "email" if field_key == "email" else "name"
            specs.append(
                {
                    "key": field_key,
                    "type": match_type,
                    "fuzzy": field_key in {"name", "alternative_name"},
                    "values": list(dict.fromkeys(values)),
                }
            )
        results = ms.match_roster_students(course.id, specs)
        return self.send_response(False, "success", {"data": {"results": results}})


class MarkSheetImportCommitView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"POST": "grade.manage"}

    def post(self, request, course_id: int):
        course = _get_course(course_id)
        if course is None:
            return self.not_found("Course not found.")
        user = acting_user(request)
        try:
            _check_course(user, course)
        except PermissionError as exc:
            return self.forbidden(str(exc))

        ser = serializers.MarkSheetImportCommitSerializer(data=request.data)
        if not ser.is_valid():
            return self.bad_request(ser.errors)

        rows = ser.validated_data["rows"]
        if any(not row.get("student_id") for row in rows):
            return self.bad_request(
                message="Unresolved student matches remain. Confirm all rows before import.",
            )

        try:
            sheet = ms.commit_mark_sheet_import(
                course=course,
                created_by=user,
                title=ser.validated_data["title"],
                year=ser.validated_data["year"],
                month=ser.validated_data["month"],
                exam_date=ser.validated_data.get("exam_date"),
                rubric_payload=ser.validated_data.get("rubric"),
                rubric_id=ser.validated_data.get("rubric_id"),
                rows=rows,
            )
        except ValueError as exc:
            return self.bad_request(str(exc))

        return self.send_response(
            False,
            "created",
            {"data": serializers.MarkSheetSerializer(sheet).data},
            status=201,
        )

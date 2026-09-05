from rest_framework import serializers

from app_grading_reports import models
from app_grading_reports.services import validate_bands


class GradingScaleSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.GradingScale
        fields = ["id", "course", "bands", "created_at", "updated_at"]
        read_only_fields = ["id", "course", "created_at", "updated_at"]

    def validate_bands(self, value):
        validate_bands(value)
        return value


class MonthlyResultSheetSerializer(serializers.ModelSerializer):
    named_test_count = serializers.SerializerMethodField()

    class Meta:
        model = models.MonthlyResultSheet
        fields = [
            "id",
            "course",
            "year",
            "month",
            "exam_date",
            "created_by",
            "created_at",
            "updated_at",
            "named_test_count",
        ]
        read_only_fields = ["created_by"]

    def get_named_test_count(self, obj):
        return obj.columns.filter(is_named_test=True).count()


class ResultColumnSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.ResultColumn
        fields = ["id", "sheet", "title", "max_marks", "is_named_test", "sort_order"]
        read_only_fields = ["sheet"]

    def validate(self, attrs):
        is_named = attrs.get(
            "is_named_test", getattr(self.instance, "is_named_test", False)
        )
        max_marks = attrs.get("max_marks", getattr(self.instance, "max_marks", None))
        if is_named and not max_marks:
            raise serializers.ValidationError(
                {"max_marks": "Required for named test columns."}
            )
        return attrs


class ResultCellUpsertSerializer(serializers.Serializer):
    column_id = serializers.IntegerField()
    student_id = serializers.IntegerField()
    marks = serializers.IntegerField(required=False, allow_null=True, min_value=0)


class ReportBatchCreateSerializer(serializers.Serializer):
    sheet_id = serializers.IntegerField()
    column_ids = serializers.ListField(
        child=serializers.IntegerField(), min_length=1
    )
    project_templates = serializers.ListField(
        child=serializers.DictField(), required=False, default=list
    )


class MonthlyReportSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.name", read_only=True)

    class Meta:
        model = models.MonthlyReport
        fields = [
            "id",
            "batch",
            "student",
            "student_name",
            "status",
            "attendance",
            "test_lines",
            "overall",
            "project_ratings",
            "teacher_remarks",
            "finalized_at",
            "finalized_by",
        ]


class MonthlyReportUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.MonthlyReport
        fields = ["project_ratings", "teacher_remarks"]

    def validate(self, attrs):
        if self.instance.status != models.MonthlyReport.Status.DRAFT:
            raise serializers.ValidationError("Finalized reports cannot be edited.")
        return attrs


class MonthlyReportBatchSerializer(serializers.ModelSerializer):
    reports = MonthlyReportSerializer(many=True, read_only=True)
    finalized_count = serializers.SerializerMethodField()
    total_count = serializers.SerializerMethodField()

    class Meta:
        model = models.MonthlyReportBatch
        fields = [
            "id",
            "course",
            "sheet",
            "report_year",
            "report_month",
            "selected_sources",
            "project_templates",
            "created_by",
            "created_at",
            "reports",
            "finalized_count",
            "total_count",
        ]

    def get_finalized_count(self, obj):
        return obj.reports.filter(
            status=models.MonthlyReport.Status.FINALIZED
        ).count()

    def get_total_count(self, obj):
        return obj.reports.count()


class CourseRubricSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.CourseRubric
        fields = [
            "id",
            "course",
            "title",
            "columns",
            "source",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_by"]

    def validate_columns(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("columns must be a list.")
        return value


class RubricMatchRequestSerializer(serializers.Serializer):
    columns = serializers.ListField(child=serializers.DictField())


class MarkSheetSerializer(serializers.ModelSerializer):
    rubric_title = serializers.CharField(source="rubric.title", read_only=True)
    filled_cell_count = serializers.SerializerMethodField()

    class Meta:
        model = models.MarkSheet
        fields = [
            "id",
            "course",
            "rubric",
            "rubric_title",
            "title",
            "year",
            "month",
            "exam_date",
            "created_by",
            "created_at",
            "updated_at",
            "filled_cell_count",
        ]
        read_only_fields = ["created_by"]

    def get_filled_cell_count(self, obj):
        return obj.cells.exclude(marks__isnull=True).count()


class MarkSheetCreateSerializer(serializers.Serializer):
    rubric_id = serializers.IntegerField()
    title = serializers.CharField(required=False, allow_blank=True)
    year = serializers.IntegerField(min_value=2000, max_value=2100)
    month = serializers.IntegerField(min_value=1, max_value=12)
    exam_date = serializers.DateField(required=False, allow_null=True)


class MarkSheetCellUpsertSerializer(serializers.Serializer):
    student_id = serializers.IntegerField()
    column_key = serializers.CharField(max_length=64)
    marks = serializers.DecimalField(
        max_digits=6, decimal_places=1, required=False, allow_null=True
    )


class MarkSheetImportCommitSerializer(serializers.Serializer):
    title = serializers.CharField()
    year = serializers.IntegerField(min_value=2000, max_value=2100)
    month = serializers.IntegerField(min_value=1, max_value=12)
    exam_date = serializers.DateField(required=False, allow_null=True)
    rubric_id = serializers.IntegerField(required=False, allow_null=True)
    rubric = serializers.DictField(required=False, allow_null=True)
    rows = serializers.ListField(child=serializers.DictField(), min_length=1)

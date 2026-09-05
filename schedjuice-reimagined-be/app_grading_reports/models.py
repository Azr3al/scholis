from django.db import models

from utilitas.models import BaseModel


class GradingScale(BaseModel):
    """Tenant default when course is null; course override when course is set."""

    course = models.ForeignKey(
        "app_course.Course",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="grading_scales",
    )
    bands = models.JSONField(default=list)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["course"],
                condition=models.Q(course__isnull=False),
                name="grading_scale_unique_course",
            ),
        ]


class MonthlyResultSheet(BaseModel):
    course = models.ForeignKey(
        "app_course.Course", on_delete=models.CASCADE, related_name="result_sheets"
    )
    year = models.PositiveSmallIntegerField()
    month = models.PositiveSmallIntegerField()
    exam_date = models.DateField()
    created_by = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_result_sheets",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["course", "year", "month"],
                name="result_sheet_unique_course_month",
            ),
        ]
        ordering = ["-year", "-month"]


class ResultColumn(BaseModel):
    sheet = models.ForeignKey(
        MonthlyResultSheet, on_delete=models.CASCADE, related_name="columns"
    )
    title = models.CharField(max_length=255)
    max_marks = models.PositiveIntegerField(null=True, blank=True)
    is_named_test = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]


class ResultCell(BaseModel):
    column = models.ForeignKey(
        ResultColumn, on_delete=models.CASCADE, related_name="cells"
    )
    student = models.ForeignKey("app_auth.User", on_delete=models.CASCADE)
    marks = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["column", "student"],
                name="result_cell_unique_column_student",
            ),
        ]


class CourseRubric(BaseModel):
    class Source(models.TextChoices):
        IMPORT_INFERRED = "import_inferred", "Import inferred"
        MANUAL = "manual", "Manual"

    course = models.ForeignKey(
        "app_course.Course", on_delete=models.CASCADE, related_name="rubrics"
    )
    title = models.CharField(max_length=255)
    columns = models.JSONField(default=list)
    source = models.CharField(
        max_length=32,
        choices=Source.choices,
        default=Source.MANUAL,
    )
    created_by = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_rubrics",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["course", "title"],
                name="rubric_unique_title_per_course",
            ),
        ]
        ordering = ["title"]


class MarkSheet(BaseModel):
    course = models.ForeignKey(
        "app_course.Course", on_delete=models.CASCADE, related_name="mark_sheets"
    )
    rubric = models.ForeignKey(
        CourseRubric, on_delete=models.PROTECT, related_name="mark_sheets"
    )
    title = models.CharField(max_length=255)
    year = models.PositiveSmallIntegerField()
    month = models.PositiveSmallIntegerField()
    exam_date = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_mark_sheets",
    )

    class Meta:
        ordering = ["-year", "-month", "-created_at"]


class MarkSheetCell(BaseModel):
    sheet = models.ForeignKey(
        MarkSheet, on_delete=models.CASCADE, related_name="cells"
    )
    student = models.ForeignKey("app_auth.User", on_delete=models.CASCADE)
    column_key = models.CharField(max_length=64)
    marks = models.DecimalField(
        max_digits=6, decimal_places=1, null=True, blank=True
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["sheet", "student", "column_key"],
                name="mark_sheet_cell_unique",
            ),
        ]


class MonthlyReportBatch(BaseModel):
    course = models.ForeignKey(
        "app_course.Course", on_delete=models.CASCADE, related_name="report_batches"
    )
    sheet = models.ForeignKey(MonthlyResultSheet, on_delete=models.PROTECT)
    report_year = models.PositiveSmallIntegerField()
    report_month = models.PositiveSmallIntegerField()
    selected_sources = models.JSONField(default=list)
    project_templates = models.JSONField(default=list)
    created_by = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_report_batches",
    )

    class Meta:
        ordering = ["-created_at"]


class MonthlyReport(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        FINALIZED = "finalized", "Finalized"

    batch = models.ForeignKey(
        MonthlyReportBatch, on_delete=models.CASCADE, related_name="reports"
    )
    student = models.ForeignKey("app_auth.User", on_delete=models.CASCADE)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.DRAFT
    )
    attendance = models.JSONField(default=dict)
    test_lines = models.JSONField(default=list)
    overall = models.JSONField(default=dict)
    project_ratings = models.JSONField(default=list)
    teacher_remarks = models.TextField(blank=True, default="")
    finalized_at = models.DateTimeField(null=True, blank=True)
    finalized_by = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="finalized_monthly_reports",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["batch", "student"],
                name="monthly_report_unique_batch_student",
            ),
        ]

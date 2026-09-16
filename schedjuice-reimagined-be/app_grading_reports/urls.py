from django.urls import path

from app_grading_reports import mark_sheet_views, views

urlpatterns = [
    path("grading-scales/default", views.TenantGradingScaleView.as_view()),
    path(
        "courses/<int:course_id>/grading-scale",
        views.CourseGradingScaleView.as_view(),
    ),
    path(
        "courses/<int:course_id>/grading-scale/resolved",
        views.CourseGradingScaleResolvedView.as_view(),
    ),
    path(
        "courses/<int:course_id>/result-sheets",
        views.CourseResultSheetListView.as_view(),
    ),
    path("result-sheets/<int:sheet_id>", views.ResultSheetDetailView.as_view()),
    path("result-sheets/<int:sheet_id>/grid", views.ResultSheetGridView.as_view()),
    path(
        "result-sheets/<int:sheet_id>/columns",
        views.ResultSheetColumnListView.as_view(),
    ),
    path("result-columns/<int:column_id>", views.ResultColumnDetailView.as_view()),
    path("result-sheets/<int:sheet_id>/cells", views.ResultSheetCellsView.as_view()),
    path(
        "courses/<int:course_id>/report-batches",
        views.CourseReportBatchListView.as_view(),
    ),
    path("report-batches/<int:batch_id>", views.ReportBatchDetailView.as_view()),
    path(
        "report-batches/<int:batch_id>/regenerate",
        views.ReportBatchRegenerateView.as_view(),
    ),
    path("monthly-reports/<int:report_id>", views.MonthlyReportDetailView.as_view()),
    path(
        "monthly-reports/<int:report_id>/finalize",
        views.MonthlyReportFinalizeView.as_view(),
    ),
    path(
        "courses/<int:course_id>/rubrics",
        mark_sheet_views.CourseRubricListView.as_view(),
    ),
    path(
        "courses/<int:course_id>/rubrics/match",
        mark_sheet_views.CourseRubricMatchView.as_view(),
    ),
    path("rubrics/<int:rubric_id>", mark_sheet_views.RubricDetailView.as_view()),
    path(
        "courses/<int:course_id>/mark-sheets",
        mark_sheet_views.CourseMarkSheetListView.as_view(),
    ),
    path(
        "mark-sheets/<int:sheet_id>",
        mark_sheet_views.MarkSheetDetailView.as_view(),
    ),
    path(
        "mark-sheets/<int:sheet_id>/grid",
        mark_sheet_views.MarkSheetGridView.as_view(),
    ),
    path(
        "mark-sheets/<int:sheet_id>/cells",
        mark_sheet_views.MarkSheetCellsView.as_view(),
    ),
    path(
        "courses/<int:course_id>/mark-sheets/import/parse",
        mark_sheet_views.MarkSheetImportParseView.as_view(),
    ),
    path(
        "courses/<int:course_id>/mark-sheets/import/match-students",
        mark_sheet_views.MarkSheetImportMatchStudentsView.as_view(),
    ),
    path(
        "courses/<int:course_id>/mark-sheets/import/commit",
        mark_sheet_views.MarkSheetImportCommitView.as_view(),
    ),
]

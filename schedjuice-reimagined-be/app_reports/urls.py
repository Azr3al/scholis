from django.urls import path

from app_reports import views

urlpatterns = [
    path("reports/hr/<str:report_type>", views.HRReportView.as_view(), name="hr-report"),
    path("reports/charts", views.ChartsView.as_view(), name="charts-report"),
    path(
        "reports/user-activity/login-trends",
        views.UserActivityLoginTrendsView.as_view(),
        name="user-activity-login-trends",
    ),
    path(
        "reports/user-activity/inactive-users",
        views.UserActivityInactiveUsersView.as_view(),
        name="user-activity-inactive-users",
    ),
    path(
        "reports/analytics/time-series",
        views.AnalyticsTimeSeriesView.as_view(),
        name="analytics-time-series",
    ),
    path(
        "reports/analytics/active-breakdown",
        views.AnalyticsActiveBreakdownView.as_view(),
        name="analytics-active-breakdown",
    ),
    path(
        "reports/analytics/revenue",
        views.AnalyticsRevenueView.as_view(),
        name="analytics-revenue",
    ),
    path(
        "reports/analytics/teaching-load",
        views.AnalyticsTeachingLoadView.as_view(),
        name="analytics-teaching-load",
    ),
    path(
        "reports/course-data-sheet",
        views.CourseDataSheetView.as_view(),
        name="course-data-sheet",
    ),
    path(
        "reports/student-data-sheet",
        views.StudentDataSheetView.as_view(),
        name="student-data-sheet",
    ),
    path(
        "reports/staff-data-sheet",
        views.StaffDataSheetView.as_view(),
        name="staff-data-sheet",
    ),
    path(
        "reports/id-photos/export",
        views.IdPhotosExportView.as_view(),
        name="id-photos-export",
    ),
    path(
        "reports/excellent-choice",
        views.ExcellentChoiceReportView.as_view(),
        name="excellent-choice-report",
    ),
    path(
        "reports/teacher-courses",
        views.TeacherCoursesReportView.as_view(),
        name="teacher-courses-report",
    ),
]

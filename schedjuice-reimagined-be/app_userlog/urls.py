from django.urls import path

from app_userlog import views

urlpatterns = [
    path("report-types", views.ReportTypeListView.as_view(), name="report-type-list"),
    path(
        "report-types/<int:obj_id>",
        views.ReportTypeDetailView.as_view(),
        name="report-type-detail",
    ),
    path(
        "report-types/<int:obj_id>/fields",
        views.ReportTypeFieldsView.as_view(),
        name="report-type-fields",
    ),
    path(
        "users/<int:user_id>/logs",
        views.UserLogListView.as_view(),
        name="user-log-list",
    ),
    path("logs/search", views.UserLogSearchView.as_view(), name="user-log-search"),
    path("logs/<int:obj_id>", views.UserLogDetailView.as_view(), name="user-log-detail"),
    path(
        "logs/<int:obj_id>/versions",
        views.UserLogVersionsView.as_view(),
        name="user-log-versions",
    ),
    path(
        "logs/<int:obj_id>/timeline",
        views.UserLogTimelineView.as_view(),
        name="user-log-timeline",
    ),
]

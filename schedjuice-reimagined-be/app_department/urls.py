from django.urls import path

from app_department import views

urlpatterns = [
    path("departments", views.DepartmentListView.as_view(), name="department-list"),
    path(
        "departments/<int:obj_id>",
        views.DepartmentDetailsView.as_view(),
        name="department-details",
    ),
    path(
        "departments/search",
        views.DepartmentSearchView.as_view(),
        name="department-search",
    ),
    path("jobs", views.JobListView.as_view(), name="job-list"),
    path("jobs/<int:obj_id>", views.JobDetailsView.as_view(), name="job-details"),
    path("jobs/search", views.JobSearchView.as_view(), name="job-search"),
    path(
        "user-departments",
        views.UserDepartmentListView.as_view(),
        name="userdepartment-list",
    ),
    path(
        "user-departments/<int:obj_id>",
        views.UserDepartmentDetailsView.as_view(),
        name="userdepartment-details",
    ),
    path(
        "user-departments/search",
        views.UserDepartmentSearchView.as_view(),
        name="userdepartment-search",
    ),
    path(
        "user-departments/management",
        views.UserDepartmentManagementView.as_view(),
        name="userdepartment-management",
    ),
]

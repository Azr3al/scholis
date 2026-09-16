from django.urls import path

from app_awards import views

urlpatterns = [
    path("award-titles", views.AwardTitleListView.as_view(), name="award-title-list"),
    path(
        "award-titles/<int:obj_id>",
        views.AwardTitleDetailsView.as_view(),
        name="award-title-detail",
    ),
    path(
        "award-titles/<int:obj_id>/retire",
        views.AwardTitleRetireView.as_view(),
        name="award-title-retire",
    ),
    path(
        "courses/<int:course_id>/awards",
        views.CourseAwardsBoardView.as_view(),
        name="course-awards-board",
    ),
    path(
        "courses/<int:course_id>/award-grants/batch",
        views.CourseAwardGrantBatchView.as_view(),
        name="course-award-grant-batch",
    ),
    path(
        "courses/<int:course_id>/award-grants",
        views.CourseAwardGrantCreateView.as_view(),
        name="course-award-grant-create",
    ),
    path(
        "award-grants/<int:obj_id>",
        views.AwardGrantDeleteView.as_view(),
        name="award-grant-delete",
    ),
    path(
        "courses/<int:course_id>/award-titles/<int:obj_id>/promote",
        views.CourseAwardTitlePromoteView.as_view(),
        name="course-award-title-promote",
    ),
    path(
        "courses/<int:course_id>/award-titles/<int:obj_id>/display-template",
        views.CourseAwardDisplayTemplateView.as_view(),
        name="course-award-display-template",
    ),
    path(
        "award-titles/<int:obj_id>/certificate",
        views.AwardTitleCertificateView.as_view(),
        name="award-title-certificate",
    ),
]

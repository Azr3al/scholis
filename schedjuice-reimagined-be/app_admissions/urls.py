from django.urls import path

from app_admissions.views import (
    AdmissionsCourseSearchView,
    AdmissionsPeopleSearchView,
    AdmissionsPersonAttendingView,
)

urlpatterns = [
    path(
        "admissions/people/search",
        AdmissionsPeopleSearchView.as_view(),
        name="admissions-people-search",
    ),
    path(
        "admissions/people/<int:id>/attending",
        AdmissionsPersonAttendingView.as_view(),
        name="admissions-people-attending",
    ),
    path(
        "admissions/courses/search",
        AdmissionsCourseSearchView.as_view(),
        name="admissions-courses-search",
    ),
]

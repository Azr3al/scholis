from django.urls import path

from app_utils.import_views import (
    ImportCommitView,
    ImportFieldsView,
    ImportMicrosoftJobStatusView,
    ImportParseView,
)

urlpatterns = [
    path("imports/parse", ImportParseView.as_view(), name="imports-parse"),
    path("imports/fields", ImportFieldsView.as_view(), name="imports-fields"),
    path("imports/commit", ImportCommitView.as_view(), name="imports-commit"),
    path(
        "imports/microsoft-jobs/<int:job_id>",
        ImportMicrosoftJobStatusView.as_view(),
        name="imports-microsoft-job-status",
    ),
]

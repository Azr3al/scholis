from django.urls import path

from app_organization.ops_discord_views import OpsDiscordSettingsView, OpsDiscordTestView
from app_finance.ocr_analytics_views import OcrAnalyticsView
from app_organization.mobile_version_views import MobileAppVersionPolicyManagementView
from app_tasks import views
from app_tasks.acca_import_upload_view import ImportAccaStudentsUploadView

urlpatterns = [
    path(
        "management/ops-discord",
        OpsDiscordSettingsView.as_view(),
        name="ops-discord",
    ),
    path(
        "management/ops-discord/test",
        OpsDiscordTestView.as_view(),
        name="ops-discord-test",
    ),
    path(
        "management/mobile-app-version",
        MobileAppVersionPolicyManagementView.as_view(),
        name="mobile-app-version-management",
    ),
    path(
        "management/cron-logs",
        views.CronCommandLogView.as_view(),
        name="cron-logs",
    ),
    path(
        "management/cron-health",
        views.CronHealthView.as_view(),
        name="cron-health",
    ),
    path(
        "management/ocr-analytics",
        OcrAnalyticsView.as_view(),
        name="ocr-analytics",
    ),
    path(
        "management/cron-trigger/<str:command_name>",
        views.TriggerCronView.as_view(),
        name="cron-trigger",
    ),
    path(
        "management/import-acca-students",
        ImportAccaStudentsUploadView.as_view(),
        name="import-acca-students-upload",
    ),
    path(
        "management/<str:command_name>",
        views.ManagementCommandView.as_view(),
        name="management-command",
    ),
]

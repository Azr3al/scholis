from django.urls import path

from app_ai import usage_views, views

urlpatterns = [
    path("ai/query", views.AIQueryView.as_view()),
    path(
        "platform/ai-usage/summary",
        usage_views.PlatformAIUsageSummaryView.as_view(),
        name="platform-ai-usage-summary",
    ),
    path(
        "platform/ai-usage/failures",
        usage_views.PlatformAIUsageFailuresView.as_view(),
        name="platform-ai-usage-failures",
    ),
    path(
        "platform/ai-usage/failures/<int:request_log_id>",
        usage_views.PlatformAIUsageFailureResolveView.as_view(),
        name="platform-ai-usage-failure-resolve",
    ),
    path(
        "platform/ai-usage/requests",
        usage_views.PlatformAIUsageRequestsView.as_view(),
        name="platform-ai-usage-requests",
    ),
    path(
        "platform/ai-usage/analytics",
        usage_views.PlatformAIUsageAnalyticsView.as_view(),
        name="platform-ai-usage-analytics",
    ),
]

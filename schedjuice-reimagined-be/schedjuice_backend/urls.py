"""lms_backend URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
import debug_toolbar
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_yasg import openapi
from drf_yasg.views import get_schema_view
from rest_framework import permissions

from app_google.calendar_webhook_views import GoogleCalendarWebhookView
from app_tasks.eas_webhook_views import EasBuildWebhookView, EasSubmitWebhookView

schema_view = get_schema_view(
    openapi.Info(
        title="Schedjuice REST API",
        default_version="v0",
    ),
    public=True,
    permission_classes=[permissions.AllowAny],
)


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("utilitas.urls")),
    path(
        "api/v1/swagger/",
        schema_view.with_ui("swagger", cache_timeout=0),
        name="schema-swagger-ui",
    ),
    path("api/v1/", include("app_auth.urls")),
    path("api/v1/", include("app_course.urls")),
    path("api/v1/", include("app_awards.urls")),
    path("api/v1/", include("app_documents.urls")),
    path("api/v1/", include("app_attendance.urls")),
    path("api/v1/", include("app_quiz_v3.urls")),
    path("api/v1/", include("app_organization.urls")),
    path("api/v1/", include("app_zoom.urls")),
    path("api/v1/", include("app_custom_fields.urls")),
    path("api/v1/", include("app_welcome_board.urls")),
    path("api/v1/", include("app_utility_notifications.urls")),
    path("api/v1/", include("app_attachment.urls")),
    path("api/v1/", include("app_announcement.urls")),
    path("api/v1/", include("app_utils.urls")),
    path("api/v1/", include("app_reports.urls")),
    path("api/v1/", include("app_department.urls")),
    path("api/v1/", include("app_crm.urls")),
    path("api/v1/", include("app_userlog.urls")),
    path("api/v1/", include("app_points.urls")),
    path("api/v1/", include("app_grading_reports.urls")),
    path("api/v1/", include("app_product_docs.urls")),
    path("api/v1/", include("app_finance.urls")),
    path("api/v1/", include("app_wiki.urls")),
    path("api/v1/", include("app_tools.urls")),
    path("api/v1/", include("app_tasks.urls")),
    path("api/v1/", include("app_demo.urls")),
    path("api/v1/", include("app_library.urls")),
    path("api/v1/", include("app_hr.urls")),
    path("api/v1/", include("app_admissions.urls")),
    path("api/v1/", include("app_microsoft.urls")),
    path("api/v1/telegram/", include("app_telegram.urls")),
    path("api/v1/google/", include("app_google.urls")),
    path("api/v1/", include("app_consultation.urls")),
    path("api/v1/", include("app_rbac.urls")),
    path("api/v1/", include("app_ai.urls")),
    path("api/v1/webhooks/eas/build/", EasBuildWebhookView.as_view(), name="eas-webhook-build"),
    path("api/v1/webhooks/eas/submit/", EasSubmitWebhookView.as_view(), name="eas-webhook-submit"),
    path(
        "api/v1/webhooks/google/calendar/notify/",
        GoogleCalendarWebhookView.as_view(),
        name="google-calendar-webhook",
    ),
    # path("api/v1/", include("app_chat.urls")),  # Disabled: CHAT_AND_WEBSOCKET_ENABLED
]

if getattr(settings, "CHAT_AND_WEBSOCKET_ENABLED", False):
    urlpatterns.append(path("api/v1/", include("app_chat.urls")))

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

if settings.DEBUG:
    urlpatterns += [path("__debug__/", include(debug_toolbar.urls))]

if getattr(settings, "SILK_ENABLED", False):
    urlpatterns += [path("silk/", include("silk.urls"))]

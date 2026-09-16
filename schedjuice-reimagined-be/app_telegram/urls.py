from django.urls import path

from app_telegram.views import (
    CourseTelegramLinkView,
    CourseTelegramUnlinkView,
    TelegramConfigView,
    TelegramLinkTokenView,
    TelegramReRegisterWebhookView,
    TelegramUnlinkView,
    TelegramWebhookView,
)

urlpatterns = [
    path("config", TelegramConfigView.as_view(), name="telegram-config"),
    path(
        "re-register-webhook",
        TelegramReRegisterWebhookView.as_view(),
        name="telegram-re-register-webhook",
    ),
    path(
        "webhook/<str:routing_key>/",
        TelegramWebhookView.as_view(),
        name="telegram-webhook",
    ),
    path("link-token", TelegramLinkTokenView.as_view(), name="telegram-link-token"),
    path("unlink", TelegramUnlinkView.as_view(), name="telegram-unlink"),
    path(
        "courses/<int:course_id>/link",
        CourseTelegramLinkView.as_view(),
        name="course-telegram-link",
    ),
    path(
        "courses/<int:course_id>/unlink",
        CourseTelegramUnlinkView.as_view(),
        name="course-telegram-unlink",
    ),
]

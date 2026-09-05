from django.urls import path

from app_google import oauth_views, views

urlpatterns = [
    path(
        "oauth/start/login",
        oauth_views.GoogleOAuthLoginStartView.as_view(),
        name="google-oauth-login-start",
    ),
    path(
        "oauth/start/link",
        oauth_views.GoogleOAuthLinkStartView.as_view(),
        name="google-oauth-link-start",
    ),
    path(
        "oauth/start/calendar-link",
        oauth_views.GoogleOAuthCalendarLinkStartView.as_view(),
        name="google-oauth-calendar-link-start",
    ),
    path(
        "oauth/callback",
        oauth_views.GoogleOAuthCallbackView.as_view(),
        name="google-oauth-callback",
    ),
    path(
        "oauth/handoff/exchange",
        oauth_views.GoogleOAuthHandoffExchangeView.as_view(),
        name="google-oauth-handoff-exchange",
    ),
    path("unlink", views.GoogleUnlinkView.as_view(), name="google-unlink"),
    path(
        "calendar/unlink",
        views.GoogleCalendarUnlinkView.as_view(),
        name="google-calendar-unlink",
    ),
]

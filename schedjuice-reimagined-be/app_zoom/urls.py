from django.urls import path

from app_zoom import views

urlpatterns = [
    path("zoom/oauth/start", views.ZoomOAuthStartView.as_view(), name="zoom-oauth-start"),
    path(
        "zoom/oauth/callback",
        views.ZoomOAuthCallbackView.as_view(),
        name="zoom-oauth-callback",
    ),
    path(
        "zoom/oauth/start/personal",
        views.ZoomOAuthPersonalStartView.as_view(),
        name="zoom-oauth-personal-start",
    ),
    path(
        "zoom/oauth/personal/reconnect",
        views.ZoomOAuthPersonalReconnectView.as_view(),
        name="zoom-oauth-personal-reconnect",
    ),
    path(
        "zoom/oauth/personal/disconnect",
        views.ZoomOAuthPersonalDisconnectView.as_view(),
        name="zoom-oauth-personal-disconnect",
    ),
    path(
        "zoom/oauth/personal/status",
        views.ZoomOAuthPersonalStatusView.as_view(),
        name="zoom-oauth-personal-status",
    ),
    path("zoom/accounts", views.ZoomAccountListView.as_view(), name="zoom-accounts-list"),
    path(
        "zoom/accounts/<int:zoom_account_pk>/host",
        views.ZoomAccountSetHostView.as_view(),
        name="zoom-account-set-host",
    ),
    path(
        "zoom/accounts/<int:zoom_account_pk>/users",
        views.ZoomAccountUsersView.as_view(),
        name="zoom-account-users",
    ),
    path(
        "zoom/accounts/<int:zoom_account_pk>/reconnect",
        views.ZoomAccountReconnectView.as_view(),
        name="zoom-account-reconnect",
    ),
    path(
        "zoom/accounts/<int:zoom_account_pk>/disconnect",
        views.ZoomAccountDisconnectView.as_view(),
        name="zoom-account-disconnect",
    ),
]

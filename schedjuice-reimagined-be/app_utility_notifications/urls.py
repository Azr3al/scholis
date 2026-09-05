from django.urls import path

from app_utility_notifications import views

urlpatterns = [
    path(
        "utility-notifications/me",
        views.UtilityNotificationsForMeView.as_view(),
        name="utility-notifications-for-me",
    ),
]

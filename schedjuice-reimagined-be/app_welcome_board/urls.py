from django.urls import path

from app_welcome_board import views

urlpatterns = [
    path("welcome-boards/for-me", views.WelcomeBoardForMeView.as_view(), name="welcome-board-for-me"),
    path("welcome-boards", views.WelcomeBoardListView.as_view(), name="welcome-board-list"),
    path(
        "welcome-boards/<str:audience>",
        views.WelcomeBoardAudienceView.as_view(),
        name="welcome-board-audience",
    ),
]

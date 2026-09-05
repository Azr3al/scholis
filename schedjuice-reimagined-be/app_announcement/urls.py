from django.urls import path

from app_announcement import views

urlpatterns = [
    path(
        "announcements/public",
        views.AnnouncementPublicListView.as_view(),
        name="announcement-public-list",
    ),
    path(
        "announcements/public/<int:obj_id>",
        views.AnnouncementPublicDetailsView.as_view(),
        name="announcement-public-details",
    ),
    path(
        "announcements", views.AnnouncementListView.as_view(), name="announcement-list"
    ),
    path(
        "announcements/<int:obj_id>",
        views.AnnouncementDetailsView.as_view(),
        name="announcement-details",
    ),
    path(
        "announcements/<int:obj_id>/resend-to-teams",
        views.AnnouncementResendTeamsView.as_view(),
        name="announcement-resend-to-teams",
    ),
    path(
        "announcements/search",
        views.AnnouncementSearchView.as_view(),
        name="announcement-search",
    ),
    path(
        "news/public/<int:obj_id>", views.NewsPublicDetailsView.as_view(), name="news-public-details"
    ),
    path(
        "news/public",
        views.NewsPublicListView.as_view(),
        name="news-public-list",
    ),
    path("news", views.NewsListView.as_view(), name="news-list"),
    path("news/<int:obj_id>", views.NewsDetailsView.as_view(), name="news-details"),
    path("news/search", views.NewsSearchView.as_view(), name="news-search"),
    path("comments", views.CommentListView.as_view(), name="comment-list"),
    path("comments/<int:obj_id>", views.CommentDetailsView.as_view(), name="comment-details"),
    path("comments/search", views.CommentSearchView.as_view(), name="comment-search"),
    path("reactions", views.ReactionListView.as_view(), name="reaction-list"),
    path("reactions/<int:obj_id>", views.ReactionDetailsView.as_view(), name="reaction-details"),
    path("reactions/search", views.ReactionSearchView.as_view(), name="reaction-search"),
]

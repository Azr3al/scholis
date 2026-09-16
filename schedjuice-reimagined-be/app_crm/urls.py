from django.urls import path

from app_crm import views

urlpatterns = [
    path("leads", views.LeadListView.as_view(), name="lead-list"),
    path("leads/search", views.LeadSearchView.as_view(), name="lead-search"),
    path(
        "leads/mention-candidates",
        views.LeadMentionCandidatesView.as_view(),
        name="lead-mention-candidates",
    ),
    path("leads/<int:obj_id>", views.LeadDetailView.as_view(), name="lead-detail"),
    path("leads/<int:obj_id>/move", views.LeadMoveView.as_view(), name="lead-move"),
    path(
        "leads/<int:obj_id>/convert",
        views.LeadConvertView.as_view(),
        name="lead-convert",
    ),
    path(
        "leads/<int:obj_id>/appointments",
        views.LeadAppointmentListView.as_view(),
        name="lead-appointments",
    ),
    path(
        "leads/appointments/<int:obj_id>",
        views.LeadAppointmentDetailView.as_view(),
        name="lead-appointment-detail",
    ),
    path(
        "leads/<int:obj_id>/comments",
        views.LeadCommentListView.as_view(),
        name="lead-comments",
    ),
    path(
        "leads/<int:obj_id>/timeline",
        views.LeadTimelineView.as_view(),
        name="lead-timeline",
    ),
    path(
        "leads/<int:obj_id>/observers",
        views.LeadObserverListView.as_view(),
        name="lead-observer-list",
    ),
    path(
        "leads/<int:obj_id>/observers/<int:user_id>",
        views.LeadObserverDetailView.as_view(),
        name="lead-observer-detail",
    ),
    path("lead-statuses", views.LeadStatusListView.as_view(), name="lead-status-list"),
    path(
        "lead-statuses/<int:obj_id>",
        views.LeadStatusDetailView.as_view(),
        name="lead-status-detail",
    ),
    path("lead-sources", views.LeadSourceListView.as_view(), name="lead-source-list"),
    path(
        "lead-sources/<int:obj_id>",
        views.LeadSourceDetailView.as_view(),
        name="lead-source-detail",
    ),
    path("issues", views.IssueListView.as_view(), name="issue-list"),
    path(
        "issues/mention-candidates",
        views.IssueMentionCandidatesView.as_view(),
        name="issue-mention-candidates",
    ),
    path("issues/<int:obj_id>", views.IssueDetailView.as_view(), name="issue-detail"),
    path("issues/<int:obj_id>/move", views.IssueMoveView.as_view(), name="issue-move"),
    path(
        "issues/<int:obj_id>/comments",
        views.IssueCommentListView.as_view(),
        name="issue-comments",
    ),
    path(
        "issues/<int:obj_id>/timeline",
        views.IssueTimelineView.as_view(),
        name="issue-timeline",
    ),
    path(
        "issues/<int:obj_id>/observers",
        views.IssueObserverListView.as_view(),
        name="issue-observer-list",
    ),
    path(
        "issues/<int:obj_id>/observers/<int:user_id>",
        views.IssueObserverDetailView.as_view(),
        name="issue-observer-detail",
    ),
    path(
        "issue-statuses", views.IssueStatusListView.as_view(), name="issue-status-list"
    ),
    path(
        "issue-statuses/<int:obj_id>",
        views.IssueStatusDetailView.as_view(),
        name="issue-status-detail",
    ),
]

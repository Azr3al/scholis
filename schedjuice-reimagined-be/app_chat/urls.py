from django.urls import path

from app_chat import views

urlpatterns = [
    path(
        "courses/chat/last-messages",
        views.CourseChatLastMessagesBatchView.as_view(),
        name="course-chat-last-messages-batch",
    ),
    path(
        "courses/<int:course_id>/chat/thread",
        views.ChatThreadResolveView.as_view(),
        name="chat-thread-resolve",
    ),
    path(
        "chat/threads",
        views.ChatThreadListCreateView.as_view(),
        name="chat-thread-list-create",
    ),
    path(
        "chat/threads/<int:thread_id>/messages",
        views.ChatThreadMessageListCreateView.as_view(),
        name="chat-thread-message-list-create",
    ),
    path(
        "chat/threads/<int:thread_id>/messages/<int:message_id>",
        views.ChatThreadMessageDetailView.as_view(),
        name="chat-thread-message-detail",
    ),
    path(
        "chat/threads/<int:thread_id>/messages/<int:message_id>/reactions",
        views.ChatThreadMessageReactionToggleView.as_view(),
        name="chat-thread-message-reactions",
    ),
    path(
        "chat/threads/<int:thread_id>/read-state",
        views.ChatThreadReadStatePutView.as_view(),
        name="chat-thread-read-state",
    ),
    path(
        "chat/threads/<int:thread_id>/presence",
        views.ChatThreadPresenceGetView.as_view(),
        name="chat-thread-presence",
    ),
    path(
        "chat/dm/eligible-users",
        views.DirectMessageEligibleUsersView.as_view(),
        name="dm-eligible-users",
    ),
]

from django.urls import path

from app_chat.consumers import ChatThreadConsumer

websocket_urlpatterns = [
    path("ws/chat/threads/<int:thread_id>/", ChatThreadConsumer.as_asgi()),
]

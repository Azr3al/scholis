"""Unit tests for chat push notification targeting and payloads."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_chat import notifications


class ChatNotificationPushTests(SimpleTestCase):
    @patch("app_chat.notifications.enqueue_push_for_user_ids")
    @patch("app_chat.notifications.ChatReadState.objects.filter")
    def test_course_chat_excludes_sender_and_includes_data_payload(
        self, mock_read_filter, mock_enqueue
    ):
        mock_read_filter.return_value = []
        user_courses = MagicMock()
        user_courses.values_list.return_value = [10, 20, 30]
        course = SimpleNamespace(title="Algebra 101", user_courses=user_courses)
        thread = SimpleNamespace(id=1, course_id=5, course=course, kind="course")
        sender = SimpleNamespace(name="Jane Doe")
        message = SimpleNamespace(
            id=99,
            user_id=10,
            thread=thread,
            user=sender,
            content={"text": "Hello class"},
        )

        notifications.queue_course_chat_message_pushes(message)

        mock_enqueue.assert_called_once_with(
            [20, 30],
            title="Algebra 101",
            body="Hello class",
            data={
                "type": "course_chat",
                "course_id": "5",
                "thread_id": "1",
                "message_id": "99",
                "sender_name": "Jane Doe",
            },
        )

    @patch("app_chat.notifications.enqueue_push_for_user_ids")
    @patch("app_chat.notifications.ChatReadState.objects.filter")
    def test_course_chat_skips_already_read_recipient(
        self, mock_read_filter, mock_enqueue
    ):
        mock_read_filter.return_value = [
            SimpleNamespace(user_id=20, last_read_message_id=100)
        ]
        user_courses = MagicMock()
        user_courses.values_list.return_value = [10, 20]
        course = SimpleNamespace(title="History", user_courses=user_courses)
        thread = SimpleNamespace(id=1, course_id=5, course=course, kind="course")
        message = SimpleNamespace(
            id=50,
            user_id=10,
            thread=thread,
            user=SimpleNamespace(name="Sender"),
            content={"text": "Late"},
        )

        notifications.queue_course_chat_message_pushes(message)

        mock_enqueue.assert_not_called()

    @patch("app_chat.notifications.enqueue_push_for_user_ids")
    @patch("app_chat.notifications.ChatReadState.objects.filter")
    @patch("app_chat.notifications.ChatThreadParticipant.objects.filter")
    def test_dm_push_uses_sender_name_and_thread_data(
        self, mock_participant_filter, mock_read_filter, mock_enqueue
    ):
        mock_participant_filter.return_value.values_list.return_value = [1, 2]
        mock_read_filter.return_value = []
        thread = SimpleNamespace(id=7)
        message = SimpleNamespace(
            id=12,
            user_id=1,
            thread=thread,
            user=SimpleNamespace(name="Alex"),
            content={"text": "Ping"},
        )

        notifications.queue_dm_message_pushes(message)

        mock_enqueue.assert_called_once_with(
            [2],
            title="Alex",
            body="Ping",
            data={
                "type": "dm",
                "thread_id": "7",
                "message_id": "12",
                "sender_name": "Alex",
            },
        )

    @patch("app_chat.notifications.enqueue_push_for_user_ids")
    @patch("app_chat.notifications.ChatReadState.objects.filter")
    @patch("app_chat.notifications.ChatThreadParticipant.objects.filter")
    def test_dm_push_skips_when_read_cursor_ahead(
        self, mock_participant_filter, mock_read_filter, mock_enqueue
    ):
        mock_participant_filter.return_value.values_list.return_value = [1, 2]
        mock_read_filter.return_value = [
            SimpleNamespace(user_id=2, last_read_message_id=20)
        ]
        thread = SimpleNamespace(id=7)
        message = SimpleNamespace(
            id=15,
            user_id=1,
            thread=thread,
            user=SimpleNamespace(name="Alex"),
            content={"text": "Old"},
        )

        notifications.queue_dm_message_pushes(message)

        mock_enqueue.assert_not_called()

    @patch("app_chat.notifications.enqueue_push_for_user_ids")
    @patch("app_chat.notifications.ChatReadState.objects.filter")
    def test_course_chat_voice_message_preview(self, mock_read_filter, mock_enqueue):
        mock_read_filter.return_value = []
        user_courses = MagicMock()
        user_courses.values_list.return_value = [10, 20]
        course = SimpleNamespace(title="", user_courses=user_courses)
        thread = SimpleNamespace(id=1, course_id=5, course=course, kind="course")
        message = SimpleNamespace(
            id=1,
            user_id=10,
            thread=thread,
            user=SimpleNamespace(name=""),
            content={
                "attachments": [
                    {
                        "attachment_id": 1,
                        "name": "voice.m4a",
                        "mime_type": "audio/mp4",
                        "size_bytes": 100,
                    }
                ]
            },
        )

        notifications.queue_course_chat_message_pushes(message)

        mock_enqueue.assert_called_once_with(
            [20],
            title="Course chat",
            body="Sent a voice message.",
            data={
                "type": "course_chat",
                "course_id": "5",
                "thread_id": "1",
                "message_id": "1",
                "sender_name": "",
            },
        )

    @patch("app_chat.notifications.enqueue_push_for_user_ids")
    @patch("app_chat.notifications.ChatReadState.objects.filter")
    @patch("app_chat.notifications.ChatThreadParticipant.objects.filter")
    def test_dm_voice_message_preview(
        self, mock_participant_filter, mock_read_filter, mock_enqueue
    ):
        mock_participant_filter.return_value.values_list.return_value = [1, 2]
        mock_read_filter.return_value = []
        thread = SimpleNamespace(id=7)
        message = SimpleNamespace(
            id=12,
            user_id=1,
            thread=thread,
            user=SimpleNamespace(name="Alex"),
            content={
                "attachments": [
                    {
                        "attachment_id": 3,
                        "name": "voice.webm",
                        "mime_type": "audio/webm",
                        "size_bytes": 200,
                    }
                ]
            },
        )

        notifications.queue_dm_message_pushes(message)

        mock_enqueue.assert_called_once_with(
            [2],
            title="Alex",
            body="Sent a voice message.",
            data={
                "type": "dm",
                "thread_id": "7",
                "message_id": "12",
                "sender_name": "Alex",
            },
        )

    @patch("app_chat.notifications.enqueue_push_for_user_ids")
    @patch("app_chat.notifications.ChatReadState.objects.filter")
    def test_course_chat_attachment_preview(self, mock_read_filter, mock_enqueue):
        mock_read_filter.return_value = []
        user_courses = MagicMock()
        user_courses.values_list.return_value = [10, 20]
        course = SimpleNamespace(title="", user_courses=user_courses)
        thread = SimpleNamespace(id=1, course_id=5, course=course, kind="course")
        message = SimpleNamespace(
            id=1,
            user_id=10,
            thread=thread,
            user=SimpleNamespace(name=""),
            content={"attachments": [{"attachment_id": 1}]},
        )

        notifications.queue_course_chat_message_pushes(message)

        mock_enqueue.assert_called_once_with(
            [20],
            title="Course chat",
            body="Sent an attachment.",
            data={
                "type": "course_chat",
                "course_id": "5",
                "thread_id": "1",
                "message_id": "1",
                "sender_name": "",
            },
        )

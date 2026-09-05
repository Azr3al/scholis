from __future__ import annotations

from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings

from app_utils.push_fanout_tasks import (
    LARGE_FANOUT_WARN_THRESHOLD,
    iter_user_id_chunks,
    send_push_fanout_batch,
)


class PushFanoutChunkingTestCase(SimpleTestCase):
    @override_settings(PUSH_FANOUT_CELERY_CHUNK_SIZE=300)
    def test_iter_user_id_chunks_splits_into_expected_sizes(self):
        user_ids = list(range(650))
        chunks = list(iter_user_id_chunks(user_ids))
        self.assertEqual(len(chunks), 3)
        self.assertEqual(len(chunks[0]), 300)
        self.assertEqual(len(chunks[1]), 300)
        self.assertEqual(len(chunks[2]), 50)

    @override_settings(PUSH_FANOUT_CELERY_CHUNK_SIZE=300)
    @patch("app_utils.push_fanout_tasks._send_web_push_for_user_ids")
    @patch("expo_notifications.models.Message")
    @patch("expo_notifications.models.Device")
    @patch("app_utils.push_fanout_tasks.schema_context")
    def test_send_push_fanout_batch_bulk_sends_messages_for_batch(
        self,
        mock_schema_context,
        mock_device_model,
        mock_message_model,
        mock_send_web_push,
    ):
        mock_schema_context.return_value.__enter__ = MagicMock()
        mock_schema_context.return_value.__exit__ = MagicMock(return_value=False)

        device_one = MagicMock()
        device_two = MagicMock()
        mock_device_model.objects.filter.return_value = [device_one, device_two]

        mock_message_manager = MagicMock()
        mock_message_model.objects = mock_message_manager
        mock_message_model.side_effect = lambda *args, **kwargs: MagicMock()

        send_push_fanout_batch.run(
            "xschedjuice",
            [1, 2, 3],
            "Title",
            "Body",
            {"type": "announcement"},
        )

        mock_device_model.objects.filter.assert_called_once_with(
            user_id__in=[1, 2, 3],
            is_active=True,
        )
        self.assertEqual(mock_message_model.call_count, 2)
        mock_message_manager.bulk_send.assert_called_once()
        mock_send_web_push.assert_called_once_with(
            "xschedjuice",
            [1, 2, 3],
            "Title",
            "Body",
            {"type": "announcement"},
        )


class EnqueuePushForUserIdsTestCase(SimpleTestCase):
    @override_settings(PUSH_FANOUT_CELERY_CHUNK_SIZE=300)
    @patch("app_utils.push_fanout_tasks.send_push_fanout_batch")
    @patch("app_utils.push_helpers._current_schema_name", return_value="xschedjuice")
    def test_enqueue_push_for_user_ids_chunks_recipients(
        self,
        mock_schema_name,
        mock_task,
    ):
        from app_utils.push_helpers import enqueue_push_for_user_ids

        mock_task.delay_on_commit = MagicMock()
        user_ids = list(range(650))

        enqueue_push_for_user_ids(
            user_ids,
            title="Title",
            body="Body",
            data={"type": "announcement"},
        )

        self.assertEqual(mock_task.delay_on_commit.call_count, 3)
        mock_task.delay_on_commit.assert_any_call(
            "xschedjuice",
            user_ids[:300],
            "Title",
            "Body",
            {"type": "announcement"},
        )
        mock_task.delay_on_commit.assert_any_call(
            "xschedjuice",
            user_ids[300:600],
            "Title",
            "Body",
            {"type": "announcement"},
        )
        mock_task.delay_on_commit.assert_any_call(
            "xschedjuice",
            user_ids[600:650],
            "Title",
            "Body",
            {"type": "announcement"},
        )

    @override_settings(PUSH_FANOUT_CELERY_CHUNK_SIZE=300)
    @patch("app_utils.push_fanout_tasks.send_push_fanout_batch")
    @patch("app_utils.push_helpers._current_schema_name", return_value="xschedjuice")
    @patch("app_utils.push_helpers.logger")
    def test_enqueue_push_for_user_ids_warns_on_large_fanout(
        self,
        mock_logger,
        mock_schema_name,
        mock_task,
    ):
        from app_utils.push_helpers import enqueue_push_for_user_ids

        mock_task.delay_on_commit = MagicMock()
        user_ids = list(range(LARGE_FANOUT_WARN_THRESHOLD + 1))

        enqueue_push_for_user_ids(user_ids, title="Title", body="Body")

        mock_logger.warning.assert_called_once_with(
            "Large push fan-out schema=%s recipients=%d",
            "xschedjuice",
            LARGE_FANOUT_WARN_THRESHOLD + 1,
        )

from __future__ import annotations

from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings

from app_utils.expo_push_chunking import (
    enqueue_check_receipts_tenant,
    enqueue_send_messages_tenant,
    iter_pk_chunks,
)


class ExpoPushChunkingTestCase(SimpleTestCase):
    @override_settings(EXPO_PUSH_CELERY_CHUNK_SIZE=200)
    def test_iter_pk_chunks_splits_into_expected_sizes(self):
        pks = list(range(450))
        chunks = list(iter_pk_chunks(pks))
        self.assertEqual(len(chunks), 3)
        self.assertEqual(len(chunks[0]), 200)
        self.assertEqual(len(chunks[1]), 200)
        self.assertEqual(len(chunks[2]), 50)

    @override_settings(EXPO_PUSH_CELERY_CHUNK_SIZE=200)
    @patch("app_utils.expo_tasks.send_messages_tenant")
    def test_enqueue_send_messages_tenant_chunks_bulk_send(self, mock_task):
        mock_task.delay_on_commit = MagicMock()
        message_pks = list(range(450))

        enqueue_send_messages_tenant("xschedjuice", message_pks)

        self.assertEqual(mock_task.delay_on_commit.call_count, 3)
        mock_task.delay_on_commit.assert_any_call("xschedjuice", message_pks[:200])
        mock_task.delay_on_commit.assert_any_call("xschedjuice", message_pks[200:400])
        mock_task.delay_on_commit.assert_any_call("xschedjuice", message_pks[400:450])

    @override_settings(EXPO_PUSH_CELERY_CHUNK_SIZE=200)
    @patch("app_utils.expo_tasks.check_receipts_tenant")
    def test_enqueue_check_receipts_tenant_chunks(self, mock_task):
        mock_task.apply_async = MagicMock()
        ticket_pks = list(range(450))

        enqueue_check_receipts_tenant("xschedjuice", ticket_pks, countdown=1800.0)

        self.assertEqual(mock_task.apply_async.call_count, 3)
        mock_task.apply_async.assert_any_call(
            args=["xschedjuice", ticket_pks[:200]],
            countdown=1800.0,
        )
        mock_task.apply_async.assert_any_call(
            args=["xschedjuice", ticket_pks[200:400]],
            countdown=1800.0,
        )
        mock_task.apply_async.assert_any_call(
            args=["xschedjuice", ticket_pks[400:450]],
            countdown=1800.0,
        )

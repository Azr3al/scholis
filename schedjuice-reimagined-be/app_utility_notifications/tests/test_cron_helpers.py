"""Unit tests for utility notification cron push helpers."""

from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_utility_notifications.cron_helpers import (
    reference_id_from_notification_row,
    send_utility_pushes_for_users,
)
from app_utility_notifications.utility_notification_kinds import UtilityNotificationKind

class ReferenceIdFromRowTest(SimpleTestCase):
    def test_parses_entity_from_stable_id(self):
        row = {
            "id": "today_schedule:42:2026-05-29",
            "params": {"count": 3},
        }
        self.assertEqual(reference_id_from_notification_row(row), "42")

    def test_falls_back_to_params_id(self):
        row = {
            "id": "",
            "params": {"id": 99, "courseId": 5},
        }
        self.assertEqual(reference_id_from_notification_row(row), "99")

class SendUtilityPushesForUsersTest(SimpleTestCase):
    @patch("app_utility_notifications.cron_helpers.record_utility_push_sent")
    @patch("app_utility_notifications.cron_helpers.enqueue_push_for_user_ids")
    @patch("app_utility_notifications.cron_helpers.should_send_utility_push")
    @patch("app_utility_notifications.cron_helpers.utility_notifications_for_user")
    def test_enqueues_matching_kind_and_records_dedupe(
        self,
        mock_catalog,
        mock_should_send,
        mock_enqueue,
        mock_record,
    ):
        user = SimpleNamespace(id=7)
        users_qs = MagicMock()
        users_qs.iterator.return_value = iter([user])
        now = datetime(2026, 5, 29, 8, 0, tzinfo=timezone.utc)
        sent_on = date(2026, 5, 29)
        row = {
            "id": "today_schedule:7:2026-05-29",
            "kind": UtilityNotificationKind.TODAY_SCHEDULE.value,
            "title": "Today's schedule",
            "body": "You have 1 class today.",
            "route": "/shortcuts/todays-classes",
            "params": {"count": 1},
        }
        mock_catalog.return_value = [row]
        mock_should_send.return_value = True

        sent, skipped = send_utility_pushes_for_users(
            users_qs=users_qs,
            kinds_filter={UtilityNotificationKind.TODAY_SCHEDULE.value},
            now=now,
            tenant_tz="UTC",
            sent_on_date=sent_on,
        )

        self.assertEqual(sent, 1)
        self.assertEqual(skipped, 0)
        mock_enqueue.assert_called_once_with(
            [7],
            title=row["title"],
            body=row["body"],
            data={
                "type": "utility",
                "kind": row["kind"],
                "route": row["route"],
                "params": row["params"],
                "notification_id": row["id"],
            },
        )
        mock_record.assert_called_once_with(
            user,
            row["kind"],
            "7",
            sent_on,
        )

    @patch("app_utility_notifications.cron_helpers.record_utility_push_sent")
    @patch("app_utility_notifications.cron_helpers.enqueue_push_for_user_ids")
    @patch("app_utility_notifications.cron_helpers.should_send_utility_push")
    @patch("app_utility_notifications.cron_helpers.utility_notifications_for_user")
    def test_skips_when_dedupe_blocks(
        self,
        mock_catalog,
        mock_should_send,
        mock_enqueue,
        mock_record,
    ):
        user = SimpleNamespace(id=1)
        users_qs = MagicMock()
        users_qs.iterator.return_value = iter([user])
        row = {
            "id": "class_starting_soon:55:2026-05-29",
            "kind": UtilityNotificationKind.CLASS_STARTING_SOON.value,
            "title": "Class starting soon",
            "body": "Algebra starts within the next hour.",
            "route": "/class/course/[id]",
            "params": {"id": 3, "courseId": 3},
        }
        mock_catalog.return_value = [row]
        mock_should_send.return_value = False

        sent, skipped = send_utility_pushes_for_users(
            users_qs=users_qs,
            kinds_filter={UtilityNotificationKind.CLASS_STARTING_SOON.value},
            now=datetime(2026, 5, 29, 9, 45, tzinfo=timezone.utc),
            tenant_tz="UTC",
            sent_on_date=date(2026, 5, 29),
        )

        self.assertEqual(sent, 0)
        self.assertEqual(skipped, 1)
        mock_enqueue.assert_not_called()
        mock_record.assert_not_called()

    @patch("app_utility_notifications.cron_helpers.utility_notifications_for_user")
    def test_filters_by_kinds(self, mock_catalog):
        user = SimpleNamespace(id=2)
        users_qs = MagicMock()
        users_qs.iterator.return_value = iter([user])
        mock_catalog.return_value = [
            {
                "id": "assignment_due:10:2026-05-29",
                "kind": UtilityNotificationKind.ASSIGNMENT_DUE.value,
                "title": "Assignment due",
                "body": "HW due today.",
                "route": "/class/course/assignment/[id]",
                "params": {"id": 10},
            }
        ]

        with patch(
            "app_utility_notifications.cron_helpers.should_send_utility_push",
            return_value=True,
        ), patch(
            "app_utility_notifications.cron_helpers.enqueue_push_for_user_ids"
        ) as mock_enqueue, patch(
            "app_utility_notifications.cron_helpers.record_utility_push_sent"
        ):
            sent, skipped = send_utility_pushes_for_users(
                users_qs=users_qs,
                kinds_filter={UtilityNotificationKind.TODAY_SCHEDULE.value},
                now=datetime(2026, 5, 29, 8, 0, tzinfo=timezone.utc),
                tenant_tz="UTC",
                sent_on_date=date(2026, 5, 29),
            )

        self.assertEqual(sent, 0)
        self.assertEqual(skipped, 0)
        mock_enqueue.assert_not_called()

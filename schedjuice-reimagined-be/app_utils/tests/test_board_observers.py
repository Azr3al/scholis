from unittest.mock import MagicMock, patch

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from app_utils.board_observers import (
    add_observers_from_mentions,
    email_observers_on_status_change,
    mention_user_ids,
    validate_mention_user_ids,
)


class MentionParseTests(SimpleTestCase):
    def test_mention_user_ids_dedupes(self):
        mentions = [
            {"user_id": 1, "offset": 0, "length": 5},
            {"user_id": 1, "offset": 10, "length": 5},
            {"user_id": 2, "offset": 20, "length": 5},
        ]
        self.assertEqual(mention_user_ids(mentions), [1, 2])


class ValidateMentionsTests(SimpleTestCase):
    @patch("app_utils.board_observers.users_with_permission")
    def test_rejects_users_without_permission(self, mock_eligible):
        qs = MagicMock()
        qs.filter.return_value.values_list.return_value = [1]
        mock_eligible.return_value = qs
        with self.assertRaises(ValidationError):
            validate_mention_user_ids([1, 99], permission_code="issue.view")


class AddObserversTests(SimpleTestCase):
    def test_adds_only_new_observers(self):
        entity = MagicMock()
        entity.observers.filter.return_value.values_list.return_value = [1]
        entity.observers.add = MagicMock()
        added = add_observers_from_mentions(entity, [1, 2], actor=MagicMock())
        self.assertEqual(added, [2])
        entity.observers.add.assert_called_once_with(2)


class EmailObserversTests(SimpleTestCase):
    @patch("app_utils.board_observers.send_mail")
    def test_skips_when_toggle_off(self, mock_send):
        tenant = MagicMock()
        tenant.notify_issue_observers_on_status_change = False
        entity = MagicMock()
        email_observers_on_status_change(
            tenant=tenant,
            entity=entity,
            actor=MagicMock(id=1),
            subject="Status changed",
            body_html="<p>x</p>",
            toggle_attr="notify_issue_observers_on_status_change",
        )
        mock_send.assert_not_called()

    @patch("app_utils.board_observers.send_mail")
    def test_excludes_actor_and_missing_email(self, mock_send):
        tenant = MagicMock()
        tenant.notify_issue_observers_on_status_change = True
        tenant.schema_name = "xschedjuice"
        actor = MagicMock(id=1)
        obs_actor = MagicMock(id=1, email="a@x.com")
        obs_ok = MagicMock(id=2, email="b@x.com")
        obs_no_email = MagicMock(id=3, email="")
        entity = MagicMock()
        entity.observers.all.return_value = [obs_actor, obs_ok, obs_no_email]
        email_observers_on_status_change(
            tenant=tenant,
            entity=entity,
            actor=actor,
            subject="Status changed",
            body_html="<p>x</p>",
            toggle_attr="notify_issue_observers_on_status_change",
        )
        mock_send.assert_called_once()
        self.assertEqual(mock_send.call_args[0][3], "b@x.com")

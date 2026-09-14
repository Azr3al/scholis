from unittest.mock import patch

from django.test import SimpleTestCase

from app_auth.mobile_device_push import (
    SESSION_REVOKED_PUSH_TITLE,
    send_session_revoked_push,
    session_revoked_push_body,
)
from app_auth.session_revoked import (
    REVOKED_REASON_ADMIN_REVOKED,
    REVOKED_REASON_DEVICE_DISPLACED,
    REVOKED_REASON_SESSION_ROTATED,
)


class SessionRevokedPushTest(SimpleTestCase):
    @patch("app_utils.push_helpers.enqueue_push_for_user_ids")
    def test_send_device_displaced_push(self, mock_enqueue):
        user = type("User", (), {"id": 42})()

        send_session_revoked_push(user, REVOKED_REASON_DEVICE_DISPLACED)

        body = session_revoked_push_body(REVOKED_REASON_DEVICE_DISPLACED)
        mock_enqueue.assert_called_once_with(
            [42],
            title=SESSION_REVOKED_PUSH_TITLE,
            body=body,
            data={
                "type": "session_revoked",
                "reason": REVOKED_REASON_DEVICE_DISPLACED,
                "title": SESSION_REVOKED_PUSH_TITLE,
                "body": body,
            },
        )

    @patch("app_utils.push_helpers.enqueue_push_for_user_ids")
    def test_send_admin_revoked_push(self, mock_enqueue):
        user = type("User", (), {"id": 7})()

        send_session_revoked_push(user, REVOKED_REASON_ADMIN_REVOKED)

        body = session_revoked_push_body(REVOKED_REASON_ADMIN_REVOKED)
        mock_enqueue.assert_called_once_with(
            [7],
            title=SESSION_REVOKED_PUSH_TITLE,
            body=body,
            data={
                "type": "session_revoked",
                "reason": REVOKED_REASON_ADMIN_REVOKED,
                "title": SESSION_REVOKED_PUSH_TITLE,
                "body": body,
            },
        )

    @patch("app_utils.push_helpers.enqueue_push_for_user_ids")
    def test_session_rotated_does_not_enqueue_push(self, mock_enqueue):
        user = type("User", (), {"id": 1})()

        send_session_revoked_push(user, REVOKED_REASON_SESSION_ROTATED)

        mock_enqueue.assert_not_called()

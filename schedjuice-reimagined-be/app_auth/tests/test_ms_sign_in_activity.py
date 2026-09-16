from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_auth.ms_sign_in_activity import fetch_sign_in_activity_for_users


class FetchSignInActivityTests(SimpleTestCase):
    @patch("app_auth.ms_sign_in_activity.MSUser")
    def test_returns_last_sign_in_for_linked_users(self, mock_ms_cls):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "signInActivity": {"lastSignInDateTime": "2026-07-01T10:00:00Z"}
        }
        mock_ms_cls.return_value.get_sign_in_activity.return_value = mock_response

        tenant = SimpleNamespace(is_microsoft_on=True)
        user = SimpleNamespace(microsoft_id="ms-uuid-1")
        result = fetch_sign_in_activity_for_users(tenant, {101: user})

        self.assertEqual(result["101"]["last_sign_in"], "2026-07-01T10:00:00Z")

    def test_returns_empty_when_ms_off(self):
        tenant = SimpleNamespace(is_microsoft_on=False)
        result = fetch_sign_in_activity_for_users(
            tenant, {101: SimpleNamespace(microsoft_id="x")}
        )
        self.assertEqual(result, {})

    @patch("app_auth.ms_sign_in_activity.MSUser")
    def test_not_linked_users(self, mock_ms_cls):
        tenant = SimpleNamespace(is_microsoft_on=True)
        user = SimpleNamespace(microsoft_id=None)
        result = fetch_sign_in_activity_for_users(tenant, {101: user})
        self.assertEqual(result["101"]["error"], "not_linked")

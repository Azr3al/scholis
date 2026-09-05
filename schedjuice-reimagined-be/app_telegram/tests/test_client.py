from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings
from cryptography.fernet import Fernet

from app_telegram.client import TelegramApiError, TelegramClient

KEY = Fernet.generate_key().decode()

class _Org:
    def get_telegram_bot_token(self):
        return "123:abc"

@override_settings(TELEGRAM_TOKEN_ENCRYPTION_KEY=KEY)
class TelegramClientTests(TestCase):
    def _client(self):
        return TelegramClient(_Org())

    @patch("app_telegram.client.requests.post")
    def test_api_error_raises(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=400,
            json=lambda: {"ok": False, "description": "Bad Request: chat not found"},
        )
        with self.assertRaises(TelegramApiError):
            self._client().send_message(-1, "x")

    @patch("app_telegram.client.requests.post")
    def test_send_message_retries_without_parse_mode_on_entity_error(self, mock_post):
        mock_post.side_effect = [
            MagicMock(
                status_code=400,
                json=lambda: {
                    "ok": False,
                    "description": "Bad Request: can't parse entities",
                },
            ),
            MagicMock(
                status_code=200,
                json=lambda: {"ok": True, "result": {"message_id": 8}},
            ),
        ]
        res = self._client().send_message(-100123, "<bad>html")
        self.assertEqual(res["message_id"], 8)
        self.assertEqual(mock_post.call_count, 2)
        self.assertNotIn(
            "parse_mode", mock_post.call_args_list[1][1]["json"]
        )
        self.assertTrue(
            mock_post.call_args_list[1][1]["json"]["disable_web_page_preview"]
        )

    @patch("app_telegram.client.requests.post")
    def test_edit_message_text_retries_without_parse_mode_on_entity_error(self, mock_post):
        mock_post.side_effect = [
            MagicMock(
                status_code=400,
                json=lambda: {
                    "ok": False,
                    "description": "Bad Request: can't parse entities",
                },
            ),
            MagicMock(
                status_code=200,
                json=lambda: {"ok": True, "result": {"message_id": 10}},
            ),
        ]
        res = self._client().edit_message_text(-100123, 10, "<bad>html")
        self.assertEqual(res["message_id"], 10)
        self.assertEqual(mock_post.call_count, 2)
        self.assertNotIn(
            "parse_mode", mock_post.call_args_list[1][1]["json"]
        )
        self.assertTrue(
            mock_post.call_args_list[1][1]["json"]["disable_web_page_preview"]
        )

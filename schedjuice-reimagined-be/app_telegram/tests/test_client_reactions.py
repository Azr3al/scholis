from unittest.mock import patch

from django.test import TestCase

from app_telegram.client import TelegramApiError, TelegramClient

class TelegramClientReactionTests(TestCase):

    @patch.object(TelegramClient, "_call")
    def test_set_message_reaction_retries_with_fallback(self, mock_call):
        org = type("Org", (), {"get_telegram_bot_token": lambda self: "tok"})()
        client = TelegramClient(org)
        mock_call.side_effect = [
            TelegramApiError("setMessageReaction", "invalid emoji"),
            {"ok": True},
        ]
        client.set_message_reaction(123, 456, "🧐")
        self.assertEqual(mock_call.call_count, 2)
        self.assertEqual(
            mock_call.call_args_list[1][0][1]["reaction"],
            [{"type": "emoji", "emoji": "👀"}],
        )


from unittest.mock import MagicMock, patch

import certifi
from django.test import SimpleTestCase, override_settings

from app_utils.ops_discord_helpers import (
    mask_discord_webhook_url,
    resolve_discord_webhook_url,
    send_discord_webhook_message,
)


class ResolveDiscordWebhookTests(SimpleTestCase):
    @override_settings(DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/env/envtok")
    @patch("app_utils.ops_discord_helpers._get_db_webhook_url", return_value="")
    def test_falls_back_to_env(self, _mock_db):
        self.assertEqual(
            resolve_discord_webhook_url(),
            "https://discord.com/api/webhooks/env/envtok",
        )

    @override_settings(DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/env/envtok")
    @patch(
        "app_utils.ops_discord_helpers._get_db_webhook_url",
        return_value="https://discord.com/api/webhooks/db/dbtok",
    )
    def test_db_overrides_env(self, _mock_db):
        self.assertEqual(
            resolve_discord_webhook_url(),
            "https://discord.com/api/webhooks/db/dbtok",
        )

    def test_mask_hides_token(self):
        url = "https://discord.com/api/webhooks/123456789012345678/AbCdEfGhIjKlMnOpQrStUvWxYz"
        masked = mask_discord_webhook_url(url)
        self.assertIn("123456789012345678", masked)
        self.assertNotIn("AbCdEfGhIjKlMnOpQrStUvWxYz", masked)
        self.assertIn("…", masked)


class SendDiscordWebhookTests(SimpleTestCase):
    @patch("app_utils.ops_discord_helpers.requests.post")
    def test_send_uses_certifi_bundle(self, mock_post):
        mock_post.return_value = MagicMock(status_code=204, text="")
        url = "https://discord.com/api/webhooks/1/token"
        send_discord_webhook_message(url, "hello")
        mock_post.assert_called_once_with(
            url,
            json={"content": "hello"},
            timeout=15,
            verify=certifi.where(),
        )

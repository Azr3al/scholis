from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import certifi
from django.test import SimpleTestCase, override_settings

from app_utils.ops_discord import notify_discord_ops_embed
from app_utils.ops_discord_helpers import send_discord_webhook_message


class SendDiscordWebhookTests(SimpleTestCase):
    @patch("app_utils.ops_discord_helpers.requests.post")
    def test_send_with_embeds(self, mock_post):
        mock_post.return_value = MagicMock(status_code=204, text="")
        url = "https://discord.com/api/webhooks/1/token"
        embed = {"title": "Test", "color": 123, "fields": []}
        send_discord_webhook_message(url, embeds=[embed])
        mock_post.assert_called_once_with(
            url,
            json={"embeds": [embed]},
            timeout=15,
            verify=certifi.where(),
        )

    @patch("app_utils.ops_discord_helpers.requests.post")
    def test_send_content_only_backward_compatible(self, mock_post):
        mock_post.return_value = MagicMock(status_code=204, text="")
        url = "https://discord.com/api/webhooks/1/token"
        send_discord_webhook_message(url, "hello")
        mock_post.assert_called_once_with(
            url,
            json={"content": "hello"},
            timeout=15,
            verify=certifi.where(),
        )


class NotifyDiscordOpsEmbedTests(SimpleTestCase):
    @override_settings(DEBUG=True)
    @patch("app_utils.ops_discord.send_discord_webhook_message")
    @patch("app_utils.ops_discord.resolve_discord_webhook_url", return_value="https://discord.com/api/webhooks/1/t")
    def test_posts_embed_with_multi_tenant_footer(self, _mock_url, mock_send):
        org_a = SimpleNamespace(name="Schedjuice", schema_name="xschedjuice")
        org_b = SimpleNamespace(name="Testing Org", schema_name="xschedjuicethihanet")
        notify_discord_ops_embed(
            "[Schedjuice] Cron health: MISSED",
            [
                {"name": "Command", "value": "`alert-payment-assignment-gaps`", "inline": True},
                {"name": "Affected tenants", "value": "Schedjuice, Testing Org", "inline": False},
            ],
            severity="missed",
            tenants=[org_a, org_b],
        )
        mock_send.assert_called_once()
        _url, _content = mock_send.call_args[0]
        kwargs = mock_send.call_args.kwargs
        embeds = kwargs["embeds"]
        self.assertEqual(len(embeds), 1)
        self.assertIn("Cron health: MISSED", embeds[0]["title"])
        self.assertIn("xschedjuice", embeds[0]["footer"]["text"])
        self.assertIn("xschedjuicethihanet", embeds[0]["footer"]["text"])

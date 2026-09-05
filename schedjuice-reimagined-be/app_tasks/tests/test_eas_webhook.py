"""Tests for EAS BUILD/SUBMIT webhook relay → Discord."""

from __future__ import annotations

import hashlib
import hmac
import json
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings
from django.core.cache import cache
from rest_framework.test import APIClient

from app_utils.eas_webhook import (
    claim_eas_webhook_delivery,
    eas_webhook_dedupe_key,
    fetch_eas_build_metadata,
    format_submit_discord_embed,
    release_eas_webhook_delivery,
    should_notify_build,
    verify_expo_signature,
)

_TEST_SECRET = "test-eas-webhook-secret-min16"
_TEST_DISCORD = "https://discord.com/api/webhooks/123456789012345678/AbCdEfGhIjKlMnOpQrStUvWxYz"

def _sign(body: bytes, secret: str = _TEST_SECRET) -> str:
    digest = hmac.new(secret.encode(), body, hashlib.sha1).hexdigest()
    return f"sha1={digest}"

def _sample_build_payload(*, profile: str = "production") -> dict:
    return {
        "id": "147a3212-49fd-446f-b4e3-a6519acf264a",
        "platform": "android",
        "status": "finished",
        "buildDetailsPageUrl": "https://expo.dev/accounts/schedjuice/projects/schedjuice-reimagined-mobile/builds/147a3212",
        "artifacts": {"buildUrl": "https://expo.dev/artifacts/eas/example.aab"},
        "metadata": {
            "buildProfile": profile,
            "appName": "Schedjuice",
            "appVersion": "1.2.0",
            "appBuildVersion": "73",
            "gitCommitMessage": "feat: mobile release",
        },
    }

class EasWebhookSignatureTests(SimpleTestCase):

    def test_verify_rejects_invalid_signature(self):
        body = b'{"status":"finished"}'
        self.assertFalse(verify_expo_signature(body, "sha1=deadbeef", _TEST_SECRET))

    def test_verify_rejects_missing_header(self):
        self.assertFalse(verify_expo_signature(b"{}", None, _TEST_SECRET))

class EasWebhookFilterTests(SimpleTestCase):

    def test_dev_preview_skipped(self):
        self.assertFalse(should_notify_build(_sample_build_payload(profile="development")))
        self.assertFalse(should_notify_build(_sample_build_payload(profile="preview")))

class EasWebhookDedupeTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def test_claim_allows_first_delivery_only(self):
        payload = _sample_build_payload()
        self.assertTrue(claim_eas_webhook_delivery("BUILD", payload))
        self.assertFalse(claim_eas_webhook_delivery("BUILD", payload))

    def test_release_allows_retry_after_discord_failure(self):
        payload = _sample_build_payload()
        self.assertTrue(claim_eas_webhook_delivery("BUILD", payload))
        release_eas_webhook_delivery("BUILD", payload)
        self.assertTrue(claim_eas_webhook_delivery("BUILD", payload))

def _sample_submit_payload(*, turtle_build_id: str = "8c84111e-6d39-449c-9895-071d85fd3e61") -> dict:
    return {
        "id": "0374430d-7776-44ad-be7d-8513629adc54",
        "platform": "ios",
        "status": "finished",
        "turtleBuildId": turtle_build_id,
        "submissionDetailsPageUrl": "https://expo.dev/accounts/schedjuice/projects/schedjuice-reimagined-mobile/submissions/0374430d",
    }

class EasWebhookSubmitEmbedTests(SimpleTestCase):
    @patch("app_utils.eas_webhook.fetch_eas_build_metadata")
    def test_submit_embed_includes_profile_from_build_lookup(self, mock_lookup):
        mock_lookup.return_value = {
            "buildProfile": "production",
            "appName": "Schedjuice",
            "appVersion": "1.2.0",
            "appBuildVersion": "73",
            "platform": "ios",
        }
        embed = format_submit_discord_embed(_sample_submit_payload())
        field_names = {f["name"] for f in embed["fields"]}
        self.assertIn("Profile", field_names)
        profile_field = next(f for f in embed["fields"] if f["name"] == "Profile")
        self.assertEqual(profile_field["value"], "production")
        self.assertIn("production", embed["title"])
        mock_lookup.assert_called_once_with("8c84111e-6d39-449c-9895-071d85fd3e61")

    @patch("app_utils.eas_webhook.fetch_eas_build_metadata", return_value=None)
    def test_submit_embed_falls_back_when_lookup_missing(self, mock_lookup):
        embed = format_submit_discord_embed(_sample_submit_payload())
        profile_field = next(f for f in embed["fields"] if f["name"] == "Profile")
        self.assertEqual(profile_field["value"], "—")
        self.assertIn("ios", embed["title"].lower())
        mock_lookup.assert_called_once()

    @override_settings(EXPO_TOKEN="")
    def test_fetch_eas_build_metadata_without_token(self):
        self.assertIsNone(fetch_eas_build_metadata("8c84111e-6d39-449c-9895-071d85fd3e61"))

@override_settings(
    EAS_WEBHOOK_SECRET=_TEST_SECRET,
    EAS_DISCORD_WEBHOOK_URL=_TEST_DISCORD,
)
class EasBuildWebhookViewTests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()
        cache.clear()

    def tearDown(self):
        cache.clear()

    def _post_build(self, payload: dict, *, signature: str | None = None):
        body = json.dumps(payload).encode()
        headers = {}
        if signature is not None:
            headers["HTTP_EXPO_SIGNATURE"] = signature
        elif signature is None:
            headers["HTTP_EXPO_SIGNATURE"] = _sign(body)
        return self.client.post(
            "/api/v1/webhooks/eas/build/",
            data=body,
            content_type="application/json",
            **headers,
        )

    @patch("app_tasks.eas_webhook_views.notify_eas_discord")
    def test_build_webhook_skips_duplicate_delivery(self, mock_notify):
        payload = _sample_build_payload()
        first = self._post_build(payload)
        second = self._post_build(payload)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        mock_notify.assert_called_once()

    @patch("app_tasks.eas_webhook_views.notify_eas_discord")
    def test_build_webhook_skips_development(self, mock_notify):
        response = self._post_build(_sample_build_payload(profile="development"))
        self.assertEqual(response.status_code, 200)
        mock_notify.assert_not_called()

    def test_build_webhook_rejects_bad_signature(self):
        response = self._post_build(_sample_build_payload(), signature="sha1=bad")
        self.assertEqual(response.status_code, 401)

    @override_settings(EAS_WEBHOOK_SECRET="")
    def test_build_webhook_503_when_secret_unset(self):
        response = self._post_build(_sample_build_payload())
        self.assertEqual(response.status_code, 503)

@override_settings(
    EAS_WEBHOOK_SECRET=_TEST_SECRET,
    EAS_DISCORD_WEBHOOK_URL="",
)
class EasBuildWebhookDiscordUnsetTests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("app_utils.eas_webhook.send_discord_webhook_message")
    def test_build_webhook_ok_when_discord_url_unset(self, mock_send):
        payload = _sample_build_payload()
        body = json.dumps(payload).encode()
        response = self.client.post(
            "/api/v1/webhooks/eas/build/",
            data=body,
            content_type="application/json",
            HTTP_EXPO_SIGNATURE=_sign(body),
        )
        self.assertEqual(response.status_code, 200)
        mock_send.assert_not_called()

@override_settings(
    EAS_WEBHOOK_SECRET=_TEST_SECRET,
    EAS_DISCORD_WEBHOOK_URL=_TEST_DISCORD,
)
class EasSubmitWebhookViewTests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("app_tasks.eas_webhook_views.notify_eas_discord", side_effect=RuntimeError("Discord down"))
    def test_submit_webhook_discord_failure_returns_502(self, _mock_notify):
        payload = {
            "id": "0374430d-7776-44ad-be7d-8513629adc54",
            "platform": "android",
            "status": "finished",
            "submissionDetailsPageUrl": "https://expo.dev/example",
        }
        body = json.dumps(payload).encode()
        response = self.client.post(
            "/api/v1/webhooks/eas/submit/",
            data=body,
            content_type="application/json",
            HTTP_EXPO_SIGNATURE=_sign(body),
        )
        self.assertEqual(response.status_code, 502)

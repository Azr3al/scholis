"""Tests for Zoom OAuth helpers (state signing, token refresh)."""
from datetime import timedelta
from unittest.mock import MagicMock, patch

from cryptography.fernet import Fernet
from django.test import SimpleTestCase, override_settings
from django.utils import timezone

from app_organization.models import ZoomAccount
from app_zoom.oauth import (
    OAuthStateError,
    ZoomOAuthError,
    build_state_token,
    get_valid_access_token,
    parse_state_token,
    refresh_access_token,
)

@override_settings(
    ZOOM_OAUTH_STATE_TTL_SECONDS=600,
)
class OAuthStateTest(SimpleTestCase):

    def test_tampered_token_rejected(self):
        token = build_state_token(
            {"schema_name": "xfoo", "user_id": 7, "purpose": "connect"}
        )
        with self.assertRaises(OAuthStateError) as ctx:
            parse_state_token(token + "x")
        self.assertIn("invalid", str(ctx.exception).lower())

@override_settings(
    ZOOM_OAUTH_CLIENT_ID="cid",
    ZOOM_OAUTH_CLIENT_SECRET="csecret",
    ZOOM_OAUTH_REDIRECT_URL="https://app.example/callback",
    ZOOM_TOKEN_ENCRYPTION_KEY=Fernet.generate_key().decode(),
)
class OAuthRefreshTest(SimpleTestCase):
    """Use Mocks for ``ZoomAccount`` so tests run without PostgreSQL."""

    @patch("app_zoom.oauth._post_token")
    def test_refresh_persists_new_tokens(self, mock_post):
        mock_post.return_value = {
            "access_token": "AT2",
            "refresh_token": "RT2",
            "expires_in": 3600,
        }
        za = MagicMock(spec=ZoomAccount)
        za.refresh_token = "OLD_RT"
        za.status = ZoomAccount.Status.ACTIVE
        za.save = MagicMock()
        za.set_tokens = MagicMock()

        new_token = refresh_access_token(za)
        self.assertEqual(new_token, "AT2")
        za.set_tokens.assert_called_once()
        kw = za.set_tokens.call_args.kwargs
        self.assertEqual(kw["access_token"], "AT2")
        self.assertEqual(kw["refresh_token"], "RT2")
        self.assertIsNotNone(kw.get("expires_at"))

    @patch("app_zoom.oauth.refresh_access_token")
    def test_get_valid_access_token_skips_refresh_when_fresh(self, mock_refresh):
        za = MagicMock()
        za.access_token = "FRESH"
        za.expires_at = timezone.now() + timedelta(hours=1)
        t = get_valid_access_token(za)
        self.assertEqual(t, "FRESH")
        mock_refresh.assert_not_called()

    @patch("app_zoom.oauth.refresh_access_token")
    def test_get_valid_access_token_calls_refresh_when_expired(self, mock_refresh):
        mock_refresh.return_value = "NEW_AT"
        za = MagicMock()
        za.access_token = "OLD"
        za.expires_at = timezone.now() - timedelta(minutes=5)
        t = get_valid_access_token(za)
        self.assertEqual(t, "NEW_AT")
        mock_refresh.assert_called_once_with(za)

    @patch("app_zoom.oauth._post_token")
    def test_refresh_no_refresh_token_marks_needs_reconnect(self, mock_post):
        za = MagicMock(spec=ZoomAccount)
        za.refresh_token = ""
        za.status = ZoomAccount.Status.ACTIVE
        za.save = MagicMock()

        with self.assertRaises(ZoomOAuthError):
            refresh_access_token(za)

        self.assertEqual(za.status, ZoomAccount.Status.NEEDS_RECONNECT)
        za.save.assert_called()
        mock_post.assert_not_called()

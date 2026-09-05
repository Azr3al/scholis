from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch
from urllib.parse import parse_qs, urlparse

from cryptography.fernet import Fernet
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_auth.models_user_google_calendar_oauth import UserGoogleCalendarOAuth
from app_google.calendar import BusyBlock, create_consultation_event, fetch_free_busy
from app_google.oauth import (
    CALENDAR_LINK_OAUTH_SCOPES,
    build_calendar_link_authorize_url,
    build_state_token,
)
from app_organization.models import Organization

GOOGLE_OAUTH_SETTINGS = {
    "GOOGLE_OAUTH_CLIENT_ID": "test-web.apps.googleusercontent.com",
    "GOOGLE_OAUTH_CLIENT_SECRET": "test-secret",
    "GOOGLE_OAUTH_REDIRECT_URL": "http://testserver/api/v1/google/oauth/callback",
    "GOOGLE_TOKEN_ENCRYPTION_KEY": Fernet.generate_key().decode(),
}


@override_settings(**GOOGLE_OAUTH_SETTINGS)
class GoogleCalendarOAuthTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=cls.schema_name)
            org.is_google_on = True
            org.save()
            cls.domain_url = org.domain_url

    def setUp(self):
        self.client = APIClient()

    def _return_origin(self) -> str:
        return f"https://{self.domain_url}"

    def test_calendar_link_authorize_url_scopes_and_offline_access(self):
        url = build_calendar_link_authorize_url("signed-state")
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        self.assertIn("accounts.google.com", parsed.netloc)
        self.assertEqual(params["scope"][0], CALENDAR_LINK_OAUTH_SCOPES)
        self.assertEqual(params["access_type"][0], "offline")
        self.assertEqual(params["prompt"][0], "consent")
        self.assertEqual(params["state"][0], "signed-state")

    def test_calendar_link_start_returns_authorize_url(self):
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")

        self.client.force_authenticate(user=user)
        res = self.client.get(
            reverse("google-oauth-calendar-link-start"),
            {
                "return_origin": self._return_origin(),
                "return_path": "/organizations/profile",
            },
            HTTP_TENANT=self.schema_name,
        )
        self.assertEqual(res.status_code, 200, res.content)
        authorize_url = res.data["authorize_url"]
        params = parse_qs(urlparse(authorize_url).query)
        self.assertEqual(params["access_type"][0], "offline")
        self.assertIn("calendar.events", params["scope"][0])

    @patch("app_google.oauth_views.link_google_calendar")
    @patch("app_google.oauth_views.exchange_code")
    def test_callback_calendar_link_success(self, mock_exchange, mock_link):
        mock_exchange.return_value = {
            "access_token": "access",
            "refresh_token": "refresh",
            "expires_in": 3600,
            "id_token": "google-id-token",
        }
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
        with schema_context(get_public_schema_name()):
            org_id = Organization.objects.get(schema_name=self.schema_name).id

        state = build_state_token(
            {
                "purpose": "calendar-link",
                "schema_name": self.schema_name,
                "organization_id": org_id,
                "return_origin": self._return_origin(),
                "return_path": "/organizations/profile",
                "schedjuice_user_id": user.id,
            }
        )
        res = self.client.get(
            reverse("google-oauth-callback"),
            {"code": "auth-code", "state": state},
        )
        self.assertEqual(res.status_code, 302)
        self.assertIn("google_oauth=success", res["Location"])
        mock_exchange.assert_called_once_with("auth-code", require_id_token=False)
        mock_link.assert_called_once()

    @patch("app_google.calendar.requests.post")
    @patch("app_google.calendar.get_valid_access_token")
    def test_fetch_free_busy_parses_busy_blocks(self, mock_token, mock_post):
        mock_token.return_value = "access-token"
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {
                "calendars": {
                    "primary": {
                        "busy": [
                            {
                                "start": "2026-08-06T11:00:00Z",
                                "end": "2026-08-06T11:30:00Z",
                            },
                            {
                                "start": "2026-08-06T13:00:00Z",
                                "end": "2026-08-06T14:00:00Z",
                            },
                        ]
                    }
                }
            },
        )
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
            oauth_row = UserGoogleCalendarOAuth.objects.create(
                user=user,
                status=UserGoogleCalendarOAuth.Status.ACTIVE,
            )
            oauth_row.set_tokens(
                access_token="stored-access",
                refresh_token="stored-refresh",
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            )

            blocks = fetch_free_busy(
                user,
                datetime(2026, 8, 6, 0, 0, tzinfo=timezone.utc),
                datetime(2026, 8, 6, 23, 59, tzinfo=timezone.utc),
            )

        self.assertEqual(len(blocks), 2)
        self.assertIsInstance(blocks[0], BusyBlock)
        self.assertEqual(blocks[0].start, datetime(2026, 8, 6, 11, 0, tzinfo=timezone.utc))
        self.assertEqual(blocks[1].end, datetime(2026, 8, 6, 14, 0, tzinfo=timezone.utc))
        payload = mock_post.call_args.kwargs["json"]
        self.assertEqual(payload["items"], [{"id": "primary"}])

    @patch("app_google.calendar.requests.post")
    @patch("app_google.calendar.get_valid_access_token")
    def test_create_consultation_event_returns_meet_link(self, mock_token, mock_post):
        mock_token.return_value = "access-token"
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {
                "id": "evt-123",
                "hangoutLink": "https://meet.google.com/abc-defg-hij",
            },
        )
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
            oauth_row = UserGoogleCalendarOAuth.objects.create(
                user=user,
                status=UserGoogleCalendarOAuth.Status.ACTIVE,
            )
            oauth_row.set_tokens(
                access_token="stored-access",
                refresh_token="stored-refresh",
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            )

            result = create_consultation_event(
                user,
                scheduled_at=datetime(2026, 8, 6, 12, 0, tzinfo=timezone.utc),
                duration_minutes=30,
                student_name="Alex Student",
                student_email="alex@example.com",
            )

        self.assertEqual(result["event_id"], "evt-123")
        self.assertEqual(result["meeting_link"], "https://meet.google.com/abc-defg-hij")

        body = mock_post.call_args.kwargs["json"]
        self.assertEqual(body["summary"], "Consultation with Alex Student")
        self.assertEqual(body["attendees"][0]["email"], "alex@example.com")
        self.assertEqual(body["conferenceData"]["createRequest"]["conferenceSolutionKey"]["type"], "hangoutsMeet")
        self.assertIn("conferenceDataVersion=1", mock_post.call_args.args[0])

    @patch("app_google.calendar.requests.post")
    @patch("app_google.calendar.get_valid_access_token")
    def test_create_consultation_event_sets_booking_extended_property(
        self, mock_token, mock_post
    ):
        mock_token.return_value = "access-token"
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {
                "id": "evt-456",
                "hangoutLink": "https://meet.google.com/abc-defg-hij",
            },
        )
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
            oauth_row = UserGoogleCalendarOAuth.objects.create(
                user=user,
                status=UserGoogleCalendarOAuth.Status.ACTIVE,
            )
            oauth_row.set_tokens(
                access_token="stored-access",
                refresh_token="stored-refresh",
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            )

            create_consultation_event(
                user,
                scheduled_at=datetime(2026, 8, 6, 12, 0, tzinfo=timezone.utc),
                duration_minutes=30,
                student_name="Alex Student",
                student_email="alex@example.com",
                booking_id=42,
            )

        body = mock_post.call_args.kwargs["json"]
        self.assertEqual(
            body["extendedProperties"]["private"]["schedjuice_booking_id"],
            "42",
        )

    @patch("app_google.calendar.requests.get")
    @patch("app_google.calendar.get_valid_access_token")
    def test_get_calendar_event_returns_none_for_404(self, mock_token, mock_get):
        mock_token.return_value = "access-token"
        mock_get.return_value = MagicMock(status_code=404)
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
            oauth_row = UserGoogleCalendarOAuth.objects.create(
                user=user,
                status=UserGoogleCalendarOAuth.Status.ACTIVE,
            )
            oauth_row.set_tokens(
                access_token="stored-access",
                refresh_token="stored-refresh",
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            )

            from app_google.calendar import get_calendar_event

            self.assertIsNone(get_calendar_event(user, "missing-event"))

    @patch("app_google.calendar_linking.verify_google_id_token")
    def test_link_google_calendar_stores_encrypted_refresh_token(self, mock_verify):
        mock_verify.return_value = {
            "email": "consultant@gmail.com",
            "email_verified": True,
            "name": "Consultant",
        }
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
            from app_google.calendar_linking import link_google_calendar

            row = link_google_calendar(
                user,
                {
                    "access_token": "new-access",
                    "refresh_token": "new-refresh",
                    "expires_in": 3600,
                    "id_token": "id-token",
                },
                org=org,
            )
            self.assertEqual(row.status, UserGoogleCalendarOAuth.Status.ACTIVE)
            self.assertEqual(row.authorized_email, "consultant@gmail.com")
            self.assertEqual(row.refresh_token, "new-refresh")
            self.assertNotEqual(row.refresh_token_ct, "new-refresh")


def _jwt_token_user(email: str):
    return type(
        "TokenUser",
        (),
        {"id": email, "is_authenticated": True},
    )()


@override_settings(**GOOGLE_OAUTH_SETTINGS)
class GoogleCalendarUnlinkTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(self.schema_name):
            self.user = User.objects.get(email="james@schedjuice.com")
            UserGoogleCalendarOAuth.objects.update_or_create(
                user=self.user,
                defaults={
                    "status": UserGoogleCalendarOAuth.Status.ACTIVE,
                    "authorized_email": self.user.email,
                },
            )

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_unlink_with_jwt_token_user(self):
        token_user = _jwt_token_user(self.user.email)
        res = self._client(token_user).post(
            reverse("google-calendar-unlink"),
            {},
        )
        self.assertEqual(res.status_code, 200, res.content)
        with schema_context(self.schema_name):
            oauth_row = UserGoogleCalendarOAuth.objects.get(user=self.user)
        self.assertEqual(oauth_row.status, UserGoogleCalendarOAuth.Status.DISCONNECTED)
        self.assertEqual(oauth_row.authorized_email, "")

    def test_unlink_rejects_not_connected(self):
        with schema_context(self.schema_name):
            UserGoogleCalendarOAuth.objects.filter(user=self.user).delete()
        token_user = _jwt_token_user(self.user.email)
        res = self._client(token_user).post(
            reverse("google-calendar-unlink"),
            {},
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("not connected", res.data["message"].lower())

    @patch("app_google.calendar_channel.stop_push_channel")
    @patch("app_google.calendar_channel.get_push_channel")
    def test_unlink_stops_and_deletes_push_channel(self, mock_get_channel, mock_stop):
        from app_organization.models import GoogleCalendarPushChannel

        with schema_context(get_public_schema_name()):
            channel = GoogleCalendarPushChannel.objects.create(
                tenant_schema=self.schema_name,
                consultant_user_id=self.user.id,
                channel_id="channel-123",
                resource_id="resource-456",
                expiration=datetime.now(timezone.utc) + timedelta(days=1),
            )
        mock_get_channel.return_value = channel

        token_user = _jwt_token_user(self.user.email)
        res = self._client(token_user).post(
            reverse("google-calendar-unlink"),
            {},
        )
        self.assertEqual(res.status_code, 200, res.content)
        mock_stop.assert_called_once_with(channel)
        with schema_context(get_public_schema_name()):
            self.assertFalse(
                GoogleCalendarPushChannel.objects.filter(pk=channel.pk).exists()
            )

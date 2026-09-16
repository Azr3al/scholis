from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from cryptography.fernet import Fernet
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone as dj_timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_auth.models_user_google_calendar_oauth import UserGoogleCalendarOAuth
from app_consultation.models import ConsultationBooking
from app_google.calendar_sync import sync_calendar_changes_for_channel
from app_organization.models import GoogleCalendarPushChannel, Organization

GOOGLE_OAUTH_SETTINGS = {
    "GOOGLE_OAUTH_CLIENT_ID": "test-web.apps.googleusercontent.com",
    "GOOGLE_OAUTH_CLIENT_SECRET": "test-secret",
    "GOOGLE_OAUTH_REDIRECT_URL": "http://testserver/api/v1/google/oauth/callback",
    "GOOGLE_TOKEN_ENCRYPTION_KEY": Fernet.generate_key().decode(),
    "GOOGLE_CALENDAR_WEBHOOK_BASE_URL": "https://api.example.com/api/v1/webhooks/google/calendar",
}


@override_settings(**GOOGLE_OAUTH_SETTINGS)
class GoogleCalendarSyncTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _create_oauth(self, user: User) -> UserGoogleCalendarOAuth:
        oauth_row = UserGoogleCalendarOAuth.objects.create(
            user=user,
            status=UserGoogleCalendarOAuth.Status.ACTIVE,
        )
        oauth_row.set_tokens(
            access_token="stored-access",
            refresh_token="stored-refresh",
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
        return oauth_row

    def _create_channel(self, user: User) -> GoogleCalendarPushChannel:
        with schema_context(get_public_schema_name()):
            return GoogleCalendarPushChannel.objects.create(
                channel_id="channel-sync-1",
                resource_id="resource-sync-1",
                tenant_schema=self.schema_name,
                consultant_user_id=user.id,
                expiration=dj_timezone.now() + timedelta(days=3),
                sync_token="old-sync-token",
            )

    @patch("app_google.calendar_sync.list_calendar_event_changes")
    def test_sync_cancelled_event_cancels_confirmed_booking(self, mock_list_changes):
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
            self._create_oauth(user)
            booking = ConsultationBooking.objects.create(
                consultant=user,
                scheduled_at=datetime(2026, 8, 6, 12, 0, tzinfo=timezone.utc),
                student_name="Student A",
                student_email="student@example.com",
                meeting_link="https://meet.google.com/abc-defg-hij",
                google_calendar_event_id="evt-cancelled",
                status=ConsultationBooking.Status.CONFIRMED,
            )
            channel = self._create_channel(user)

        mock_list_changes.return_value = (
            [
                {
                    "id": "evt-cancelled",
                    "status": "cancelled",
                    "extendedProperties": {
                        "private": {"schedjuice_booking_id": str(booking.id)},
                    },
                }
            ],
            "next-sync-token",
        )

        sync_calendar_changes_for_channel(channel.channel_id)

        with schema_context(self.schema_name):
            booking.refresh_from_db()
            self.assertEqual(booking.status, ConsultationBooking.Status.CANCELLED)
            self.assertEqual(
                booking.cancelled_by,
                ConsultationBooking.CancelledBy.CONSULTANT,
            )

        with schema_context(get_public_schema_name()):
            channel.refresh_from_db()
            self.assertEqual(channel.sync_token, "next-sync-token")

    @patch("app_google.calendar_sync.list_calendar_event_changes")
    def test_sync_cancelled_event_is_idempotent_for_already_cancelled_booking(
        self, mock_list_changes
    ):
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
            self._create_oauth(user)
            ConsultationBooking.objects.create(
                consultant=user,
                scheduled_at=datetime(2026, 8, 6, 12, 0, tzinfo=timezone.utc),
                student_name="Student A",
                student_email="student@example.com",
                meeting_link="https://meet.google.com/abc-defg-hij",
                google_calendar_event_id="evt-cancelled",
                status=ConsultationBooking.Status.CANCELLED,
                cancelled_by=ConsultationBooking.CancelledBy.CONSULTANT,
            )
            channel = self._create_channel(user)

        mock_list_changes.return_value = (
            [{"id": "evt-cancelled", "status": "cancelled"}],
            "next-sync-token",
        )

        sync_calendar_changes_for_channel(channel.channel_id)

        with schema_context(self.schema_name):
            self.assertEqual(
                ConsultationBooking.objects.filter(
                    google_calendar_event_id="evt-cancelled",
                    status=ConsultationBooking.Status.CANCELLED,
                ).count(),
                1,
            )

    @patch("app_google.calendar_sync.list_calendar_event_changes")
    def test_sync_ignores_unrelated_calendar_events(self, mock_list_changes):
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
            self._create_oauth(user)
            booking = ConsultationBooking.objects.create(
                consultant=user,
                scheduled_at=datetime(2026, 8, 6, 12, 0, tzinfo=timezone.utc),
                student_name="Student A",
                student_email="student@example.com",
                meeting_link="https://meet.google.com/abc-defg-hij",
                google_calendar_event_id="evt-confirmed",
                status=ConsultationBooking.Status.CONFIRMED,
            )
            channel = self._create_channel(user)

        mock_list_changes.return_value = (
            [{"id": "evt-personal", "status": "cancelled"}],
            "next-sync-token",
        )

        sync_calendar_changes_for_channel(channel.channel_id)

        with schema_context(self.schema_name):
            booking.refresh_from_db()
            self.assertEqual(booking.status, ConsultationBooking.Status.CONFIRMED)


@override_settings(**GOOGLE_OAUTH_SETTINGS)
class GoogleCalendarWebhookViewTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.client = APIClient()

    def _create_channel(self, user_id: int) -> GoogleCalendarPushChannel:
        with schema_context(get_public_schema_name()):
            return GoogleCalendarPushChannel.objects.create(
                channel_id="channel-webhook-1",
                resource_id="resource-webhook-1",
                tenant_schema=self.schema_name,
                consultant_user_id=user_id,
                expiration=dj_timezone.now() + timedelta(days=3),
            )

    def test_webhook_rejects_unknown_channel(self):
        res = self.client.post(
            "/api/v1/webhooks/google/calendar/notify/",
            {},
            format="json",
            HTTP_X_GOOG_CHANNEL_ID="missing-channel",
            HTTP_X_GOOG_RESOURCE_ID="resource-webhook-1",
            HTTP_X_GOOG_RESOURCE_STATE="exists",
        )
        self.assertEqual(res.status_code, 404)

    def test_webhook_rejects_resource_mismatch(self):
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
        self._create_channel(user.id)

        res = self.client.post(
            "/api/v1/webhooks/google/calendar/notify/",
            {},
            format="json",
            HTTP_X_GOOG_CHANNEL_ID="channel-webhook-1",
            HTTP_X_GOOG_RESOURCE_ID="wrong-resource",
            HTTP_X_GOOG_RESOURCE_STATE="exists",
        )
        self.assertEqual(res.status_code, 403)

    @patch("app_google.calendar_webhook_views.sync_calendar_changes_for_channel.delay")
    def test_webhook_enqueues_sync_for_exists_state(self, mock_delay):
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
        self._create_channel(user.id)

        res = self.client.post(
            "/api/v1/webhooks/google/calendar/notify/",
            {},
            format="json",
            HTTP_X_GOOG_CHANNEL_ID="channel-webhook-1",
            HTTP_X_GOOG_RESOURCE_ID="resource-webhook-1",
            HTTP_X_GOOG_RESOURCE_STATE="exists",
        )
        self.assertEqual(res.status_code, 200)
        mock_delay.assert_called_once_with("channel-webhook-1")

    @patch("app_google.calendar_channel.ensure_calendar_watch")
    def test_webhook_lazy_renews_near_expiry_channel(self, mock_ensure):
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
        with schema_context(get_public_schema_name()):
            GoogleCalendarPushChannel.objects.create(
                channel_id="channel-expiring",
                resource_id="resource-expiring",
                tenant_schema=self.schema_name,
                consultant_user_id=user.id,
                expiration=dj_timezone.now() + timedelta(hours=12),
            )

        res = self.client.post(
            "/api/v1/webhooks/google/calendar/notify/",
            {},
            format="json",
            HTTP_X_GOOG_CHANNEL_ID="channel-expiring",
            HTTP_X_GOOG_RESOURCE_ID="resource-expiring",
            HTTP_X_GOOG_RESOURCE_STATE="sync",
        )
        self.assertEqual(res.status_code, 200)
        mock_ensure.assert_called_once()

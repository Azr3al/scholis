import unittest
from datetime import date
from unittest.mock import patch
from uuid import uuid4

from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_announcement.models import Announcement, MicrosoftTeamsStatus, PostType
from app_auth.models import User
from app_course.models import Course
from app_microsoft.announcement_helpers import (
    TeamsSendResult,
    mark_teams_sync_sent,
)
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class AnnouncementResendTeamsViewTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.client = APIClient()
        with schema_context(self.schema_name):
            seed_rbac()
            self.user = User.objects.create_user(
                email=f"teacher-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.course = Course.objects.first()
            self.announcement = Announcement.objects.create(
                post_type=PostType.ANNOUNCEMENT,
                title="Test",
                data="<p>Hi</p>",
                html_data="<p>Hi</p>",
                course=self.course,
                created_by=self.user,
                send_to_microsoft=True,
                microsoft_teams_status=MicrosoftTeamsStatus.FAILED,
                microsoft_teams_error="Not sent to Teams yet",
            )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_TENANT=self.schema_name)

    def test_resend_rejects_when_not_marked_for_teams(self):
        with schema_context(self.schema_name):
            self.announcement.send_to_microsoft = False
            self.announcement.save(update_fields=["send_to_microsoft"])
        response = self.client.post(
            f"/api/v1/announcements/{self.announcement.id}/resend-to-teams",
        )

        self.assertEqual(response.status_code, 400)

    @patch("app_microsoft.announcement_helpers.send_announcement_to_teams_async.delay")
    @patch("app_microsoft.announcement_helpers.send_announcement_to_teams")
    def test_resend_sync_success_returns_200_and_sent_status(
        self, mock_send, mock_async_delay
    ):
        def _mark_sent(announcement, tenant, **kwargs):
            mark_teams_sync_sent(announcement)
            return TeamsSendResult.success()

        mock_send.side_effect = _mark_sent
        response = self.client.post(
            f"/api/v1/announcements/{self.announcement.id}/resend-to-teams",
        )

        self.assertEqual(response.status_code, 200)
        mock_async_delay.assert_not_called()
        with schema_context(self.schema_name):
            self.announcement.refresh_from_db()
            self.assertEqual(
                self.announcement.microsoft_teams_status,
                MicrosoftTeamsStatus.SENT,
            )

    @patch("app_microsoft.announcement_helpers.send_announcement_to_teams_async.delay")
    @patch("app_microsoft.announcement_helpers.send_announcement_to_teams")
    def test_resend_sync_failure_returns_400_and_failed_status(
        self, mock_send, mock_async_delay
    ):
        mock_send.return_value = TeamsSendResult.permanent("ACL check failed")
        response = self.client.post(
            f"/api/v1/announcements/{self.announcement.id}/resend-to-teams",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("ACL check failed", str(response.json().get("details", "")))
        mock_async_delay.assert_not_called()
        with schema_context(self.schema_name):
            self.announcement.refresh_from_db()
            self.assertEqual(
                self.announcement.microsoft_teams_status,
                MicrosoftTeamsStatus.FAILED,
            )

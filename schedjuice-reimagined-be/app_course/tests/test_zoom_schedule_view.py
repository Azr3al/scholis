"""Course Zoom schedule endpoint tests."""

from datetime import date, datetime, timedelta, timezone as py_timezone
from unittest.mock import patch
from uuid import uuid4

from cryptography.fernet import Fernet
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone as django_timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM
from app_auth.models import User
from app_course.models import Category, Course, Event, UserCourse
from app_course.program_helpers import get_default_program
from app_organization.models import Organization, ZoomAccount


@override_settings(ZOOM_TOKEN_ENCRYPTION_KEY=Fernet.generate_key().decode())
class CourseZoomScheduleViewTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        ensure_public_schema()
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(get_public_schema_name()):
            cls.org = Organization.objects.get(schema_name=cls.schema_name)
            Organization.objects.filter(pk=cls.org.pk).update(
                timezone="UTC",
                video_conferencing_platform=Organization.VideoConferencingPlatform.ZOOM,
            )
            cls.za = ZoomAccount.objects.create(
                organization=cls.org,
                account_id="ACCT1",
                default_host_zoom_user_id="HOST1",
                expires_at=django_timezone.now() + timedelta(hours=1),
            )
            cls.za.set_tokens(access_token="AT", refresh_token="RT")
        with schema_context(cls.schema_name):
            cls.cat = Category.objects.first() or Category.objects.create(name="CatZoom")
            cls.course = Course.objects.create(
                title=f"ZoomCourseT-{uuid4().hex[:6]}",
                description="D",
                code=f"ZX-{uuid4().hex[:6]}",
                category=cls.cat,
                program=get_default_program(),
                start_date=date(2026, 5, 1),
                end_date=date(2026, 6, 1),
                zoom_account_id="ACCT1",
            )
            Event.objects.create(
                title="Session 1",
                course=cls.course,
                date=datetime(2026, 5, 2, 0, 0, 0, tzinfo=py_timezone.utc),
                time_from="08:00",
                time_to="09:00",
            )
            cls.staff = User.objects.create_user(
                email=f"staff-{uuid4().hex[:6]}@n.example",
                password="pw-test-123",
                phone_number="1",
                communication_email=f"staff-{uuid4().hex[:6]}@n.example",
                name="Staff",
                date_of_birth=date(1990, 1, 1),
                code=f"czs-staff-{uuid4().hex[:6]}",
                roles=[User.UserRole.TEACHER],
            )
            UserCourse.objects.create(
                user=cls.staff,
                course=cls.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )

    def setUp(self):
        self.org = type(self).org
        self.za = type(self).za
        self.course = type(self).course
        self.staff = type(self).staff

    def _client(self):
        at = AccessToken.for_user(self.staff)
        at[JWT_TENANT_SCHEMA_CLAIM] = self.schema_name
        token = str(at)
        c = APIClient()
        c.credentials(
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        return c

    @patch("app_course.views.create_user_meeting")
    @patch("app_course.views.list_user_meetings")
    def test_schedule_no_conflict(self, mock_list, mock_create):
        mock_list.return_value = []
        mock_create.return_value = {
            "id": 12345,
            "uuid": "U==",
            "host_id": "HOST1",
            "join_url": "https://z/j/12345",
        }
        c = self._client()
        res = c.post(
            f"/api/v1/courses/{self.course.id}/zoom-meeting/schedule",
            {},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        with schema_context(self.schema_name):
            self.course.refresh_from_db()
            self.assertEqual(self.course.zoom_meeting_id, "12345")
            self.assertEqual(self.course.meeting_link, "https://z/j/12345")

    @patch("app_course.views.create_user_meeting")
    @patch("app_course.views.list_user_meetings")
    def test_schedule_conflict_blocks_until_force(self, mock_list, mock_create):
        mock_list.return_value = [
            {
                "id": 99,
                "topic": "Other",
                "start_time": "2026-05-02T08:30:00Z",
                "duration": 60,
            }
        ]
        c = self._client()
        res = c.post(
            f"/api/v1/courses/{self.course.id}/zoom-meeting/schedule",
            {},
            format="json",
        )
        self.assertEqual(res.status_code, 409)
        mock_create.assert_not_called()

        mock_create.return_value = {
            "id": 12345,
            "uuid": "U==",
            "host_id": "HOST1",
            "join_url": "https://z/j/12345",
        }
        res = c.post(
            f"/api/v1/courses/{self.course.id}/zoom-meeting/schedule",
            {"force": True},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        mock_create.assert_called_once()

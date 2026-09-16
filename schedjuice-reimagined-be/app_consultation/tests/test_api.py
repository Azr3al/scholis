import unittest
from calendar import monthrange
from datetime import date, datetime, time, timedelta
from unittest.mock import patch
from uuid import uuid4
from zoneinfo import ZoneInfo

from cryptography.fernet import Fernet
from django.core.cache import cache
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization

from app_auth.models import User
from app_auth.models_user_google_calendar_oauth import UserGoogleCalendarOAuth
from app_consultation.consultant_helpers import (
    generate_cancel_token,
    hash_cancel_token,
    sign_cancel_token,
)
from app_consultation.constants import slot_blocking_statuses
from app_consultation.models import ConsultationBooking
from app_consultation.presets import apply_lwtp_preset
from app_consultation.slot_generator import generate_consultation_slots
from app_consultation.strategies.lwtp import ClassPreference
from app_course.models import Subject
from app_rbac.seeding import seed_rbac

GOOGLE_OAUTH_SETTINGS = {
    "GOOGLE_OAUTH_CLIENT_ID": "test-web.apps.googleusercontent.com",
    "GOOGLE_OAUTH_CLIENT_SECRET": "test-secret",
    "GOOGLE_OAUTH_REDIRECT_URL": "http://testserver/api/v1/google/oauth/callback",
    "GOOGLE_TOKEN_ENCRYPTION_KEY": Fernet.generate_key().decode(),
    "JWT": "test-jwt-secret",
    "FRONTEND_BASE_URL": "https://app.example.com",
}


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _enable_org_consultation(schema_name: str) -> None:
    with schema_context(get_public_schema_name()):
        org = Organization.objects.get(schema_name=schema_name)
        org.is_consultation_booking_on = True
        org.save(update_fields=["is_consultation_booking_on"])


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(**GOOGLE_OAUTH_SETTINGS, RBAC_ENFORCE="enforce")
class ConsultationApiTests(TestCase):
    schema_name = "xschedjuice"
    org_tz = "Asia/Rangoon"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        _enable_org_consultation(cls.schema_name)

    def setUp(self):
        cache.clear()
        suffix = uuid4().hex[:8]
        self.slug = f"c_{suffix}"
        self.target_date = date(2026, 8, 10)
        with schema_context(self.schema_name):
            seed_rbac()
            self.consultant = User.objects.create_user(
                email=f"consult-{suffix}@example.com",
                password="x",
                name="Consultant Person",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"consult-{suffix}@example.com",
                code=f"consult-{suffix}",
                roles=["consultant"],
                consultation_booking_slug=self.slug,
                google_id=f"google-{suffix}",
            )
            self.teacher = User.objects.create_user(
                email=f"teacher-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"teacher-{suffix}@example.com",
                code=f"teacher-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            apply_lwtp_preset(self.consultant)
            UserGoogleCalendarOAuth.objects.create(
                user=self.consultant,
                authorized_email=self.consultant.email,
                status=UserGoogleCalendarOAuth.Status.ACTIVE,
            )
            self.consultant.refresh_from_db()
            self.cie_subject = Subject.objects.create(
                name="Mathematics",
                exam_board=Subject.ExamBoard.CIE,
            )
            self.edexcel_subject = Subject.objects.create(
                name="Biology",
                exam_board=Subject.ExamBoard.EDEXCEL,
            )
            Subject.objects.create(name="General English")

    def _public_client(self) -> APIClient:
        client = APIClient()
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        auth_user = type(
            "TokenUser",
            (),
            {
                "id": user.email,
                "is_authenticated": True,
                "roles": list(user.roles or []),
            },
        )()
        client.force_authenticate(user=auth_user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _fixed_now(self) -> datetime:
        tz = ZoneInfo(self.org_tz)
        return datetime.combine(
            self.target_date - timedelta(days=1),
            time(12, 0),
            tzinfo=tz,
        ).astimezone(ZoneInfo("UTC"))

    def _slot_at(self, hour: int, minute: int = 0) -> datetime:
        tz = ZoneInfo(self.org_tz)
        return datetime.combine(
            self.target_date,
            time(hour, minute),
            tzinfo=tz,
        ).astimezone(ZoneInfo("UTC"))

    def _lwtp_details(
        self,
        *,
        exam_board: str = "CIE",
        subject_ids: list[int] | None = None,
        subject_other: str = "",
        class_preference: str = ClassPreference.GROUP_CLASS,
        myanmar_name: str = "U Student",
    ) -> dict:
        if subject_ids is None:
            subject_ids = (
                [self.cie_subject.id]
                if exam_board == "CIE"
                else [self.edexcel_subject.id]
            )
        details = {
            "myanmar_name": myanmar_name,
            "class_preference": class_preference,
            "exam_board": exam_board,
            "subject_ids": subject_ids,
        }
        if subject_other:
            details["subject_other"] = subject_other
        return details

    def _booking_payload(self, scheduled_at: datetime, **details_overrides) -> dict:
        details = self._lwtp_details(**details_overrides)
        return {
            "scheduled_at": scheduled_at.isoformat().replace("+00:00", "Z"),
            "student_name": "Student A",
            "student_email": "student@example.com",
            "details": details,
        }

    @patch("app_consultation.availability.fetch_free_busy")
    def test_public_config_404_when_not_bookable(self, mock_fetch):
        mock_fetch.return_value = []
        with schema_context(self.schema_name):
            self.consultant.consultation_booking_slug = None
            self.consultant.save(update_fields=["consultation_booking_slug"])

        resp = self._public_client().get(
            f"{self.api_prefix}/consultation/public/{self.slug}/config"
        )
        self.assertEqual(resp.status_code, 404)

    @patch("app_consultation.availability.fetch_free_busy")
    def test_public_config_404_for_unknown_slug(self, mock_fetch):
        mock_fetch.return_value = []
        resp = self._public_client().get(
            f"{self.api_prefix}/consultation/public/does-not-exist/config"
        )
        self.assertEqual(resp.status_code, 404)

    @patch("app_consultation.availability.fetch_free_busy")
    def test_public_config_404_for_public_profile_slug(self, mock_fetch):
        mock_fetch.return_value = []
        with schema_context(self.schema_name):
            public_slug = f"p_{uuid4().hex[:8]}"
            self.consultant.public_profile_slug = public_slug
            self.consultant.save(update_fields=["public_profile_slug"])

        resp = self._public_client().get(
            f"{self.api_prefix}/consultation/public/{public_slug}/config"
        )
        self.assertEqual(resp.status_code, 404)

    def test_booking_link_generates_consultation_slug(self):
        with schema_context(self.schema_name):
            self.consultant.consultation_booking_slug = None
            self.consultant.save(update_fields=["consultation_booking_slug"])

        resp = self._client(self.consultant).get(
            f"{self.api_prefix}/consultation/me/booking-link"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        slug = resp.data["data"]["slug"]
        self.assertTrue(slug.startswith("c_"))
        self.assertNotIn("public_slug", resp.data["data"]["readiness"]["missing"])
        calendar = resp.data["data"]["google_calendar"]
        self.assertTrue(calendar["connected"])
        self.assertEqual(calendar["authorized_email"], self.consultant.email)

        with schema_context(self.schema_name):
            self.consultant.refresh_from_db()
            self.assertEqual(self.consultant.consultation_booking_slug, slug)

    def test_rotate_booking_link_invalidates_old_slug(self):
        old_slug = self.slug
        resp = self._client(self.consultant).post(
            f"{self.api_prefix}/consultation/me/booking-link/rotate",
            {},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        new_slug = resp.data["data"]["slug"]
        self.assertTrue(new_slug.startswith("c_"))
        self.assertNotEqual(new_slug, old_slug)

        with schema_context(self.schema_name):
            self.consultant.refresh_from_db()
            self.assertEqual(self.consultant.consultation_booking_slug, new_slug)

        old_config = self._public_client().get(
            f"{self.api_prefix}/consultation/public/{old_slug}/config"
        )
        self.assertEqual(old_config.status_code, 404)

        new_config = self._public_client().get(
            f"{self.api_prefix}/consultation/public/{new_slug}/config"
        )
        self.assertEqual(new_config.status_code, 200, new_config.content)

    @patch("app_consultation.availability.fetch_free_busy")
    def test_public_config_404_when_org_consultation_disabled(self, mock_fetch):
        mock_fetch.return_value = []
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_consultation_booking_on = False
            org.save(update_fields=["is_consultation_booking_on"])
        try:
            resp = self._public_client().get(
                f"{self.api_prefix}/consultation/public/{self.slug}/config"
            )
            self.assertEqual(resp.status_code, 404)
        finally:
            with schema_context(get_public_schema_name()):
                org = Organization.objects.get(schema_name=self.schema_name)
                org.is_consultation_booking_on = True
                org.save(update_fields=["is_consultation_booking_on"])

    @patch("app_consultation.availability.fetch_free_busy")
    def test_public_config_ok_for_bookable_consultant(self, mock_fetch):
        mock_fetch.return_value = []
        resp = self._public_client().get(
            f"{self.api_prefix}/consultation/public/{self.slug}/config"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.data["data"]
        self.assertEqual(data["name"], "Consultant Person")
        self.assertEqual(data["slot_duration_minutes"], 30)
        self.assertTrue(data["timezone"])
        self.assertEqual(data["consultation_strategy"], Organization.ConsultationStrategy.LWTP)

    @patch("app_consultation.availability.fetch_free_busy")
    def test_public_booking_options_groups_subjects_by_exam_board(self, mock_fetch):
        mock_fetch.return_value = []
        resp = self._public_client().get(
            f"{self.api_prefix}/consultation/public/{self.slug}/booking-options"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.data["data"]
        self.assertEqual(data["consultation_strategy"], Organization.ConsultationStrategy.LWTP)
        self.assertEqual(
            [row["name"] for row in data["subjects_by_board"]["CIE"]],
            ["Mathematics"],
        )
        self.assertEqual(
            [row["name"] for row in data["subjects_by_board"]["EdExcel"]],
            ["Biology"],
        )

    @patch("app_consultation.booking_service.is_slot_available")
    def test_lwtp_booking_rejects_missing_class_preference(self, mock_is_available):
        mock_is_available.return_value = True
        payload = self._booking_payload(self._slot_at(18, 0))
        del payload["details"]["class_preference"]

        resp = self._public_client().post(
            f"{self.api_prefix}/consultation/public/{self.slug}/bookings",
            payload,
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)

    @patch("app_consultation.booking_service.is_slot_available")
    def test_lwtp_booking_rejects_invalid_class_preference(self, mock_is_available):
        mock_is_available.return_value = True
        payload = self._booking_payload(
            self._slot_at(18, 0),
            class_preference="invalid",
        )

        resp = self._public_client().post(
            f"{self.api_prefix}/consultation/public/{self.slug}/bookings",
            payload,
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)

    @patch("app_consultation.booking_service.notify_booking_created")
    @patch("app_consultation.booking_service.is_slot_available")
    def test_lwtp_booking_persists_details(
        self, mock_is_available, mock_notify_created
    ):
        mock_is_available.return_value = True
        scheduled_at = self._slot_at(18, 0)
        resp = self._public_client().post(
            f"{self.api_prefix}/consultation/public/{self.slug}/bookings",
            self._booking_payload(
                scheduled_at,
                class_preference=ClassPreference.PREMIUM_ONE_ON_ONE,
            ),
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)

        with schema_context(self.schema_name):
            booking = ConsultationBooking.objects.get(id=resp.data["data"]["id"])
            self.assertEqual(booking.details["strategy"], "lwtp")
            self.assertEqual(
                booking.details["class_preference"],
                ClassPreference.PREMIUM_ONE_ON_ONE,
            )
            self.assertEqual(booking.details["myanmar_name"], "U Student")

    @patch("app_consultation.booking_service.is_slot_available")
    def test_lwtp_booking_rejects_subject_id_wrong_board(self, mock_is_available):
        mock_is_available.return_value = True
        payload = self._booking_payload(
            self._slot_at(18, 0),
            exam_board="CIE",
            subject_ids=[self.edexcel_subject.id],
        )

        resp = self._public_client().post(
            f"{self.api_prefix}/consultation/public/{self.slug}/bookings",
            payload,
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)

    @patch("app_consultation.views.get_organization_for_current_schema")
    @patch("app_consultation.booking_service.is_slot_available")
    def test_non_lwtp_strategy_rejects_lwtp_details_keys(
        self, mock_is_available, mock_get_org
    ):
        mock_is_available.return_value = True
        org = Organization.objects.get(schema_name=self.schema_name)
        org.consultation_strategy = "other"
        mock_get_org.return_value = org

        resp = self._public_client().post(
            f"{self.api_prefix}/consultation/public/{self.slug}/bookings",
            self._booking_payload(self._slot_at(18, 0)),
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)

    @patch("app_consultation.availability.fetch_free_busy")
    def test_public_availability_returns_open_slots(self, mock_fetch):
        mock_fetch.return_value = []
        with patch(
            "app_consultation.availability.dj_timezone.now",
            return_value=self._fixed_now(),
        ):
            resp = self._public_client().get(
                f"{self.api_prefix}/consultation/public/{self.slug}/availability",
                {"date": self.target_date.isoformat()},
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        slot_times = [row["slot_time"] for row in resp.data["data"]["slots"]]
        self.assertEqual(slot_times, ["18:00", "18:30", "19:00", "19:30"])

    @patch("app_consultation.booking_service.notify_booking_created")
    @patch("app_consultation.booking_service.is_slot_available")
    def test_public_booking_returns_pending_and_booking_url(
        self, mock_is_available, mock_notify_created
    ):
        scheduled_at = self._slot_at(18, 0)
        mock_is_available.return_value = True

        resp = self._public_client().post(
            f"{self.api_prefix}/consultation/public/{self.slug}/bookings",
            self._booking_payload(scheduled_at),
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        data = resp.data["data"]
        self.assertEqual(data["status"], ConsultationBooking.Status.PENDING)
        self.assertEqual(data["meeting_link"], "")
        self.assertIn("token=", data["booking_url"])
        self.assertIn("/book-consultation/booking?", data["booking_url"])
        mock_notify_created.assert_called_once()

        with schema_context(self.schema_name):
            booking = ConsultationBooking.objects.get(id=data["id"])
            self.assertEqual(booking.status, ConsultationBooking.Status.PENDING)
            self.assertTrue(booking.cancel_token_hash)

    @patch("app_consultation.booking_service.create_consultation_event")
    @patch("app_consultation.booking_service.is_slot_available")
    def test_public_booking_does_not_create_calendar_event(
        self, mock_is_available, mock_create_event
    ):
        scheduled_at = self._slot_at(18, 0)
        mock_is_available.return_value = True

        resp = self._public_client().post(
            f"{self.api_prefix}/consultation/public/{self.slug}/bookings",
            self._booking_payload(scheduled_at),
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        mock_create_event.assert_not_called()

    @patch("app_consultation.booking_service.create_consultation_event")
    @patch("app_consultation.booking_service.is_slot_available")
    def test_public_booking_409_when_slot_unavailable(
        self, mock_is_available, mock_create_event
    ):
        mock_is_available.return_value = False
        scheduled_at = self._slot_at(18, 0)

        resp = self._public_client().post(
            f"{self.api_prefix}/consultation/public/{self.slug}/bookings",
            self._booking_payload(scheduled_at),
            format="json",
        )
        self.assertEqual(resp.status_code, 409, resp.content)
        mock_create_event.assert_not_called()

    @patch("app_consultation.booking_service.notify_booking_created")
    @patch("app_consultation.booking_service.is_slot_available")
    def test_public_booking_409_on_double_book(
        self, mock_is_available, mock_notify_created
    ):
        scheduled_at = self._slot_at(18, 30)
        mock_is_available.return_value = True

        first = self._public_client().post(
            f"{self.api_prefix}/consultation/public/{self.slug}/bookings",
            self._booking_payload(scheduled_at),
            format="json",
        )
        self.assertEqual(first.status_code, 201, first.content)

        second = self._public_client().post(
            f"{self.api_prefix}/consultation/public/{self.slug}/bookings",
            self._booking_payload(scheduled_at),
            format="json",
        )
        self.assertEqual(second.status_code, 409, second.content)

    @patch("app_consultation.booking_service.delete_calendar_event")
    def test_student_cancel_with_valid_token(self, mock_delete_event):
        with schema_context(self.schema_name):
            token, token_hash = generate_cancel_token()
            booking = ConsultationBooking.objects.create(
                consultant=self.consultant,
                scheduled_at=self._slot_at(19, 0),
                student_name="Student A",
                student_email="student@example.com",
                meeting_link="https://meet.google.com/abc-defg-hij",
                google_calendar_event_id="evt-999",
                cancel_token_hash=token_hash,
            )

        resp = self._public_client().post(
            f"{self.api_prefix}/consultation/public/cancel",
            {"cancel_token": token},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        mock_delete_event.assert_called_once()

        with schema_context(self.schema_name):
            booking.refresh_from_db()
            self.assertEqual(booking.status, ConsultationBooking.Status.CANCELLED)
            self.assertEqual(
                booking.cancelled_by,
                ConsultationBooking.CancelledBy.STUDENT,
            )

    def test_student_cancel_invalid_token_returns_404(self):
        resp = self._public_client().post(
            f"{self.api_prefix}/consultation/public/cancel",
            {"cancel_token": "not-a-real-token"},
            format="json",
        )
        self.assertEqual(resp.status_code, 404)

    @patch("app_consultation.booking_service.delete_calendar_event")
    def test_student_cancel_is_idempotent(self, mock_delete_event):
        with schema_context(self.schema_name):
            token, token_hash = generate_cancel_token()
            ConsultationBooking.objects.create(
                consultant=self.consultant,
                scheduled_at=self._slot_at(19, 0),
                student_name="Student A",
                student_email="student@example.com",
                meeting_link="https://meet.google.com/abc-defg-hij",
                google_calendar_event_id="evt-999",
                cancel_token_hash=token_hash,
                status=ConsultationBooking.Status.CANCELLED,
                cancelled_by=ConsultationBooking.CancelledBy.STUDENT,
            )

        resp = self._public_client().post(
            f"{self.api_prefix}/consultation/public/cancel",
            {"cancel_token": token},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        mock_delete_event.assert_not_called()

    @patch("app_consultation.booking_service.delete_calendar_event")
    def test_consultant_cancel_own_booking(self, mock_delete_event):
        with schema_context(self.schema_name):
            booking = ConsultationBooking.objects.create(
                consultant=self.consultant,
                scheduled_at=self._slot_at(18, 0),
                student_name="Student A",
                student_email="student@example.com",
                meeting_link="https://meet.google.com/abc-defg-hij",
                google_calendar_event_id="evt-555",
            )

        resp = self._client(self.consultant).post(
            f"{self.api_prefix}/consultation/bookings/{booking.id}/cancel"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        mock_delete_event.assert_called_once()

        with schema_context(self.schema_name):
            booking.refresh_from_db()
            self.assertEqual(booking.status, ConsultationBooking.Status.CANCELLED)
            self.assertEqual(
                booking.cancelled_by,
                ConsultationBooking.CancelledBy.CONSULTANT,
            )

    def test_teacher_forbidden_on_consultant_bookings_list(self):
        resp = self._client(self.teacher).get(
            f"{self.api_prefix}/consultation/me/bookings"
        )
        self.assertEqual(resp.status_code, 403)

    def test_consultant_can_list_own_bookings(self):
        with schema_context(self.schema_name):
            ConsultationBooking.objects.create(
                consultant=self.consultant,
                scheduled_at=self._slot_at(18, 0),
                student_name="Student A",
                student_email="student@example.com",
                status=ConsultationBooking.Status.CONFIRMED,
            )

        resp = self._client(self.consultant).get(
            f"{self.api_prefix}/consultation/me/bookings"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(len(resp.data["data"]), 1)
        self.assertEqual(resp.data["data"][0]["student_name"], "Student A")
        self.assertIn("booking_url", resp.data["data"][0])

    def test_consultant_booking_list_includes_manage_url_when_signed_token_present(
        self,
    ):
        token, token_hash = generate_cancel_token()
        with schema_context(self.schema_name):
            ConsultationBooking.objects.create(
                consultant=self.consultant,
                scheduled_at=self._slot_at(18, 0),
                student_name="Student A",
                student_email="student@example.com",
                status=ConsultationBooking.Status.CONFIRMED,
                cancel_token_hash=token_hash,
                cancel_token_signed=sign_cancel_token(token),
            )

        resp = self._client(self.consultant).get(
            f"{self.api_prefix}/consultation/me/bookings"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        booking_url = resp.data["data"][0]["booking_url"]
        self.assertIn("/book-consultation/booking?", booking_url)
        self.assertIn(f"token={token}", booking_url)

    def test_consultant_can_issue_manage_link_for_legacy_booking(self):
        token, token_hash = generate_cancel_token()
        with schema_context(self.schema_name):
            booking = ConsultationBooking.objects.create(
                consultant=self.consultant,
                scheduled_at=self._slot_at(18, 0),
                student_name="Student A",
                student_email="student@example.com",
                status=ConsultationBooking.Status.CONFIRMED,
                cancel_token_hash=token_hash,
            )

        resp = self._client(self.consultant).post(
            f"{self.api_prefix}/consultation/bookings/{booking.id}/manage-link"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        booking_url = resp.data["data"]["booking_url"]
        self.assertIn("/book-consultation/booking?", booking_url)
        self.assertNotIn(f"token={token}", booking_url)

        with schema_context(self.schema_name):
            booking.refresh_from_db()
            self.assertTrue(booking.cancel_token_signed)

    def test_issue_manage_link_rejects_cancelled_booking(self):
        with schema_context(self.schema_name):
            booking = ConsultationBooking.objects.create(
                consultant=self.consultant,
                scheduled_at=self._slot_at(18, 0),
                student_name="Student A",
                student_email="student@example.com",
                status=ConsultationBooking.Status.CANCELLED,
            )

        resp = self._client(self.consultant).post(
            f"{self.api_prefix}/consultation/bookings/{booking.id}/manage-link"
        )
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_teacher_forbidden_on_whitelist_patch(self):
        resp = self._client(self.teacher).patch(
            f"{self.api_prefix}/consultation/me/whitelist",
            {"schedule": {}},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_booking_link_readiness_missing_google_calendar(self):
        with schema_context(self.schema_name):
            UserGoogleCalendarOAuth.objects.filter(user=self.consultant).delete()

        resp = self._client(self.consultant).get(
            f"{self.api_prefix}/consultation/me/booking-link"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        readiness = resp.data["data"]["readiness"]
        self.assertFalse(readiness["google_calendar_connected"])
        self.assertFalse(readiness["is_bookable"])
        self.assertIn("google_calendar", readiness["missing"])
        self.assertFalse(resp.data["data"]["google_calendar"]["connected"])

    def test_booking_link_readiness_missing_google_identity(self):
        with schema_context(self.schema_name):
            self.consultant.google_id = None
            self.consultant.save(update_fields=["google_id"])

        resp = self._client(self.consultant).get(
            f"{self.api_prefix}/consultation/me/booking-link"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        readiness = resp.data["data"]["readiness"]
        self.assertFalse(readiness["google_identity_linked"])
        self.assertIn("google_identity", readiness["missing"])

    def test_booking_link_ok_with_stateless_jwt_token_user(self):
        """Regression: JWT auth exposes TokenUser (email id) without roles on the object."""
        token_user = type(
            "TokenUser",
            (),
            {"id": self.consultant.email, "is_authenticated": True},
        )()
        client = APIClient()
        client.force_authenticate(user=token_user)
        client.credentials(HTTP_TENANT=self.schema_name)

        resp = client.get(f"{self.api_prefix}/consultation/me/booking-link")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIn("readiness", resp.data["data"])

    @patch("app_consultation.booking_service.is_slot_available")
    @patch("app_consultation.booking_service.notify_booking_created")
    @patch("app_consultation.availability.fetch_free_busy")
    def test_pending_booking_blocks_slot_in_availability(
        self, mock_fetch, mock_notify_created, mock_is_available
    ):
        mock_fetch.return_value = []
        mock_is_available.return_value = True
        scheduled_at = self._slot_at(18, 0)

        with patch(
            "app_consultation.availability.dj_timezone.now",
            return_value=self._fixed_now(),
        ):
            first = self._public_client().post(
                f"{self.api_prefix}/consultation/public/{self.slug}/bookings",
                self._booking_payload(scheduled_at),
                format="json",
            )
        self.assertEqual(first.status_code, 201, first.content)

        with schema_context(self.schema_name):
            blocking_count = ConsultationBooking.objects.filter(
                consultant=self.consultant,
                status__in=slot_blocking_statuses(),
            ).count()
            self.assertEqual(blocking_count, 1)
            slots = generate_consultation_slots(
                self.target_date,
                self.consultant,
                self.org_tz,
                busy_blocks=[],
                now=self._fixed_now(),
            )
            slot_times = [row["slot_time"] for row in slots]
            self.assertNotIn("18:00", slot_times)

    @patch("app_consultation.booking_service.notify_booking_approved")
    @patch("app_consultation.booking_service.create_consultation_event")
    def test_consultant_approve_pending_booking(
        self, mock_create_event, mock_notify_approved
    ):
        mock_create_event.return_value = {
            "meeting_link": "https://meet.google.com/abc-defg-hij",
            "event_id": "evt-approve",
        }
        with schema_context(self.schema_name):
            booking = ConsultationBooking.objects.create(
                consultant=self.consultant,
                scheduled_at=self._slot_at(18, 0),
                student_name="Student A",
                student_email="student@example.com",
                status=ConsultationBooking.Status.PENDING,
            )

        resp = self._client(self.consultant).post(
            f"{self.api_prefix}/consultation/bookings/{booking.id}/approve"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        mock_create_event.assert_called_once()
        description = mock_create_event.call_args.kwargs["description"]
        self.assertIn("View or cancel booking:", description)
        self.assertIn("/book-consultation/booking?", description)
        self.assertIn("token=", description)
        mock_notify_approved.assert_called_once()
        self.assertEqual(
            resp.data["data"]["meeting_link"],
            "https://meet.google.com/abc-defg-hij",
        )

        with schema_context(self.schema_name):
            booking.refresh_from_db()
            self.assertEqual(booking.status, ConsultationBooking.Status.CONFIRMED)

    @patch("app_consultation.booking_service.create_consultation_event")
    def test_approve_non_pending_returns_409(self, mock_create_event):
        with schema_context(self.schema_name):
            booking = ConsultationBooking.objects.create(
                consultant=self.consultant,
                scheduled_at=self._slot_at(18, 0),
                student_name="Student A",
                student_email="student@example.com",
                status=ConsultationBooking.Status.CONFIRMED,
                meeting_link="https://meet.google.com/existing",
            )

        resp = self._client(self.consultant).post(
            f"{self.api_prefix}/consultation/bookings/{booking.id}/approve"
        )
        self.assertEqual(resp.status_code, 409, resp.content)
        mock_create_event.assert_not_called()

    @patch("app_consultation.booking_service.create_consultation_event")
    def test_approve_calendar_failure_returns_502(self, mock_create_event):
        from app_google.calendar import GoogleCalendarError

        mock_create_event.side_effect = GoogleCalendarError("Calendar unavailable")
        with schema_context(self.schema_name):
            booking = ConsultationBooking.objects.create(
                consultant=self.consultant,
                scheduled_at=self._slot_at(18, 0),
                student_name="Student A",
                student_email="student@example.com",
                status=ConsultationBooking.Status.PENDING,
            )

        resp = self._client(self.consultant).post(
            f"{self.api_prefix}/consultation/bookings/{booking.id}/approve"
        )
        self.assertEqual(resp.status_code, 502, resp.content)

        with schema_context(self.schema_name):
            booking.refresh_from_db()
            self.assertEqual(booking.status, ConsultationBooking.Status.PENDING)

    @patch("app_consultation.booking_service.notify_booking_declined")
    def test_consultant_decline_pending_booking(self, mock_notify_declined):
        with schema_context(self.schema_name):
            booking = ConsultationBooking.objects.create(
                consultant=self.consultant,
                scheduled_at=self._slot_at(18, 0),
                student_name="Student A",
                student_email="student@example.com",
                status=ConsultationBooking.Status.PENDING,
            )

        resp = self._client(self.consultant).post(
            f"{self.api_prefix}/consultation/bookings/{booking.id}/cancel"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        mock_notify_declined.assert_called_once()

        with schema_context(self.schema_name):
            booking.refresh_from_db()
            self.assertEqual(booking.status, ConsultationBooking.Status.CANCELLED)

    def test_public_booking_by_token_pending_has_no_meeting_link(self):
        with schema_context(self.schema_name):
            token, token_hash = generate_cancel_token()
            ConsultationBooking.objects.create(
                consultant=self.consultant,
                scheduled_at=self._slot_at(18, 0),
                student_name="Student A",
                student_email="student@example.com",
                cancel_token_hash=token_hash,
                status=ConsultationBooking.Status.PENDING,
            )

        resp = self._public_client().get(
            f"{self.api_prefix}/consultation/public/bookings/by-token",
            {"token": token},
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.data["data"]
        self.assertEqual(data["status"], ConsultationBooking.Status.PENDING)
        self.assertEqual(data["meeting_link"], "")
        self.assertTrue(data["can_cancel"])

    def test_public_booking_by_token_confirmed_includes_meeting_link(self):
        with schema_context(self.schema_name):
            token, token_hash = generate_cancel_token()
            ConsultationBooking.objects.create(
                consultant=self.consultant,
                scheduled_at=self._slot_at(18, 0),
                student_name="Student A",
                student_email="student@example.com",
                cancel_token_hash=token_hash,
                status=ConsultationBooking.Status.CONFIRMED,
                meeting_link="https://meet.google.com/abc-defg-hij",
            )

        resp = self._public_client().get(
            f"{self.api_prefix}/consultation/public/bookings/by-token",
            {"token": token},
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.data["data"]
        self.assertEqual(data["status"], ConsultationBooking.Status.CONFIRMED)
        self.assertEqual(data["meeting_link"], "https://meet.google.com/abc-defg-hij")

    def test_public_booking_by_token_includes_student_and_details(self):
        lwtp_details = {
            "strategy": "lwtp",
            "myanmar_name": "U Student",
            "class_preference": ClassPreference.GROUP_CLASS,
            "exam_board": "CIE",
            "subject_ids": [self.cie_subject.id],
            "subject_names": [self.cie_subject.name],
            "phone": "+959123456789",
        }
        with schema_context(self.schema_name):
            token, token_hash = generate_cancel_token()
            ConsultationBooking.objects.create(
                consultant=self.consultant,
                scheduled_at=self._slot_at(18, 0),
                student_name="Student A",
                student_email="student@example.com",
                cancel_token_hash=token_hash,
                status=ConsultationBooking.Status.PENDING,
                details=lwtp_details,
            )

        resp = self._public_client().get(
            f"{self.api_prefix}/consultation/public/bookings/by-token",
            {"token": token},
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.data["data"]
        self.assertEqual(data["student_name"], "Student A")
        self.assertEqual(data["student_email"], "student@example.com")
        self.assertEqual(data["details"]["myanmar_name"], "U Student")
        self.assertEqual(data["details"]["phone"], "+959123456789")

    @patch("app_consultation.notifications.send_mail")
    @patch("app_consultation.booking_service.is_slot_available")
    def test_booking_still_succeeds_when_email_raises(
        self, mock_is_available, mock_send_mail
    ):
        mock_is_available.return_value = True
        mock_send_mail.side_effect = RuntimeError("email down")

        resp = self._public_client().post(
            f"{self.api_prefix}/consultation/public/{self.slug}/bookings",
            self._booking_payload(self._slot_at(18, 0)),
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)

    @patch("app_consultation.availability.fetch_free_busy")
    def test_cancelled_booking_slot_reappears_in_availability(self, mock_fetch):
        mock_fetch.return_value = []
        scheduled_at = self._slot_at(19, 30)
        with schema_context(self.schema_name):
            ConsultationBooking.objects.create(
                consultant=self.consultant,
                scheduled_at=scheduled_at,
                student_name="Student A",
                student_email="student@example.com",
                status=ConsultationBooking.Status.CANCELLED,
            )

        with patch(
            "app_consultation.availability.dj_timezone.now",
            return_value=self._fixed_now(),
        ):
            resp = self._public_client().get(
                f"{self.api_prefix}/consultation/public/{self.slug}/availability",
                {"date": self.target_date.isoformat()},
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        slot_times = [row["slot_time"] for row in resp.data["data"]["slots"]]
        self.assertIn("19:30", slot_times)

    @patch("app_consultation.availability.fetch_free_busy")
    def test_public_availability_dates_month(self, mock_fetch):
        mock_fetch.return_value = []
        with patch(
            "app_consultation.availability.dj_timezone.now",
            return_value=self._fixed_now(),
        ):
            resp = self._public_client().get(
                f"{self.api_prefix}/consultation/public/{self.slug}/availability/dates",
                {"month": "2026-08"},
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        dates = resp.data["data"]["dates"]
        self.assertEqual(len(dates), monthrange(2026, 8)[1])

    def test_consultant_can_apply_lwtp_preset(self):
        resp = self._client(self.consultant).post(
            f"{self.api_prefix}/consultation/me/whitelist/apply-preset"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertTrue(resp.data["data"]["schedule"]["monday"]["enabled"])

    def test_hash_cancel_token_roundtrip(self):
        token, token_hash = generate_cancel_token()
        self.assertEqual(hash_cancel_token(token), token_hash)

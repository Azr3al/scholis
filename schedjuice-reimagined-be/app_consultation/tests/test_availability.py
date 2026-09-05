import unittest
from calendar import monthrange
from datetime import date, datetime, time, timedelta
from unittest.mock import patch
from uuid import uuid4
from zoneinfo import ZoneInfo

from django.core.cache import cache
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_consultation.availability import (
    get_dates_with_slots,
    get_open_slots,
    invalidate_freebusy_cache_for_booking,
    is_slot_available,
)
from app_consultation.exceptions import ConsultationAvailabilityError
from app_consultation.freebusy_cache import freebusy_cache_key
from app_consultation.models import ConsultationBooking
from app_consultation.presets import apply_lwtp_preset
from app_google.calendar import GoogleCalendarError


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _make_consultant(schema_name: str) -> User:
    suffix = uuid4().hex[:8]
    with schema_context(schema_name):
        return User.objects.create_user(
            email=f"consult-{suffix}@example.com",
            password="x",
            name="Consultant",
            phone_number="1",
            date_of_birth=date(1990, 1, 1),
            communication_email=f"consult-{suffix}@example.com",
            code=f"consult-{suffix}",
            roles=[User.UserRole.TEACHER],
        )


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class AvailabilityEngineTests(TestCase):
    schema_name = "xschedjuice"
    org_tz = "Asia/Rangoon"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        cache.clear()
        self.consultant = _make_consultant(self.schema_name)
        with schema_context(self.schema_name):
            apply_lwtp_preset(self.consultant)
        self.target_date = date(2026, 8, 10)

    def _fixed_now(self) -> datetime:
        tz = ZoneInfo(self.org_tz)
        return datetime.combine(
            self.target_date - timedelta(days=1),
            time(12, 0),
            tzinfo=tz,
        ).astimezone(timezone.utc)

    @patch("app_consultation.availability.fetch_free_busy")
    def test_get_open_slots_uses_whitelist_and_freebusy(self, mock_fetch):
        mock_fetch.return_value = []
        with schema_context(self.schema_name):
            slots = get_open_slots(
                self.consultant,
                self.target_date,
                self.org_tz,
                now=self._fixed_now(),
            )
        self.assertEqual([s["slot_time"] for s in slots], ["18:00", "18:30", "19:00", "19:30"])
        mock_fetch.assert_called_once()

    @patch("app_consultation.availability.fetch_free_busy")
    def test_cache_hit_skips_second_freebusy_call(self, mock_fetch):
        mock_fetch.return_value = []
        with schema_context(self.schema_name):
            get_open_slots(
                self.consultant,
                self.target_date,
                self.org_tz,
                now=self._fixed_now(),
            )
            get_open_slots(
                self.consultant,
                self.target_date,
                self.org_tz,
                now=self._fixed_now(),
            )
        self.assertEqual(mock_fetch.call_count, 1)

    @patch("app_consultation.availability.fetch_free_busy")
    def test_cache_invalidation_refetches_freebusy(self, mock_fetch):
        mock_fetch.return_value = []
        with schema_context(self.schema_name):
            get_open_slots(
                self.consultant,
                self.target_date,
                self.org_tz,
                now=self._fixed_now(),
            )
            cache_key = freebusy_cache_key(
                self.schema_name,
                self.consultant.id,
                self.target_date,
            )
            self.assertIsNotNone(cache.get(cache_key))

            tz = ZoneInfo(self.org_tz)
            scheduled_at = datetime.combine(
                self.target_date,
                time(18, 0),
                tzinfo=tz,
            ).astimezone(timezone.utc)
            invalidate_freebusy_cache_for_booking(self.consultant, scheduled_at)
            self.assertIsNone(cache.get(cache_key))

            get_open_slots(
                self.consultant,
                self.target_date,
                self.org_tz,
                now=self._fixed_now(),
            )
        self.assertEqual(mock_fetch.call_count, 2)

    @patch("app_consultation.availability.fetch_free_busy")
    def test_get_dates_with_slots_uses_single_month_freebusy_call(self, mock_fetch):
        mock_fetch.return_value = []
        month = date(2026, 8, 1)
        with schema_context(self.schema_name):
            dates = get_dates_with_slots(
                self.consultant,
                month,
                self.org_tz,
                now=self._fixed_now(),
            )
        self.assertEqual(mock_fetch.call_count, 1)
        self.assertEqual(len(dates), monthrange(2026, 8)[1])

    @patch("app_consultation.availability.fetch_free_busy")
    def test_get_dates_with_slots_omits_fully_busy_days(self, mock_fetch):
        tz = ZoneInfo(self.org_tz)
        busy_start = datetime.combine(self.target_date, time(17, 0), tzinfo=tz).astimezone(
            timezone.utc
        )
        busy_end = datetime.combine(self.target_date, time(21, 0), tzinfo=tz).astimezone(
            timezone.utc
        )
        mock_fetch.return_value = [(busy_start, busy_end)]

        with schema_context(self.schema_name):
            dates = get_dates_with_slots(
                self.consultant,
                date(2026, 8, 1),
                self.org_tz,
                now=self._fixed_now(),
            )
        self.assertNotIn(self.target_date, dates)
        self.assertIn(date(2026, 8, 11), dates)

    @patch("app_consultation.availability.fetch_free_busy")
    def test_is_slot_available_matches_open_slot(self, mock_fetch):
        mock_fetch.return_value = []
        tz = ZoneInfo(self.org_tz)
        scheduled_at = datetime.combine(
            self.target_date,
            time(18, 30),
            tzinfo=tz,
        ).astimezone(timezone.utc)

        with schema_context(self.schema_name):
            self.assertTrue(
                is_slot_available(
                    self.consultant,
                    scheduled_at,
                    self.org_tz,
                    now=self._fixed_now(),
                )
            )

    @patch("app_consultation.availability.fetch_free_busy")
    def test_is_slot_available_false_for_busy_block(self, mock_fetch):
        tz = ZoneInfo(self.org_tz)
        scheduled_at = datetime.combine(
            self.target_date,
            time(18, 30),
            tzinfo=tz,
        ).astimezone(timezone.utc)
        mock_fetch.return_value = [
            (
                datetime.combine(self.target_date, time(18, 30), tzinfo=tz).astimezone(
                    timezone.utc
                ),
                datetime.combine(self.target_date, time(19, 0), tzinfo=tz).astimezone(
                    timezone.utc
                ),
            )
        ]

        with schema_context(self.schema_name):
            self.assertFalse(
                is_slot_available(
                    self.consultant,
                    scheduled_at,
                    self.org_tz,
                    now=self._fixed_now(),
                )
            )

    @patch("app_consultation.availability.fetch_free_busy")
    def test_is_slot_available_false_for_confirmed_booking(self, mock_fetch):
        mock_fetch.return_value = []
        tz = ZoneInfo(self.org_tz)
        scheduled_at = datetime.combine(
            self.target_date,
            time(19, 0),
            tzinfo=tz,
        ).astimezone(timezone.utc)

        with schema_context(self.schema_name):
            ConsultationBooking.objects.create(
                consultant=self.consultant,
                scheduled_at=scheduled_at,
                student_name="Student",
                student_email="student@example.com",
            )
            self.assertFalse(
                is_slot_available(
                    self.consultant,
                    scheduled_at,
                    self.org_tz,
                    now=self._fixed_now(),
                )
            )

    @patch("app_consultation.availability.fetch_free_busy")
    def test_google_error_raises_consultation_availability_error(self, mock_fetch):
        mock_fetch.side_effect = GoogleCalendarError("Google Calendar is not connected.")

        with schema_context(self.schema_name):
            with self.assertRaises(ConsultationAvailabilityError):
                get_open_slots(
                    self.consultant,
                    self.target_date,
                    self.org_tz,
                    now=self._fixed_now(),
                )

import unittest
from datetime import date, datetime, timedelta, timezone as dt_timezone
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from tenant_schemas.utils import schema_context

from app_announcement.models import PostType
from app_announcement.serializers import AnnouncementSerializer
from app_auth.models import User
from app_course.models import Course
from app_utility_notifications.tenant_time import (
    add_calendar_days_to_tenant_ymd,
    event_instant_in_timezone,
    get_tenant_today_ymd,
)


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class AnnouncementPostTypeValidationTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            self.user = User.objects.create_user(
                email=f"teacher-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.course = Course.objects.first()

    def _serializer(self, timezone: str = "UTC"):
        class Tenant:
            pass

        class QueryParams:
            def getlist(self, _field):
                return []

        mock_tenant = Tenant()
        mock_tenant.timezone = timezone
        mock_tenant.schema_name = self.schema_name

        class Req:
            user = type("U", (), {"id": self.user.email})()
            tenant = mock_tenant
            query_params = QueryParams()

        return AnnouncementSerializer(context={"request": Req()})

    def test_announcement_requires_title(self):
        ser = self._serializer()
        with self.assertRaises(ValidationError):
            ser.validate(
                {
                    "post_type": PostType.ANNOUNCEMENT,
                    "title": "",
                    "finished_unit": None,
                    "course": self.course,
                }
            )

    def test_daily_lesson_allows_null_finished_unit(self):
        ser = self._serializer()
        data = ser.validate(
            {
                "post_type": PostType.DAILY_LESSON,
                "title": None,
                "finished_unit": None,
                "course": self.course,
            }
        )
        self.assertIsNone(data.get("title"))
        self.assertIsNone(data["finished_unit"])

    def test_daily_lesson_rejects_non_positive_finished_unit(self):
        ser = self._serializer()
        with self.assertRaises(ValidationError):
            ser.validate(
                {
                    "post_type": PostType.DAILY_LESSON,
                    "title": None,
                    "finished_unit": 0,
                    "course": self.course,
                }
            )

    def test_announcement_rejects_finished_unit(self):
        ser = self._serializer()
        with self.assertRaises(ValidationError):
            ser.validate(
                {
                    "post_type": PostType.ANNOUNCEMENT,
                    "title": "Hello",
                    "finished_unit": 3,
                    "course": self.course,
                }
            )

    def test_daily_lesson_clears_title_on_validate(self):
        ser = self._serializer()
        data = ser.validate(
            {
                "post_type": PostType.DAILY_LESSON,
                "title": "ignored",
                "finished_unit": 5,
                "course": self.course,
            }
        )
        self.assertIsNone(data.get("title"))
        self.assertEqual(data["finished_unit"], 5)

    def test_daily_lesson_posted_on_yesterday_sets_created_at(self):
        tenant_tz = "UTC"
        now = datetime.now(dt_timezone.utc)
        yesterday_ymd = add_calendar_days_to_tenant_ymd(
            get_tenant_today_ymd(tenant_tz, now),
            tenant_tz,
            -1,
        )
        with schema_context(self.schema_name):
            ser = self._serializer(timezone=tenant_tz)
            validated_data = ser.validate(
                {
                    "post_type": PostType.DAILY_LESSON,
                    "title": None,
                    "finished_unit": 3,
                    "course": self.course,
                    "posted_on": date.fromisoformat(yesterday_ymd),
                }
            )
            instance = ser.create(validated_data)
            expected = event_instant_in_timezone(yesterday_ymd, "12:00", tenant_tz)
            self.assertEqual(instance.created_at, expected)

    def test_announcement_posted_on_yesterday_sets_created_at(self):
        tenant_tz = "UTC"
        now = datetime.now(dt_timezone.utc)
        yesterday_ymd = add_calendar_days_to_tenant_ymd(
            get_tenant_today_ymd(tenant_tz, now),
            tenant_tz,
            -1,
        )
        with schema_context(self.schema_name):
            ser = self._serializer(timezone=tenant_tz)
            validated_data = ser.validate(
                {
                    "post_type": PostType.ANNOUNCEMENT,
                    "title": "Backdated",
                    "finished_unit": None,
                    "course": self.course,
                    "posted_on": date.fromisoformat(yesterday_ymd),
                }
            )
            instance = ser.create(validated_data)
            expected = event_instant_in_timezone(yesterday_ymd, "12:00", tenant_tz)
            self.assertEqual(instance.created_at, expected)

    def test_announcement_posted_on_today_keeps_actual_post_time(self):
        tenant_tz = "UTC"
        now = datetime.now(dt_timezone.utc)
        today_ymd = get_tenant_today_ymd(tenant_tz, now)
        with schema_context(self.schema_name):
            ser = self._serializer(timezone=tenant_tz)
            before = datetime.now(dt_timezone.utc)
            validated_data = ser.validate(
                {
                    "post_type": PostType.ANNOUNCEMENT,
                    "title": "Today",
                    "finished_unit": None,
                    "course": self.course,
                    "posted_on": date.fromisoformat(today_ymd),
                }
            )
            instance = ser.create(validated_data)
            after = datetime.now(dt_timezone.utc)
            expected_noon = event_instant_in_timezone(today_ymd, "12:00", tenant_tz)
            self.assertNotEqual(instance.created_at, expected_noon)
            self.assertGreaterEqual(instance.created_at, before - timedelta(seconds=1))
            self.assertLessEqual(instance.created_at, after + timedelta(seconds=1))

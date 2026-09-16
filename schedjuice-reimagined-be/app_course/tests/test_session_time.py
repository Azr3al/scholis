import unittest
from datetime import date, datetime, time, timedelta

from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from tenant_schemas.utils import schema_context
from zoneinfo import ZoneInfo

from app_course.models import Course, Event
from app_course.session_time import (
    event_bounds_local,
    is_overnight,
    session_duration_minutes,
    validate_session_time_range,
)


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class SessionTimeHelperTests(SimpleTestCase):
    def test_same_day_duration(self):
        self.assertEqual(session_duration_minutes(time(9, 0), time(10, 30)), 90)
        self.assertFalse(is_overnight(time(9, 0), time(10, 30)))

    def test_overnight_duration(self):
        self.assertTrue(is_overnight(time(22, 30), time(0, 0)))
        self.assertEqual(session_duration_minutes(time(22, 30), time(0, 0)), 90)

    def test_rejects_zero_duration(self):
        with self.assertRaises(ValidationError):
            validate_session_time_range(time(10, 0), time(10, 0))

    def test_allows_longest_overnight_under_24h(self):
        validate_session_time_range(time(0, 1), time(0, 0))

    def test_allows_overnight_under_24h(self):
        validate_session_time_range(time(22, 30), time(0, 0))

    def test_event_bounds_local_overnight(self):
        tz = ZoneInfo("Asia/Yangon")
        ev = Event(
            title="Night",
            course_id=1,
            date=datetime(2026, 7, 24, 0, 0, tzinfo=tz),
            time_from=time(22, 30),
            time_to=time(0, 0),
        )
        start, end = event_bounds_local(ev, tz)
        self.assertEqual(start, datetime(2026, 7, 24, 22, 30, tzinfo=tz))
        self.assertEqual(end, datetime(2026, 7, 25, 0, 0, tzinfo=tz))


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class EventSaveOvernightTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_save_allows_overnight(self):
        with schema_context(self.schema_name):
            course = Course.objects.first()
            ev = Event(
                title="Night class",
                course=course,
                date=timezone.make_aware(datetime(2026, 7, 24, 0, 0)),
                time_from=time(22, 30),
                time_to=time(0, 0),
            )
            ev.save()
            ev.refresh_from_db()
            self.assertEqual(ev.time_to, time(0, 0))

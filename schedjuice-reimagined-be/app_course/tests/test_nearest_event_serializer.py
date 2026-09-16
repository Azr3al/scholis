import unittest
from datetime import date, datetime, time, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_course.models import Category, Course, Event, Program
from app_course.serializers import CourseSerializer


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _aware(day: date, hour: int, minute: int = 0) -> datetime:
    return timezone.make_aware(datetime.combine(day, time(hour, minute)))


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class NearestEventSerializerTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.today = timezone.localdate()
        self.suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            self.cat = Category.objects.create(name=f"Cat {self.suffix}")
            self.prog = Program.objects.create(
                name=f"P {self.suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )

    def _create_course(self) -> Course:
        return Course.objects.create(
            title=f"Course {self.suffix}-{uuid4().hex[:4]}",
            category=self.cat,
            program=self.prog,
            start_date=self.today - timedelta(days=30),
            end_date=self.today + timedelta(days=30),
        )

    def _serialize(self, course: Course) -> dict:
        return CourseSerializer(course).data

    def test_nearest_event_prefers_upcoming_over_first_session_time(self):
        with schema_context(self.schema_name):
            course = self._create_course()
            Event.objects.create(
                title="First",
                course=course,
                date=_aware(self.today - timedelta(days=14), 10, 0),
                time_from=time(10, 0),
                time_to=time(11, 30),
            )
            Event.objects.create(
                title="Upcoming",
                course=course,
                date=_aware(self.today + timedelta(days=7), 14, 0),
                time_from=time(14, 0),
                time_to=time(15, 30),
            )
            data = self._serialize(course)
            self.assertEqual(data["first_event_time_from"], "10:00:00")
            self.assertEqual(data["first_event_time_to"], "11:30:00")
            self.assertEqual(data["nearest_event_time_from"], "14:00:00")
            self.assertEqual(data["nearest_event_time_to"], "15:30:00")

    def test_nearest_event_falls_back_to_most_recent_past_when_course_ended(self):
        with schema_context(self.schema_name):
            course = self._create_course()
            Event.objects.create(
                title="Older",
                course=course,
                date=_aware(self.today - timedelta(days=14), 9, 0),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            Event.objects.create(
                title="Latest past",
                course=course,
                date=_aware(self.today - timedelta(days=1), 16, 0),
                time_from=time(16, 0),
                time_to=time(17, 30),
            )
            data = self._serialize(course)
            self.assertEqual(data["nearest_event_time_from"], "16:00:00")
            self.assertEqual(data["nearest_event_time_to"], "17:30:00")

    def test_nearest_event_none_when_course_has_no_events(self):
        with schema_context(self.schema_name):
            course = self._create_course()
            data = self._serialize(course)
            self.assertIsNone(data["nearest_event_time_from"])
            self.assertIsNone(data["nearest_event_time_to"])
            self.assertIsNone(data["first_event_time_from"])
            self.assertIsNone(data["first_event_time_to"])

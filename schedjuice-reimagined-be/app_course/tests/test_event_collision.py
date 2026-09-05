import unittest
from datetime import date, datetime, time, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_course.event_collision import colliding_course_ids
from app_course.models import Category, Course, Event, Program
from app_course.program_helpers import get_default_program


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class EventCollisionTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.today = timezone.localdate()
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            self.cat = Category.objects.first()
            self.prog = get_default_program()
            self.course = Course.objects.create(
                title=f"Collision base {suffix}",
                code=f"CB-{suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            Event.objects.create(
                title="base",
                date=timezone.make_aware(datetime.combine(self.today, time(9, 0))),
                time_from=time(9, 0),
                time_to=time(11, 0),
                course=self.course,
            )

    def _make_course(self, title: str) -> Course:
        return Course.objects.create(
            title=title,
            code=f"C-{uuid4().hex[:6]}",
            category=self.cat,
            program=self.prog,
            start_date=self.today,
            end_date=self.today + timedelta(days=30),
        )

    def test_returns_course_with_overlapping_session(self):
        with schema_context(self.schema_name):
            other = self._make_course("Other")
            Event.objects.create(
                title="clash",
                date=timezone.make_aware(datetime.combine(self.today, time(9, 0))),
                time_from=time(10, 0),
                time_to=time(12, 0),
                course=other,
            )
            ids = colliding_course_ids(
                self.course.id, self.course.start_date, self.course.end_date
            )
            self.assertEqual(ids, [other.id])

    def test_excludes_course_with_non_overlapping_session(self):
        with schema_context(self.schema_name):
            other = self._make_course("Other late")
            Event.objects.create(
                title="later",
                date=timezone.make_aware(datetime.combine(self.today, time(9, 0))),
                time_from=time(13, 0),
                time_to=time(15, 0),
                course=other,
            )
            self.assertEqual(
                colliding_course_ids(
                    self.course.id, self.course.start_date, self.course.end_date
                ),
                [],
            )

    def test_treats_back_to_back_sessions_as_colliding(self):
        with schema_context(self.schema_name):
            other = self._make_course("Other touching")
            Event.objects.create(
                title="touching",
                date=timezone.make_aware(datetime.combine(self.today, time(9, 0))),
                time_from=time(11, 0),
                time_to=time(13, 0),
                course=other,
            )
            self.assertEqual(
                colliding_course_ids(
                    self.course.id, self.course.start_date, self.course.end_date
                ),
                [other.id],
            )

    def test_excludes_session_outside_course_date_range(self):
        with schema_context(self.schema_name):
            other = self._make_course("Other future")
            Event.objects.create(
                title="next year",
                date=timezone.make_aware(datetime.combine(date(2027, 8, 3), time(9, 0))),
                time_from=time(10, 0),
                time_to=time(12, 0),
                course=other,
            )
            self.assertEqual(
                colliding_course_ids(
                    self.course.id, self.course.start_date, self.course.end_date
                ),
                [],
            )

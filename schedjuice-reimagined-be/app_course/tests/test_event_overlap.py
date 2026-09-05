import unittest
from datetime import date, datetime, time, timedelta

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from tenant_schemas.utils import schema_context

from zoneinfo import ZoneInfo

from app_course.event_overlap import (
    find_overlap_clusters,
    has_overlapping_events,
    is_past_event,
    validate_no_overlapping_events,
)
from app_course.models import Category, Course, Event
from app_course.session_time import events_overlap
from app_course.program_helpers import get_default_program


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _aware(day: date, hour: int, minute: int = 0) -> datetime:
    return timezone.make_aware(datetime.combine(day, time(hour, minute)))


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class EventOverlapTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.tz = ZoneInfo("UTC")
        self.day = date(2026, 7, 1)
        # Cluster-math tests use historical fixture dates; disable past filter there.
        self.cluster_kwargs = {"ignore_past": False}

    def _ev(self, course, t_from, t_to, day=None):
        day = day or self.day
        return Event(
            title="S",
            course=course,
            date=_aware(day, t_from.hour, t_from.minute),
            time_from=t_from,
            time_to=t_to,
        )

    def test_non_overlapping_same_day_am_pm(self):
        with schema_context(self.schema_name):
            cat = Category.objects.create(name="Cat")
            course = Course.objects.create(
                title="C",
                description="d",
                code="C1",
                category=cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )
            events = [
                self._ev(course, time(9, 0), time(10, 0)),
                self._ev(course, time(14, 0), time(15, 0)),
            ]
            self.assertFalse(
                has_overlapping_events(events, self.tz, **self.cluster_kwargs)
            )
            self.assertEqual(
                find_overlap_clusters(events, self.tz, **self.cluster_kwargs), []
            )

    def test_pair_overlap_one_cluster(self):
        with schema_context(self.schema_name):
            cat = Category.objects.create(name="Cat2")
            course = Course.objects.create(
                title="C2",
                description="d",
                code="C2",
                category=cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )
            a = self._ev(course, time(9, 0), time(10, 30))
            b = self._ev(course, time(9, 30), time(11, 0))
            clusters = find_overlap_clusters([a, b], self.tz, **self.cluster_kwargs)
            self.assertEqual(len(clusters), 1)
            self.assertEqual(len(clusters[0]), 2)

    def test_transitive_chain_abc(self):
        events = [
            Event(
                title="A",
                course_id=1,
                date=_aware(self.day, 9),
                time_from=time(9, 0),
                time_to=time(10, 0),
            ),
            Event(
                title="B",
                course_id=1,
                date=_aware(self.day, 9, 30),
                time_from=time(9, 30),
                time_to=time(10, 30),
            ),
            Event(
                title="C",
                course_id=1,
                date=_aware(self.day, 10),
                time_from=time(10, 0),
                time_to=time(11, 0),
            ),
        ]
        clusters = find_overlap_clusters(events, self.tz, **self.cluster_kwargs)
        self.assertEqual(len(clusters), 1)
        self.assertEqual(len(clusters[0]), 3)

    def test_two_disjoint_clusters_same_day(self):
        events = [
            Event(
                title="A",
                course_id=1,
                date=_aware(self.day, 9),
                time_from=time(9, 0),
                time_to=time(10, 0),
            ),
            Event(
                title="B",
                course_id=1,
                date=_aware(self.day, 9, 30),
                time_from=time(9, 30),
                time_to=time(10, 30),
            ),
            Event(
                title="C",
                course_id=1,
                date=_aware(self.day, 14),
                time_from=time(14, 0),
                time_to=time(15, 0),
            ),
            Event(
                title="D",
                course_id=1,
                date=_aware(self.day, 14, 30),
                time_from=time(14, 30),
                time_to=time(15, 30),
            ),
        ]
        clusters = find_overlap_clusters(events, self.tz, **self.cluster_kwargs)
        self.assertEqual(len(clusters), 2)

    def test_validate_raises_with_conflicts(self):
        events = [
            Event(
                id=1,
                title="A",
                course_id=1,
                date=_aware(self.day, 9),
                time_from=time(9, 0),
                time_to=time(10, 30),
            ),
            Event(
                id=2,
                title="B",
                course_id=1,
                date=_aware(self.day, 9),
                time_from=time(9, 30),
                time_to=time(11, 0),
            ),
        ]
        with self.assertRaises(ValidationError) as ctx:
            validate_no_overlapping_events(events, self.tz, **self.cluster_kwargs)
        self.assertIn("conflicts", ctx.exception.detail)

    def test_is_past_event_by_time_to(self):
        tz = ZoneInfo("UTC")
        now = datetime(2026, 7, 1, 12, 0, tzinfo=tz)
        past = Event(
            title="P",
            course_id=1,
            date=_aware(self.day, 9),
            time_from=time(9, 0),
            time_to=time(10, 0),
        )
        current_end = Event(
            title="N",
            course_id=1,
            date=_aware(self.day, 11),
            time_from=time(11, 0),
            time_to=time(12, 0),
        )
        future = Event(
            title="F",
            course_id=1,
            date=_aware(self.day, 13),
            time_from=time(13, 0),
            time_to=time(14, 0),
        )
        self.assertTrue(is_past_event(past, tz, now=now))
        self.assertFalse(is_past_event(current_end, tz, now=now))
        self.assertFalse(is_past_event(future, tz, now=now))

    def test_past_overlap_ignored_future_still_flagged(self):
        tz = ZoneInfo("UTC")
        now = datetime(2026, 7, 1, 12, 0, tzinfo=tz)
        past_a = Event(
            title="A",
            course_id=1,
            date=_aware(self.day, 9),
            time_from=time(9, 0),
            time_to=time(10, 30),
        )
        past_b = Event(
            title="B",
            course_id=1,
            date=_aware(self.day, 9, 30),
            time_from=time(9, 30),
            time_to=time(11, 0),
        )
        fut_a = Event(
            title="C",
            course_id=1,
            date=_aware(self.day, 13),
            time_from=time(13, 0),
            time_to=time(14, 30),
        )
        fut_b = Event(
            title="D",
            course_id=1,
            date=_aware(self.day, 13, 30),
            time_from=time(13, 30),
            time_to=time(15, 0),
        )
        self.assertFalse(has_overlapping_events([past_a, past_b], tz, now=now))
        self.assertTrue(
            has_overlapping_events([past_a, past_b, fut_a, fut_b], tz, now=now)
        )
        clusters = find_overlap_clusters(
            [past_a, past_b, fut_a, fut_b], tz, now=now
        )
        self.assertEqual(len(clusters), 1)
        self.assertEqual({ev.title for ev in clusters[0]}, {"C", "D"})

    def test_overnight_overlaps_next_morning_session(self):
        tz = ZoneInfo("UTC")
        day = date(2026, 7, 24)
        overnight = Event(
            title="Night",
            course_id=1,
            date=_aware(day, 0),
            time_from=time(22, 30),
            time_to=time(0, 0),
        )
        morning = Event(
            title="Early",
            course_id=1,
            date=_aware(day + timedelta(days=1), 0),
            time_from=time(0, 0),
            time_to=time(1, 0),
        )
        overnight.time_to = time(0, 30)
        self.assertTrue(events_overlap(overnight, morning, tz))
        self.assertTrue(
            has_overlapping_events([overnight, morning], tz, **self.cluster_kwargs)
        )

    def test_overnight_end_datetime_next_day(self):
        from app_course.event_overlap import event_end_datetime

        tz = ZoneInfo("UTC")
        ev = Event(
            title="Night",
            course_id=1,
            date=_aware(date(2026, 7, 24), 0),
            time_from=time(22, 30),
            time_to=time(0, 0),
        )
        end = event_end_datetime(ev, tz)
        self.assertEqual(end.date(), date(2026, 7, 25))
        self.assertEqual(end.time(), time(0, 0))

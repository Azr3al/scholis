from datetime import datetime, timezone as dt_timezone
from zoneinfo import ZoneInfo

from django.test import SimpleTestCase

from app_course.roster_event_weekdays import (
    event_weekday,
    filter_events_for_weekdays,
    format_weekday_labels,
)


class RosterEventWeekdayTests(SimpleTestCase):
    def test_event_weekday_uses_org_timezone(self):
        event_date = datetime(2026, 7, 6, 17, 0, tzinfo=dt_timezone.utc)
        self.assertEqual(event_weekday(event_date, "Asia/Rangoon"), 1)

    def test_filter_events_for_weekdays(self):
        mon = datetime(2026, 7, 6, 9, 0, tzinfo=dt_timezone.utc)
        tue = datetime(2026, 7, 7, 9, 0, tzinfo=dt_timezone.utc)
        events = [{"id": 1, "date": mon}, {"id": 2, "date": tue}]
        filtered = filter_events_for_weekdays(events, weekdays=[1], tz_name="UTC")
        self.assertEqual([event["id"] for event in filtered], [1])

    def test_format_weekday_labels_sorted(self):
        self.assertEqual(format_weekday_labels([3, 1]), ["Mon", "Wed"])

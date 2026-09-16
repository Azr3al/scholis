from datetime import datetime

from django.test import SimpleTestCase

from app_zoom.scheduling import detect_conflicts


class SchedulingHelpersTest(SimpleTestCase):

    def test_detect_conflicts_overlap(self):
        start = datetime(2026, 5, 1, 8, 0, 0)
        meetings = [
            {
                "id": 1,
                "start_time": "2026-05-01T08:30:00Z",
                "duration": 60,
                "topic": "Other",
            },
            {
                "id": 2,
                "start_time": "2026-05-02T08:00:00Z",
                "duration": 60,
                "topic": "Far",
            },
        ]
        conflicts = detect_conflicts(
            meetings, start_utc=start, duration_minutes=60
        )
        self.assertEqual([c["id"] for c in conflicts], [1])


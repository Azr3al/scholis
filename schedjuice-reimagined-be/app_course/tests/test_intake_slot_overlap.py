from django.test import SimpleTestCase

from app_course.intake_services import _validate_slots


class IntakeSlotOverlapTests(SimpleTestCase):
    def test_rejects_overlapping_times_same_weekday(self):
        slots = [
            {"weekday": "Mon", "time_from": "09:00", "time_to": "10:30"},
            {"weekday": "Mon", "time_from": "09:30", "time_to": "11:00"},
        ]
        with self.assertRaises(ValueError) as ctx:
            _validate_slots(slots)
        self.assertIn("Overlapping session times on Mon", str(ctx.exception))

    def test_allows_non_overlapping_same_weekday(self):
        slots = [
            {"weekday": "Mon", "time_from": "09:00", "time_to": "10:00"},
            {"weekday": "Mon", "time_from": "10:00", "time_to": "11:00"},
        ]
        _validate_slots(slots)

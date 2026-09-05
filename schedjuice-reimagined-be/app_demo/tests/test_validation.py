from django.test import SimpleTestCase

from app_demo.validation import validate_brief

class BriefValidationTests(SimpleTestCase):
    def test_rejects_missing_slug(self):
        with self.assertRaises(ValueError):
            validate_brief(
                {
                    "school_name": "X",
                    "niche": "tutoring-center",
                    "pain_points": ["a"],
                    "demo_date": "2026-06-30",
                }
            )


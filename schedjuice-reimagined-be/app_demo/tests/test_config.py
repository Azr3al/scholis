from datetime import date
from unittest.mock import patch

from django.test import SimpleTestCase

from app_demo.config import resolve_demo_config
from app_demo.terminology import substitute


class ResolveDemoConfigTests(SimpleTestCase):
    @patch("app_demo.config.load_use_case")
    def test_collects_packs_from_pain_points_and_orders_stops(self, mock_load_use_case):
        use_cases = {
            "schedule_lookup": {
                "id": "schedule_lookup",
                "label": "Schedule lookup",
                "scenario_packs": ["today-classes"],
                "demo_stops": [
                    {
                        "route": "/shared",
                        "role": "demo-admin",
                        "talk_track": "Open {{category}} board",
                    },
                    {
                        "route": "/calendar",
                        "role": "demo-admin",
                        "talk_track": "Review today's calendar",
                    },
                ],
            },
            "unpaid_fees": {
                "id": "unpaid_fees",
                "label": "Unpaid fees",
                "scenario_packs": ["unpaid-students"],
                "demo_stops": [
                    {
                        "route": "/shared",
                        "role": "demo-finance",
                        "talk_track": "Duplicate route should be removed",
                    },
                    {
                        "route": "/finance/student-payments",
                        "role": "demo-finance",
                        "talk_track": "Review unpaid {{student_plural}}",
                    },
                ],
            },
        }
        mock_load_use_case.side_effect = lambda use_case_id: use_cases[use_case_id]

        blueprint = {
            "id": "tutoring-center",
            "terminology": {"category": "Subject", "student_plural": "Learners"},
            "org_toggles": {
                "homepage_title": "{{category}} Dashboard",
            },
            "academic_structure": {},
            "default_scenario_packs": ["enrollment-pipeline"],
            "use_case_order": ["schedule_lookup", "unpaid_fees"],
        }
        brief = {
            "school_name": "Sunrise Learning Center",
            "slug": "sunrise-center",
            "niche": "tutoring-center",
            "pain_points": ["unpaid_fees", "schedule_lookup"],
            "terminology_overrides": {"category": "Subject Area"},
            "demo_date": "2026-06-30",
        }

        resolved = resolve_demo_config(blueprint, brief)

        self.assertEqual(
            resolved.scenario_pack_ids,
            ["enrollment-pipeline", "today-classes", "unpaid-students"],
        )
        self.assertEqual(
            [stop["route"] for stop in resolved.demo_stops],
            ["/shared", "/calendar", "/finance/student-payments"],
        )
        self.assertEqual(
            [stop["talk_track"] for stop in resolved.demo_stops],
            [
                "Open Subject Area board",
                "Review today's calendar",
                "Review unpaid Learners",
            ],
        )
        self.assertEqual(resolved.schema_name, "xdemo_sunrise_center")
        self.assertEqual(resolved.domain_url, "sunrise-center-demo.thiha.net")
        self.assertEqual(resolved.demo_date, date(2026, 6, 30))
        self.assertEqual(resolved.org_toggles["homepage_title"], "Subject Area Dashboard")

    @patch("app_demo.config.load_use_case")
    def test_merges_campus_org_toggles_when_staff_pain_point_selected(self, mock_load_use_case):
        mock_load_use_case.return_value = {
            "id": "staff_campus_attendance",
            "label": "Staff attendance",
            "scenario_packs": ["campus-staff-attendance"],
            "demo_stops": [],
        }
        blueprint = {
            "id": "montessori",
            "terminology": {},
            "org_toggles": {"timezone": "Asia/Rangoon"},
            "academic_structure": {},
            "default_scenario_packs": [],
            "use_case_order": ["staff_campus_attendance"],
            "org_toggles_campus": {
                "is_building_checkin_enabled": True,
                "use_teacher_session_checkin": False,
                "campus_checkin_verification_mode": "selfie_only",
            },
        }
        brief = {
            "school_name": "YMEC",
            "slug": "yangon-montessori",
            "niche": "montessori",
            "pain_points": ["staff_campus_attendance"],
            "demo_date": "2026-06-30",
        }

        resolved = resolve_demo_config(blueprint, brief)

        self.assertTrue(resolved.org_toggles["is_building_checkin_enabled"])
        self.assertFalse(resolved.org_toggles["use_teacher_session_checkin"])
        self.assertEqual(resolved.org_toggles["campus_checkin_verification_mode"], "selfie_only")


class TerminologySubstituteTests(SimpleTestCase):
    def test_substitutes_nested_dicts_and_lists(self):
        value = {
            "title": "{{category}}",
            "items": ["{{student}}", {"label": "{{missing}}"}],
            "raw": 1,
        }

        result = substitute(value, {"category": "Subject", "student": "Learner"})

        self.assertEqual(
            result,
            {
                "title": "Subject",
                "items": ["Learner", {"label": "{{missing}}"}],
                "raw": 1,
            },
        )

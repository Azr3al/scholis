import json
from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory

from django.test import SimpleTestCase

from app_demo.config import ResolvedDemoConfig
from app_demo.script_generator import generate_demo_script


class ScriptGeneratorTests(SimpleTestCase):
    def _build_config(self) -> ResolvedDemoConfig:
        return ResolvedDemoConfig(
            school_name="Sunrise Learning Center",
            slug="sunrise-center",
            schema_name="xdemo_sunrise_center",
            domain_url="sunrise-center-demo.thiha.net",
            demo_date=date(2026, 6, 30),
            terminology={},
            org_toggles={},
            academic_structure={},
            scenario_pack_ids=["today-classes", "unpaid-students"],
            demo_stops=[
                {
                    "use_case": "schedule_lookup",
                    "route": "/calendar",
                    "role": "demo-admin",
                    "talk_track": "Review today's classes.",
                    "look_for": "DEMO-Today-1 sessions",
                },
                {
                    "use_case": "unpaid_fees",
                    "route": "/finance/student-payments",
                    "role": "demo-finance",
                    "talk_track": "Show unpaid student balances.",
                    "deep_link": "/finance/student-payments?status=unpaid",
                },
            ],
            physical_campuses=[],
        )

    def test_writes_markdown_and_json_outputs(self):
        config = self._build_config()
        pack_ctx = {
            "demo_accounts": {
                "password": "Demo12345!",
                "accounts": [
                    {
                        "email": "demo-admin@sunrise-center-demo.thiha.net",
                        "role": "admin",
                    }
                ],
            }
        }

        with TemporaryDirectory() as tmp_dir:
            artifacts_root = Path(tmp_dir)
            result = generate_demo_script(
                config=config,
                pack_ctx=pack_ctx,
                artifacts_root=artifacts_root,
            )

            markdown_path = Path(result["markdown_path"])
            json_path = Path(result["json_path"])
            self.assertTrue(markdown_path.exists())
            self.assertTrue(json_path.exists())

            markdown_text = markdown_path.read_text(encoding="utf-8")
            self.assertIn("Demo Script: Sunrise Learning Center", markdown_text)
            self.assertIn("demo-admin@sunrise-center-demo.thiha.net", markdown_text)
            self.assertIn("/finance/student-payments", markdown_text)

            payload = json.loads(json_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["slug"], "sunrise-center")
            self.assertEqual(payload["domain_url"], "sunrise-center-demo.thiha.net")
            self.assertEqual(payload["demo_date"], "2026-06-30")
            self.assertEqual(len(payload["stops"]), 2)
            self.assertEqual(
                payload["handoff"]["start_routes"],
                ["/calendar", "/finance/student-payments"],
            )

    def test_handles_empty_stops(self):
        config = self._build_config()
        config.demo_stops = []

        with TemporaryDirectory() as tmp_dir:
            artifacts_root = Path(tmp_dir)
            result = generate_demo_script(
                config=config,
                pack_ctx={},
                artifacts_root=artifacts_root,
            )

            markdown_path = Path(result["markdown_path"])
            markdown_text = markdown_path.read_text(encoding="utf-8")
            self.assertIn("No demo stops configured.", markdown_text)

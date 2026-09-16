from django.test import SimpleTestCase
from unittest.mock import MagicMock, patch

from app_ai.roster_intent import is_explicit_roster_command, parse_roster_command


class RosterCommandParserTests(SimpleTestCase):
    def setUp(self):
        self.user = MagicMock(id=42, name="Thiha Swan Htet")

    def test_remove_me_from_course(self):
        cmd = parse_roster_command("now, remove me from KET 152", user=self.user)
        self.assertIsNotNone(cmd)
        self.assertEqual(cmd.action, "remove_staff")
        self.assertEqual(cmd.user_id, 42)
        self.assertIn("KET 152", cmd.course_query or "")

    def test_remove_him_from_course(self):
        cmd = parse_roster_command("remove him from KET 152", user=self.user)
        self.assertIsNotNone(cmd)
        self.assertEqual(cmd.action, "remove_staff")
        self.assertIsNone(cmd.user_id)
        self.assertEqual(cmd.staff_query, "him")

    def test_assign_as_at(self):
        cmd = parse_roster_command("assign me as AT on KET 152 WE", user=self.user)
        self.assertIsNotNone(cmd)
        self.assertEqual(cmd.action, "assign_staff")
        self.assertEqual(cmd.role_hint, "AT")

    def test_read_query_returns_none(self):
        cmd = parse_roster_command("how many students in KET 152", user=self.user)
        self.assertIsNone(cmd)

    def test_remove_without_course_not_explicit(self):
        cmd = parse_roster_command("remove me", user=self.user)
        self.assertIsNotNone(cmd)
        self.assertFalse(is_explicit_roster_command(cmd, user=self.user, org=None))

    @patch("app_ai.tools.resolve.resolve_accessible_course")
    def test_explicit_when_course_resolves(self, mock_resolve):
        mock_resolve.return_value = {"status": "ok", "course": MagicMock(title="KET 152 WE")}
        cmd = parse_roster_command("remove me from KET 152", user=self.user)
        self.assertTrue(is_explicit_roster_command(cmd, user=self.user, org=MagicMock()))

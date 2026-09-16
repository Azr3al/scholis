from io import StringIO
from unittest.mock import patch

from django.test import SimpleTestCase

from app_microsoft.management.commands.backfill_teams_announcements import Command


class BackfillTeamsAnnouncementsCommandTests(SimpleTestCase):
    @patch("app_microsoft.management.commands.backfill_teams_announcements.Organization")
    def test_dry_run_does_not_enqueue(self, mock_org_model):
        mock_org = type("Org", (), {"schema_name": "demo"})()
        mock_org_model.objects.filter.return_value = [mock_org]

        with patch(
            "app_microsoft.management.commands.backfill_teams_announcements.schema_context"
        ) as mock_schema, patch(
            "app_microsoft.management.commands.backfill_teams_announcements.eligible_unsent_queryset"
        ) as mock_qs, patch(
            "app_microsoft.management.commands.backfill_teams_announcements.schedule_announcement_teams_sync"
        ) as mock_schedule:
            mock_schema.return_value.__enter__ = lambda s: None
            mock_schema.return_value.__exit__ = lambda s, *a: None
            mock_qs.return_value.count.return_value = 2
            mock_qs.return_value.__getitem__.return_value = []

            out = StringIO()
            Command(stdout=out).handle(commit=False)

        mock_schedule.assert_not_called()
        self.assertIn("Dry-run only", out.getvalue())

    @patch("app_microsoft.management.commands.backfill_teams_announcements.Organization")
    def test_commit_enqueues_eligible_rows(self, mock_org_model):
        mock_org = type("Org", (), {"schema_name": "demo"})()
        mock_org_model.objects.filter.return_value = [mock_org]
        announcement = type("Ann", (), {"id": 9, "course_id": 3})()

        with patch(
            "app_microsoft.management.commands.backfill_teams_announcements.schema_context"
        ) as mock_schema, patch(
            "app_microsoft.management.commands.backfill_teams_announcements.eligible_unsent_queryset"
        ) as mock_qs, patch(
            "app_microsoft.management.commands.backfill_teams_announcements.schedule_announcement_teams_sync"
        ) as mock_schedule:
            mock_schema.return_value.__enter__ = lambda s: None
            mock_schema.return_value.__exit__ = lambda s, *a: None
            mock_qs.return_value.count.return_value = 1
            mock_qs.return_value.__getitem__.return_value = [announcement]

            Command(stdout=StringIO()).handle(commit=True, limit=10)

        mock_schedule.assert_called_once_with(announcement, mock_org)

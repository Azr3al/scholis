from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_announcement.models import PostType
from app_microsoft.announcement_helpers import (
    _build_teams_html,
    sync_course_announcement_to_teams,
    tenant_teams_sync_enabled,
)
from app_microsoft.delegated_auth import Poster, PostedAs

class TenantTeamsSyncEnabledTests(SimpleTestCase):

    def test_disabled_when_teams_creation_off(self):
        tenant = SimpleNamespace(is_microsoft_on=True, is_teams_creation_enabled=False)
        self.assertFalse(tenant_teams_sync_enabled(tenant))

class BuildTeamsHtmlTests(SimpleTestCase):
    def test_daily_lesson_heading(self):
        announcement = SimpleNamespace(
            post_type=PostType.DAILY_LESSON,
            finished_unit=5,
            title=None,
            html_data="<p>Notes</p>",
            data=None,
            attachments=MagicMock(all=MagicMock(return_value=[])),
        )
        html, _hosted = _build_teams_html(announcement)
        self.assertIn("<h2>Unit 5 covered today</h2>", html)
        self.assertIn("<p>Notes</p>", html)

    def test_daily_lesson_heading_without_finished_unit(self):
        announcement = SimpleNamespace(
            post_type=PostType.DAILY_LESSON,
            finished_unit=None,
            title=None,
            html_data="<p>Notes</p>",
            data=None,
            attachments=MagicMock(all=MagicMock(return_value=[])),
        )
        html, _hosted = _build_teams_html(announcement)
        self.assertIn("<h2>Daily lesson</h2>", html)
        self.assertNotIn("Unit None", html)

class SyncCourseAnnouncementToTeamsTests(SimpleTestCase):
    def _announcement(self, **overrides):
        base = {
            "id": 1,
            "post_type": PostType.ANNOUNCEMENT,
            "title": "Hello",
            "finished_unit": None,
            "html_data": "<p>Body</p>",
            "data": None,
            "microsoft_teams_message_id": None,
            "microsoft_teams_message_ids": None,
            "microsoft_teams_team_id": None,
            "microsoft_teams_channel_id": None,
            "attachments": MagicMock(all=MagicMock(return_value=[])),
            "save": MagicMock(),
        }
        base.update(overrides)
        return SimpleNamespace(**base)

    def _course(self, **overrides):
        base = {
            "id": 10,
            "microsoft_group_id": "team-1",
            "microsoft_channel_id": "ch-1",
            "save": MagicMock(),
        }
        base.update(overrides)
        return SimpleNamespace(**base)

    def _poster(self):
        return Poster(PostedAs.SERVICE_ACCOUNT, MagicMock(), None)

    @patch("app_microsoft.announcement_helpers._resolve_course_channel", return_value="ch-1")
    def test_update_patches_existing_message(self, _mock_resolve):
        meeting = MagicMock()
        meeting.patch_channel_message.return_value = MagicMock(status_code=200)
        announcement = self._announcement(
            microsoft_teams_message_id="msg-old",
            microsoft_teams_team_id="team-1",
            microsoft_teams_channel_id="ch-1",
            microsoft_teams_posted_as=PostedAs.SERVICE_ACCOUNT,
            microsoft_teams_posted_by_id=None,
        )
        course = self._course()

        sync_course_announcement_to_teams(
            announcement,
            SimpleNamespace(is_microsoft_on=True, is_teams_creation_enabled=True),
            course,
            meeting,
            self._poster(),
        )

        meeting.patch_channel_message.assert_called_once()
        meeting.post_channel_message.assert_not_called()

    @patch("app_microsoft.announcement_helpers._resolve_course_channel", return_value="ch-2")
    def test_patch_failure_posts_new_and_soft_deletes_old(self, _mock_resolve):
        meeting = MagicMock()
        meeting.patch_channel_message.return_value = MagicMock(status_code=404)
        meeting.post_channel_message.return_value = MagicMock(
            status_code=201,
            json=MagicMock(return_value={"id": "msg-new"}),
        )
        meeting.soft_delete_channel_message.return_value = MagicMock(status_code=204)
        announcement = self._announcement(
            microsoft_teams_message_id="msg-old",
            microsoft_teams_team_id="team-1",
            microsoft_teams_channel_id="ch-1",
            microsoft_teams_posted_as=PostedAs.SERVICE_ACCOUNT,
            microsoft_teams_posted_by_id=None,
        )
        course = self._course(microsoft_channel_id="ch-2")

        sync_course_announcement_to_teams(
            announcement,
            SimpleNamespace(is_microsoft_on=True, is_teams_creation_enabled=True),
            course,
            meeting,
            self._poster(),
        )

        meeting.post_channel_message.assert_called_once()
        meeting.soft_delete_channel_message.assert_called_once_with(
            "team-1", "ch-1", "msg-old"
        )
        self.assertEqual(announcement.microsoft_teams_message_id, "msg-new")

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_announcement.models import PostType
from app_microsoft.announcement_helpers import (
    TeamsSendResult,
    _build_teams_html,
    sync_course_announcement_to_teams,
)
from app_microsoft.delegated_auth import Poster, PostedAs
from app_microsoft.teams_image_content import build_hosted_image_entries


def _mock_image_attachment(filename="a.png", data=b"\x89PNG"):
    att = MagicMock()
    att.id = 1
    att.filename = filename
    file_handle = MagicMock()
    file_handle.read.return_value = data
    att.file.open.return_value.__enter__ = MagicMock(return_value=file_handle)
    att.file.open.return_value.__exit__ = MagicMock(return_value=False)
    att.file.url = f"https://cdn.example.com/{filename}"
    return att

class BuildHostedImageEntriesTests(SimpleTestCase):
    def test_builds_hosted_content_for_small_image(self):
        att = _mock_image_attachment("a.png", b"\x89PNG small")
        html_parts, hosted = build_hosted_image_entries([att])
        self.assertEqual(len(hosted), 1)
        self.assertEqual(hosted[0]["@microsoft.graph.temporaryId"], "1")
        self.assertEqual(hosted[0]["contentType"], "image/png")
        self.assertIn("../hostedContents/1/$value", html_parts[0])

    def test_oversized_image_falls_back_to_link(self):
        att = _mock_image_attachment("big.jpg", b"x" * (4 * 1024 * 1024 + 1))
        html_parts, hosted = build_hosted_image_entries([att])
        self.assertEqual(hosted, [])
        self.assertIn('href="https://cdn.example.com/big.jpg"', html_parts[0])

class BuildTeamsHtmlInlineImageTests(SimpleTestCase):
    def test_includes_hosted_content_refs(self):
        att = _mock_image_attachment("x.png", b"\x89PNG")
        announcement = SimpleNamespace(
            post_type=PostType.DAILY_LESSON,
            finished_unit=3,
            title=None,
            html_data="<p>Notes</p>",
            data=None,
            attachments=MagicMock(all=MagicMock(return_value=[att])),
        )
        html, hosted = _build_teams_html(announcement)
        self.assertIn("../hostedContents/1/$value", html)
        self.assertEqual(len(hosted), 1)

class SyncRepostWhenImagesTests(SimpleTestCase):
    @patch(
        "app_microsoft.announcement_helpers._post_batches_and_store",
        return_value=(["msg-new"], TeamsSendResult.success()),
    )
    @patch("app_microsoft.announcement_helpers._soft_delete_teams_messages")
    @patch("app_microsoft.announcement_helpers._resolve_course_channel", return_value="ch-1")
    def test_skips_patch_when_images_present(self, _resolve, _mock_delete, mock_post):
        att = _mock_image_attachment("a.png", b"\x89PNG")
        announcement = SimpleNamespace(
            id=1,
            post_type=PostType.DAILY_LESSON,
            finished_unit=1,
            title=None,
            html_data="<p>x</p>",
            data=None,
            microsoft_teams_message_id="msg-old",
            microsoft_teams_message_ids=["msg-old"],
            microsoft_teams_team_id="team-1",
            microsoft_teams_channel_id="ch-1",
            microsoft_teams_posted_as=PostedAs.SERVICE_ACCOUNT,
            microsoft_teams_posted_by_id=None,
            attachments=MagicMock(all=MagicMock(return_value=[att])),
            save=MagicMock(),
        )
        course = SimpleNamespace(
            id=10,
            microsoft_group_id="team-1",
            microsoft_channel_id="ch-1",
            save=MagicMock(),
        )
        meeting = MagicMock()
        sync_course_announcement_to_teams(
            announcement,
            SimpleNamespace(is_microsoft_on=True, is_teams_creation_enabled=True),
            course,
            meeting,
            Poster(PostedAs.SERVICE_ACCOUNT, MagicMock(), None),
        )
        meeting.patch_channel_message.assert_not_called()
        mock_post.assert_called_once()

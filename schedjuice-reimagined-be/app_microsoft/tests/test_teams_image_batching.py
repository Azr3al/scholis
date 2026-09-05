from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_announcement.models import PostType
from app_microsoft.announcement_helpers import (
    TeamsSendOutcome,
    TeamsSendResult,
    _build_teams_message_batches,
    _post_batches_and_store,
    sync_course_announcement_to_teams,
)
from app_microsoft.delegated_auth import Poster, PostedAs
from app_microsoft.teams_image_content import (
    MAX_HOSTED_BYTES,
    MAX_HOSTED_BYTES_PER_MESSAGE,
    MAX_IMAGES_PER_MESSAGE,
    build_image_message_batches,
)

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

class BuildImageMessageBatchesTests(SimpleTestCase):
    def test_splits_when_more_than_max_images_per_message(self):
        atts = [
            _mock_image_attachment(f"img{i}.png", b"x" * 100)
            for i in range(MAX_IMAGES_PER_MESSAGE + 5)
        ]
        batches = build_image_message_batches(atts)
        self.assertEqual(len(batches), 2)
        self.assertEqual(len(batches[0][1]), MAX_IMAGES_PER_MESSAGE)
        self.assertEqual(len(batches[1][1]), 5)
        self.assertEqual(batches[0][1][0]["@microsoft.graph.temporaryId"], "1")
        self.assertEqual(batches[1][1][0]["@microsoft.graph.temporaryId"], "1")

    def test_splits_when_byte_budget_exceeded(self):
        chunk = MAX_HOSTED_BYTES_PER_MESSAGE // 3 + 1
        atts = [
            _mock_image_attachment("a.png", b"x" * chunk),
            _mock_image_attachment("b.png", b"x" * chunk),
            _mock_image_attachment("c.png", b"x" * chunk),
            _mock_image_attachment("d.png", b"x" * chunk),
        ]
        batches = build_image_message_batches(atts)
        self.assertGreater(len(batches), 1)

    def test_oversized_image_becomes_link_without_hosted_entry(self):
        att = _mock_image_attachment("big.jpg", b"x" * (MAX_HOSTED_BYTES + 1))
        batches = build_image_message_batches([att])
        self.assertEqual(len(batches), 1)
        self.assertEqual(batches[0][1], [])
        self.assertIn("big.jpg", batches[0][0][0])

class BuildTeamsMessageBatchesTests(SimpleTestCase):
    def test_twenty_images_produce_two_message_batches(self):
        atts = [
            _mock_image_attachment(f"img{i}.png", b"x" * 50)
            for i in range(20)
        ]
        announcement = SimpleNamespace(
            post_type=PostType.ANNOUNCEMENT,
            title="Gallery",
            finished_unit=None,
            html_data="<p>See photos</p>",
            data=None,
            attachments=MagicMock(all=MagicMock(return_value=atts)),
        )
        batches = _build_teams_message_batches(announcement)
        self.assertEqual(len(batches), 2)
        self.assertIn("Gallery", batches[0][0])
        self.assertIn("(continued)", batches[1][0])
        self.assertEqual(len(batches[0][1]), 10)
        self.assertEqual(len(batches[1][1]), 10)

class PostBatchesAndStoreTests(SimpleTestCase):
    def test_partial_failure_cleans_up_new_messages(self):
        meeting = MagicMock()
        meeting.post_channel_message.side_effect = [
            MagicMock(status_code=201, json=MagicMock(return_value={"id": "m1"})),
            MagicMock(status_code=400, text="too big"),
        ]
        meeting.soft_delete_channel_message.return_value = MagicMock(status_code=204)
        announcement = SimpleNamespace(id=1, save=MagicMock())
        batches = [("<p>one</p>", []), ("<p>two</p>", [])]

        poster = Poster(PostedAs.SERVICE_ACCOUNT, MagicMock(), None)
        new_ids, result = _post_batches_and_store(
            meeting,
            announcement,
            team_id="team-1",
            channel_id="ch-1",
            batches=batches,
            poster=poster,
        )

        self.assertEqual(new_ids, [])
        self.assertEqual(result.outcome, TeamsSendOutcome.PERMANENT_FAILURE)
        self.assertIn("HTTP 400", result.detail or "")
        meeting.soft_delete_channel_message.assert_called_once_with(
            "team-1", "ch-1", "m1"
        )
        announcement.save.assert_not_called()

class SyncMultiMessageTests(SimpleTestCase):
    @patch("app_microsoft.announcement_helpers._resolve_course_channel", return_value="ch-1")
    def test_repost_with_many_images_deletes_all_old_messages(self, _mock_resolve):
        atts = [
            _mock_image_attachment(f"img{i}.png", b"x" * 50)
            for i in range(12)
        ]
        meeting = MagicMock()
        meeting.post_channel_message.side_effect = [
            MagicMock(status_code=201, json=MagicMock(return_value={"id": "new-1"})),
            MagicMock(status_code=201, json=MagicMock(return_value={"id": "new-2"})),
        ]
        meeting.soft_delete_channel_message.return_value = MagicMock(status_code=204)
        announcement = SimpleNamespace(
            id=1,
            post_type=PostType.ANNOUNCEMENT,
            title="Photos",
            finished_unit=None,
            html_data="<p>Hi</p>",
            data=None,
            microsoft_teams_message_id="old-1",
            microsoft_teams_message_ids=["old-1", "old-2"],
            microsoft_teams_team_id="team-1",
            microsoft_teams_channel_id="ch-1",
            microsoft_teams_posted_as=PostedAs.SERVICE_ACCOUNT,
            microsoft_teams_posted_by_id=None,
            attachments=MagicMock(all=MagicMock(return_value=atts)),
            save=MagicMock(),
        )
        course = SimpleNamespace(
            id=10,
            microsoft_group_id="team-1",
            microsoft_channel_id="ch-1",
            save=MagicMock(),
        )

        sync_course_announcement_to_teams(
            announcement,
            SimpleNamespace(is_microsoft_on=True, is_teams_creation_enabled=True),
            course,
            meeting,
            Poster(PostedAs.SERVICE_ACCOUNT, MagicMock(), None),
        )

        self.assertEqual(meeting.post_channel_message.call_count, 2)
        meeting.soft_delete_channel_message.assert_any_call("team-1", "ch-1", "old-1")
        meeting.soft_delete_channel_message.assert_any_call("team-1", "ch-1", "old-2")
        self.assertEqual(announcement.microsoft_teams_message_ids, ["new-1", "new-2"])

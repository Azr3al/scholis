from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_announcement.models import MicrosoftTeamsStatus, PostType
from app_microsoft.announcement_helpers import (
    MAX_TASK_ATTEMPTS,
    TeamsSendOutcome,
    TeamsSendResult,
    _failure_message_for_result,
    _resolve_announcement_channel,
    mark_teams_sync_failed,
    mark_teams_sync_pending,
    schedule_announcement_teams_sync,
    send_announcement_to_teams,
    send_announcement_to_teams_async,
    sync_course_announcement_to_teams,
)
from app_microsoft.delegated_auth import Poster, PostedAs


class ResolveAnnouncementChannelTests(SimpleTestCase):
    def test_uses_override_without_touching_course(self):
        meeting = MagicMock()
        announcement = SimpleNamespace(microsoft_channel_id="override-ch")
        course = SimpleNamespace(
            id=1,
            microsoft_channel_id="course-ch",
            microsoft_group_id="team-1",
            save=MagicMock(),
        )

        channel_id = _resolve_announcement_channel(meeting, announcement, course)

        self.assertEqual(channel_id, "override-ch")
        meeting.get_general_channel_id.assert_not_called()
        course.save.assert_not_called()

    @patch("app_microsoft.announcement_helpers._resolve_course_channel", return_value="course-ch")
    def test_falls_back_to_course_channel(self, _mock_resolve):
        meeting = MagicMock()
        announcement = SimpleNamespace(microsoft_channel_id=None)
        course = SimpleNamespace(id=1)

        channel_id = _resolve_announcement_channel(meeting, announcement, course)

        self.assertEqual(channel_id, "course-ch")


class SyncCourseAnnouncementChannelOverrideTests(SimpleTestCase):
    @patch(
        "app_microsoft.announcement_helpers._post_batches_and_store",
        return_value=(["msg-1"], TeamsSendResult.success()),
    )
    @patch(
        "app_microsoft.announcement_helpers._resolve_course_channel",
        return_value="course-ch",
    )
    def test_posts_to_override_channel(self, _mock_course_channel, mock_post):
        meeting = MagicMock()
        announcement = SimpleNamespace(
            id=1,
            post_type=PostType.ANNOUNCEMENT,
            title="Hello",
            finished_unit=None,
            html_data="<p>Body</p>",
            data=None,
            microsoft_channel_id="override-ch",
            microsoft_teams_message_id=None,
            microsoft_teams_message_ids=None,
            microsoft_teams_team_id=None,
            microsoft_teams_channel_id=None,
            attachments=MagicMock(all=MagicMock(return_value=[])),
            save=MagicMock(),
        )
        course = SimpleNamespace(
            id=10,
            microsoft_group_id="team-1",
            microsoft_channel_id="course-ch",
            save=MagicMock(),
        )

        sync_course_announcement_to_teams(
            announcement,
            SimpleNamespace(is_microsoft_on=True, is_teams_creation_enabled=True),
            course,
            meeting,
            Poster(PostedAs.SERVICE_ACCOUNT, MagicMock(), None),
        )

        _mock_course_channel.assert_not_called()
        mock_post.assert_called_once()
        self.assertEqual(mock_post.call_args.kwargs["channel_id"], "override-ch")


class SyncCourseAnnouncementPreCheckTests(SimpleTestCase):
    def test_permanent_failure_when_course_has_no_team(self):
        meeting = MagicMock()
        announcement = SimpleNamespace(id=1)
        course = SimpleNamespace(id=10, microsoft_group_id=None)

        result = sync_course_announcement_to_teams(
            announcement,
            SimpleNamespace(is_microsoft_on=True, is_teams_creation_enabled=True),
            course,
            meeting,
            Poster(PostedAs.SERVICE_ACCOUNT, MagicMock(), None),
        )

        self.assertEqual(result.outcome, TeamsSendOutcome.PERMANENT_FAILURE)
        self.assertIn("microsoft_group_id", result.detail or "")


class TeamsStatusHelpersTests(SimpleTestCase):
    def test_mark_pending_clears_error(self):
        announcement = SimpleNamespace(
            microsoft_teams_status=None,
            microsoft_teams_error="old",
            save=MagicMock(),
        )
        mark_teams_sync_pending(announcement)
        self.assertEqual(announcement.microsoft_teams_status, MicrosoftTeamsStatus.PENDING)
        self.assertIsNone(announcement.microsoft_teams_error)
        announcement.save.assert_called_once()

    def test_mark_failed_sets_error(self):
        announcement = SimpleNamespace(
            microsoft_teams_status=None,
            microsoft_teams_error=None,
            save=MagicMock(),
        )
        mark_teams_sync_failed(announcement, "boom")
        self.assertEqual(announcement.microsoft_teams_status, MicrosoftTeamsStatus.FAILED)
        self.assertEqual(announcement.microsoft_teams_error, "boom")


class FailureMessageForResultTests(SimpleTestCase):
    def test_failure_message_never_says_retrying_when_failed(self):
        message = _failure_message_for_result(
            TeamsSendResult.transient("HTTP 503: busy"),
            attempt=MAX_TASK_ATTEMPTS - 1,
        )
        self.assertNotIn("retrying", message.lower())
        self.assertIn("HTTP 503", message)

    def test_permanent_failure_includes_detail(self):
        message = _failure_message_for_result(
            TeamsSendResult.permanent("Course 10 has no microsoft_group_id"),
            attempt=0,
        )
        self.assertIn("Could not send to Microsoft Teams", message)
        self.assertIn("microsoft_group_id", message)


class ScheduleTeamsSyncTests(SimpleTestCase):
    @patch("app_microsoft.announcement_helpers.send_announcement_to_teams_async")
    def test_sets_pending_and_enqueues(self, mock_async):
        announcement = SimpleNamespace(
            id=7,
            send_to_microsoft=True,
            microsoft_teams_status=None,
            microsoft_teams_error=None,
            save=MagicMock(),
        )
        tenant = SimpleNamespace(schema_name="demo")

        schedule_announcement_teams_sync(announcement, tenant)

        self.assertEqual(announcement.microsoft_teams_status, MicrosoftTeamsStatus.PENDING)
        mock_async.delay.assert_called_once_with(7, "demo", 0, False)


class SendAnnouncementToTeamsAsyncTests(SimpleTestCase):
    def _inner_async(self):
        return send_announcement_to_teams_async.__wrapped__

    @patch("app_microsoft.announcement_helpers.send_announcement_to_teams")
    @patch.object(send_announcement_to_teams_async, "delay")
    def test_reenqueues_on_transient_failure(self, mock_delay, mock_send):
        mock_send.return_value = TeamsSendResult.transient("HTTP 503: busy")
        announcement = SimpleNamespace(id=3, save=MagicMock())
        tenant = SimpleNamespace(schema_name="demo")

        self._inner_async()(announcement, tenant, attempt=0)

        mock_delay.assert_called_once_with(3, "demo", 1, False)

    @patch("app_microsoft.announcement_helpers.send_announcement_to_teams")
    @patch("app_microsoft.announcement_helpers.mark_teams_sync_failed")
    def test_marks_failed_with_graph_detail_after_max_attempts(
        self, mock_failed, mock_send
    ):
        mock_send.return_value = TeamsSendResult.transient("HTTP 503: busy")
        announcement = SimpleNamespace(id=3, save=MagicMock())
        tenant = SimpleNamespace(schema_name="demo")

        self._inner_async()(
            announcement,
            tenant,
            attempt=MAX_TASK_ATTEMPTS - 1,
        )

        mock_failed.assert_called_once()
        error_message = mock_failed.call_args[0][1]
        self.assertIn("HTTP 503", error_message)
        self.assertNotIn("retrying", error_message.lower())


class SendAnnouncementToTeamsAuthTests(SimpleTestCase):
    @patch("app_microsoft.announcement_helpers.build_meeting_for_poster")
    @patch("app_microsoft.announcement_helpers.resolve_poster")
    @patch("app_microsoft.announcement_helpers.get_courses_for_announcement")
    def test_missing_service_account_is_permanent(
        self, mock_courses, mock_resolve, mock_build_meeting
    ):
        mock_courses.return_value.count.return_value = 1
        mock_resolve.return_value = (
            None,
            "Microsoft service account is not connected for this organization.",
        )

        announcement = SimpleNamespace(
            id=1,
            send_to_microsoft=True,
            course_id=10,
            course_filters=None,
        )
        tenant = SimpleNamespace(
            schema_name="demo",
            is_microsoft_on=True,
            is_teams_creation_enabled=True,
        )

        result = send_announcement_to_teams(announcement, tenant)

        self.assertEqual(result.outcome, TeamsSendOutcome.PERMANENT_FAILURE)
        self.assertIn("service account", (result.detail or "").lower())
        mock_build_meeting.assert_not_called()


class GraphRequestRetryTests(SimpleTestCase):
    def test_retries_transient_http_status(self):
        from app_microsoft.graph_wrapper.base import request_with_retry

        responses = [
            SimpleNamespace(status_code=503, headers={}, text="busy"),
            SimpleNamespace(status_code=201, headers={}, text="ok"),
        ]

        def call():
            return responses.pop(0)

        with patch("app_microsoft.graph_wrapper.base.time.sleep"):
            result = request_with_retry(call, max_attempts=3)

        self.assertEqual(result.status_code, 201)

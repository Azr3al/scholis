"""Unit tests for ``app_zoom.client`` (mock HTTP; no Zoom network calls)."""
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_zoom.client import (
    get_meeting,
    list_past_meeting_participants,
    list_user_meetings,
)

class ZoomClientHttpTest(SimpleTestCase):
    def setUp(self):
        self.za = MagicMock()

    @patch("app_zoom.client.requests.get")
    @patch("app_zoom.client.get_valid_access_token", return_value="ATOK")
    def test_get_meeting_404_returns_none(self, _mock_atok, mock_get):
        mock_get.return_value.status_code = 404
        self.assertIsNone(get_meeting(self.za, "missing"))

    @patch("app_zoom.client.requests.get")
    @patch("app_zoom.client.get_valid_access_token", return_value="ATOK")
    def test_list_user_meetings_paginates(self, _mock_atok, mock_get):
        page1 = MagicMock(status_code=200)
        page1.json.return_value = {
            "meetings": [{"id": 1}],
            "next_page_token": "T",
        }
        page2 = MagicMock(status_code=200)
        page2.json.return_value = {"meetings": [{"id": 2}], "next_page_token": ""}
        mock_get.side_effect = [page1, page2]
        meetings = list_user_meetings(self.za, "host-id", meeting_type="upcoming")
        self.assertEqual([m["id"] for m in meetings], [1, 2])
        self.assertEqual(mock_get.call_count, 2)

    @patch("app_zoom.client.requests.get")
    @patch("app_zoom.client.get_valid_access_token", return_value="ATOK")
    def test_list_past_meeting_participants(self, _mock_atok, mock_get):
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {
            "participants": [
                {
                    "user_email": "t@x.edu",
                    "join_time": "2026-05-01T06:00:00Z",
                    "leave_time": "2026-05-01T07:00:00Z",
                    "duration": 3600,
                }
            ],
            "next_page_token": "",
        }
        participants, meta = list_past_meeting_participants(self.za, "abc%2Fuuid")
        self.assertEqual(len(participants), 1)
        self.assertEqual(participants[0]["user_email"], "t@x.edu")
        self.assertEqual(meta.get("instance_uuid"), "abc%2Fuuid")
        self.assertIn("/past_meetings/", mock_get.call_args.args[0])
        self.assertIn("/participants", mock_get.call_args.args[0])


"""Contract tests for MSEducation assignment Graph payloads."""

import json
from datetime import datetime
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch

import pytz

from app_microsoft.graph_wrapper.education import MSEducation


def _tenant_with_cert():
    return SimpleNamespace(
        private_key=MagicMock(
            open=MagicMock(return_value=MagicMock(read=MagicMock(return_value=b"key")))
        ),
        app_id="app-id",
        authority="https://login.microsoftonline.com/t",
        thumbprint="abc",
    )


class CreateAssignmentPayloadTests(TestCase):
    @patch("app_microsoft.graph_wrapper.base.get_msal_app")
    @patch.object(MSEducation, "post")
    def test_create_assignment_includes_assign_if_open_for_future_students(
        self, mock_post, mock_get_app
    ):
        app = MagicMock()
        app.acquire_token_silent.return_value = None
        app.acquire_token_for_client.return_value = {"access_token": "app-tok"}
        mock_get_app.return_value = app
        mock_post.return_value = MagicMock(status_code=201)
        due = pytz.UTC.localize(datetime(2025, 3, 3, 23, 59, 0))

        education = MSEducation(_tenant_with_cert())
        education.create_assignment(
            class_id="class-abc",
            display_name="March 2025 payment",
            instructions="Upload your payment screenshot.",
            due_datetime=due,
        )

        mock_post.assert_called_once()
        _url, body = mock_post.call_args[0]
        payload = json.loads(body)
        self.assertEqual(payload["addedStudentAction"], "assignIfOpen")
        self.assertEqual(
            payload["assignTo"]["@odata.type"],
            "#microsoft.graph.educationAssignmentClassRecipient",
        )
        self.assertEqual(payload["instructions"]["contentType"], "text")

    @patch("app_microsoft.graph_wrapper.base.get_msal_app")
    @patch.object(MSEducation, "post")
    def test_create_assignment_uses_html_content_type_when_requested(
        self, mock_post, mock_get_app
    ):
        app = MagicMock()
        app.acquire_token_silent.return_value = None
        app.acquire_token_for_client.return_value = {"access_token": "app-tok"}
        mock_get_app.return_value = app
        mock_post.return_value = MagicMock(status_code=201)
        due = pytz.UTC.localize(datetime(2025, 3, 3, 23, 59, 0))

        education = MSEducation(_tenant_with_cert())
        education.create_assignment(
            class_id="class-abc",
            display_name="March 2025 payment",
            instructions="<p>Pay here</p>",
            due_datetime=due,
            instructions_content_type="html",
        )

        _url, body = mock_post.call_args[0]
        payload = json.loads(body)
        self.assertEqual(payload["instructions"]["contentType"], "html")
        self.assertEqual(payload["instructions"]["content"], "<p>Pay here</p>")

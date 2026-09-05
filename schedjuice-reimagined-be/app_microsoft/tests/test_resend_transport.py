from io import BytesIO
from unittest.mock import MagicMock, patch

import requests
from django.test import SimpleTestCase, override_settings

from app_microsoft.mail import send_mail
from app_microsoft.resend_transport import send_via_resend


class SendViaResendTests(SimpleTestCase):
    @override_settings(RESEND_API_KEY="")
    @patch("app_microsoft.resend_transport.requests.post")
    def test_missing_api_key_skips_request(self, mock_post):
        status = send_via_resend(subject="Hi", html="<p>Hi</p>", to="user@example.com")
        self.assertEqual(status, 500)
        mock_post.assert_not_called()

    @override_settings(
        RESEND_API_KEY="re_test",
        RESEND_FROM_EMAIL="noreply@schedjuice.com",
        RESEND_FROM_NAME="Schedjuice",
    )
    @patch("app_microsoft.resend_transport.requests.post")
    def test_successful_send(self, mock_post):
        mock_post.return_value = MagicMock(status_code=200, text="ok")
        status = send_via_resend(
            subject="OTP code | Schedjuice",
            html="<p>code</p>",
            to="user@example.com",
        )
        self.assertEqual(status, 200)
        payload = mock_post.call_args.kwargs["json"]
        self.assertEqual(payload["from"], "Schedjuice <noreply@schedjuice.com>")
        self.assertEqual(payload["to"], ["user@example.com"])
        self.assertNotIn("cc", payload)
        self.assertNotIn("bcc", payload)

    @override_settings(RESEND_API_KEY="re_test", RESEND_FROM_EMAIL="noreply@schedjuice.com")
    @patch("app_microsoft.resend_transport.requests.post")
    def test_resend_422_does_not_raise(self, mock_post):
        mock_post.return_value = MagicMock(status_code=422, text='{"message":"invalid"}')
        status = send_via_resend(subject="Hi", html="<p>Hi</p>", to="bad@example.com")
        self.assertEqual(status, 422)

    @override_settings(RESEND_API_KEY="re_test", RESEND_FROM_EMAIL="noreply@schedjuice.com")
    @patch("app_microsoft.resend_transport.requests.post", side_effect=requests.Timeout())
    def test_network_error_returns_502(self, _mock_post):
        status = send_via_resend(subject="Hi", html="<p>Hi</p>", to="user@example.com")
        self.assertEqual(status, 502)

    @override_settings(RESEND_API_KEY="re_test", RESEND_FROM_EMAIL="noreply@schedjuice.com")
    @patch("app_microsoft.resend_transport.requests.post")
    def test_attachment_encoding_uses_filename_fallback(self, mock_post):
        mock_post.return_value = MagicMock(status_code=200, text="ok")
        attachment = MagicMock()
        attachment.filename = None
        attachment.data = BytesIO(b"hello")
        attachment.data.name = "report.pdf"

        send_via_resend(
            subject="Hi",
            html="<p>Hi</p>",
            to="user@example.com",
            attachments=[attachment],
        )
        attachments = mock_post.call_args.kwargs["json"]["attachments"]
        self.assertEqual(attachments[0]["filename"], "report.pdf")
        self.assertEqual(attachments[0]["content"], "aGVsbG8=")


class SendMailRoutingTests(SimpleTestCase):
    @patch("app_microsoft.mail.send_via_resend", return_value=200)
    @patch("app_microsoft.mail.BaseMSRequest")
    def test_microsoft_tenant_uses_graph_not_resend(self, mock_ms, mock_resend):
        tenant = MagicMock(is_microsoft_on=True, schema_name="demo", default_owner_id="owner-1")
        mock_ms.return_value.post.return_value = MagicMock(status_code=202)

        status = send_mail(tenant, "Subject", "<p>body</p>", "user@example.com")

        self.assertEqual(status, 202)
        mock_resend.assert_not_called()
        mock_ms.return_value.post.assert_called_once()

    @patch("app_microsoft.mail.send_via_resend", return_value=200)
    @patch("app_microsoft.mail.BaseMSRequest")
    def test_non_microsoft_tenant_uses_resend(self, mock_ms, mock_resend):
        tenant = MagicMock(is_microsoft_on=False, schema_name="demo")

        status = send_mail(tenant, "Subject", "<p>body</p>", "user@example.com")

        self.assertEqual(status, 200)
        mock_ms.assert_not_called()
        mock_resend.assert_called_once()

from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_microsoft.email_templates import build_subject, render_email


class EmailTemplateTests(SimpleTestCase):
    def test_build_subject_includes_tenant_name(self):
        tenant = MagicMock()
        tenant.name = "Excellent Choice"
        subject = build_subject(tenant, "OTP code")
        self.assertEqual(subject, "OTP code | Schedjuice on behalf of Excellent Choice")

    def test_build_subject_without_tenant_name(self):
        tenant = MagicMock()
        tenant.name = ""
        subject = build_subject(tenant, "OTP code")
        self.assertEqual(subject, "OTP code | Schedjuice")

    def test_escapes_unsafe_tenant_and_recipient_names(self):
        tenant = MagicMock()
        tenant.name = "<script>alert(1)</script>"
        tenant.logo = None
        html = render_email(
            tenant=tenant,
            recipient_name="Bob & Sue",
            heading="Verify your account",
            code="481920",
        )
        self.assertNotIn("<script>", html)
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", html)
        self.assertIn("Bob &amp; Sue", html)

    def test_code_appears_in_body_and_preheader(self):
        tenant = MagicMock()
        tenant.name = "Demo School"
        tenant.logo = None
        html = render_email(
            tenant=tenant,
            heading="Your code",
            code="481920",
        )
        self.assertIn("481920", html)
        self.assertIn("Your code is 481920.", html)

    def test_reset_link_in_button_and_fallback_url(self):
        tenant = MagicMock()
        tenant.name = "Demo School"
        tenant.logo = None
        url = "https://demo.schedjuice.com/reset-password?token=abc"
        html = render_email(
            tenant=tenant,
            heading="Reset password",
            cta_label="Reset password",
            cta_url=url,
        )
        self.assertIn(f'href="{url}"', html)
        self.assertIn(url, html)

    def test_logo_fallback_renders_text_not_empty_img(self):
        tenant = MagicMock()
        tenant.name = "Demo School"
        tenant.logo = None
        html = render_email(tenant=tenant, heading="Hello")
        self.assertIn("Demo School", html)
        self.assertNotIn('src=""', html)

    @patch("app_auth.models.config")
    def test_password_reset_dev_link_uses_localhost(self, mock_config):
        from app_auth.models import User

        mock_config.return_value = True
        tenant = MagicMock()
        tenant.name = "Demo School"
        tenant.domain_url = "demo.schedjuice.com"
        user = User(name="Alice", email="alice@example.com")

        with patch("app_auth.models.send_mail") as mock_send:
            user.send_password_reset_token_email(tenant, "devtok")

        html = mock_send.call_args[0][2]
        self.assertIn("http://localhost:3000/reset-password?token=devtok", html)
        self.assertEqual(
            mock_send.call_args[0][1],
            "Password reset | Schedjuice on behalf of Demo School",
        )

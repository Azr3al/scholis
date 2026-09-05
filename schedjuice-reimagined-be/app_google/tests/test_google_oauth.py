from unittest.mock import patch

from django.core.cache import cache
from django.core.management import call_command
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import RefreshSession, User
from app_google.handoff import create_handoff_code
from app_google.oauth import (
    OAuthReturnOriginError,
    resolve_org_from_return_origin,
    validate_return_origin_for_org,
)
from app_organization.models import Organization

GOOGLE_CLAIMS = {
    "email": "james@schedjuice.com",
    "email_verified": True,
    "sub": "google-subject-123",
    "name": "James",
}

GOOGLE_OAUTH_SETTINGS = {
    "GOOGLE_OAUTH_CLIENT_ID": "test-web.apps.googleusercontent.com",
    "GOOGLE_OAUTH_CLIENT_SECRET": "test-secret",
    "GOOGLE_OAUTH_REDIRECT_URL": "http://testserver/api/v1/google/oauth/callback",
}


@override_settings(**GOOGLE_OAUTH_SETTINGS)
class GoogleOAuthFlowTests(APITestCase):
    schema_name = "xschedjuice"
    google_sub = "google-subject-123"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=cls.schema_name)
            org.is_google_on = True
            org.is_google_login_on = True
            org.save()
            cls.domain_url = org.domain_url
        with schema_context(cls.schema_name):
            User.objects.filter(email="james@schedjuice.com").update(
                is_password_change_required=False,
                is_active=True,
                google_id=cls.google_sub,
            )

    def setUp(self):
        cache.clear()

    def _return_origin(self) -> str:
        return f"https://{self.domain_url}"

    def test_resolve_org_from_return_origin(self):
        org = resolve_org_from_return_origin(self._return_origin())
        self.assertEqual(org.schema_name, self.schema_name)

    def test_resolve_org_rejects_unknown_origin(self):
        with self.assertRaises(OAuthReturnOriginError):
            resolve_org_from_return_origin("https://unknown.example.com")

    @override_settings(DEBUG=True)
    def test_resolve_org_allows_localhost_when_debug(self):
        org = resolve_org_from_return_origin("http://localhost:3000")
        self.assertEqual(org.schema_name, self.schema_name)

    @override_settings(DEBUG=True)
    def test_validate_return_origin_allows_localhost_for_tenant_when_debug(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
        origin = validate_return_origin_for_org("http://localhost:3000", org)
        self.assertEqual(origin, "http://localhost:3000")

    @override_settings(DEBUG=False)
    def test_validate_return_origin_rejects_localhost_in_production(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
        with self.assertRaises(OAuthReturnOriginError):
            validate_return_origin_for_org("http://localhost:3000", org)

    @patch("app_google.oauth_views.build_authorize_url")
    def test_login_start_redirects_to_google(self, mock_build):
        mock_build.return_value = "https://accounts.google.com/o/oauth2/v2/auth?state=abc"
        res = self.client.get(
            reverse("google-oauth-login-start"),
            {
                "return_origin": self._return_origin(),
                "return_path": "/login",
                "remember": "true",
            },
        )
        self.assertEqual(res.status_code, 302)
        self.assertEqual(res["Location"], mock_build.return_value)
        mock_build.assert_called_once()

    def test_login_start_rejects_disabled_org(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_google_login_on = False
            org.save()
        res = self.client.get(
            reverse("google-oauth-login-start"),
            {"return_origin": self._return_origin(), "return_path": "/login"},
        )
        self.assertEqual(res.status_code, 302)
        self.assertIn("google_oauth=error", res["Location"])
        self.assertIn("google_login_disabled", res["Location"])

    @patch("app_google.oauth_views.exchange_code")
    @patch("app_google.oauth_views.verify_token_and_resolve_user")
    def test_callback_login_returns_handoff(self, mock_resolve, mock_exchange):
        mock_exchange.return_value = {"id_token": "google-id-token"}
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
            mock_resolve.return_value = user

        from app_google.oauth import build_state_token

        state = build_state_token(
            {
                "purpose": "login",
                "schema_name": self.schema_name,
                "organization_id": Organization.objects.get(
                    schema_name=self.schema_name
                ).id,
                "return_origin": self._return_origin(),
                "return_path": "/login",
                "remember": True,
            }
        )
        res = self.client.get(
            reverse("google-oauth-callback"),
            {"code": "auth-code", "state": state},
        )
        self.assertEqual(res.status_code, 302)
        self.assertIn("google_handoff=", res["Location"])

    @patch("app_google.oauth_views.verify_token_and_resolve_user")
    @patch("app_google.oauth_views.exchange_code")
    def test_handoff_exchange_returns_session(self, mock_exchange, mock_resolve):
        mock_exchange.return_value = {"id_token": "google-id-token"}
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
            mock_resolve.return_value = user

        from app_google.oauth import build_state_token

        state = build_state_token(
            {
                "purpose": "login",
                "schema_name": self.schema_name,
                "organization_id": Organization.objects.get(
                    schema_name=self.schema_name
                ).id,
                "return_origin": self._return_origin(),
                "return_path": "/login",
                "remember": False,
            }
        )
        callback = self.client.get(
            reverse("google-oauth-callback"),
            {"code": "auth-code", "state": state},
        )
        handoff = callback["Location"].split("google_handoff=")[-1]
        res = self.client.post(
            reverse("google-oauth-handoff-exchange"),
            {"code": handoff},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.data)
        self.assertIn("refresh", res.data)
        self.assertIn("session_id", res.data)
        with schema_context(self.schema_name):
            self.assertTrue(
                RefreshSession.objects.filter(user__email="james@schedjuice.com").exists()
            )

    def test_handoff_exchange_is_single_use(self):
        payload = {"access": "token", "refresh": "refresh", "session_id": "sid"}
        code = create_handoff_code(payload)
        first = self.client.post(
            reverse("google-oauth-handoff-exchange"),
            {"code": code},
            format="json",
        )
        self.assertEqual(first.status_code, 200)
        second = self.client.post(
            reverse("google-oauth-handoff-exchange"),
            {"code": code},
            format="json",
        )
        self.assertEqual(second.status_code, 400)

    @patch("app_google.oauth_views.link_google_account")
    @patch("app_google.oauth_views.exchange_code")
    def test_callback_link_success(self, mock_exchange, mock_link):
        mock_exchange.return_value = {"id_token": "google-id-token"}
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")

        from app_google.oauth import build_state_token

        with schema_context(get_public_schema_name()):
            org_id = Organization.objects.get(schema_name=self.schema_name).id

        state = build_state_token(
            {
                "purpose": "link",
                "schema_name": self.schema_name,
                "organization_id": org_id,
                "return_origin": self._return_origin(),
                "return_path": "/organizations/profile",
                "schedjuice_user_id": user.id,
            }
        )
        res = self.client.get(
            reverse("google-oauth-callback"),
            {"code": "auth-code", "state": state},
        )
        self.assertEqual(res.status_code, 302)
        self.assertIn("google_oauth=success", res["Location"])
        mock_link.assert_called_once()

    @patch("app_google.oauth_views.exchange_code")
    def test_callback_login_unknown_user(self, mock_exchange):
        mock_exchange.return_value = {"id_token": "google-id-token"}

        from app_google.login_user import verify_token_and_resolve_user
        from rest_framework.exceptions import ValidationError

        with patch(
            "app_google.oauth_views.verify_token_and_resolve_user",
            side_effect=ValidationError(
                {
                    "is_error": True,
                    "message": "google_not_linked",
                    "details": "No account linked.",
                }
            ),
        ):
            from app_google.oauth import build_state_token

            with schema_context(get_public_schema_name()):
                org_id = Organization.objects.get(schema_name=self.schema_name).id

            state = build_state_token(
                {
                    "purpose": "login",
                    "schema_name": self.schema_name,
                    "organization_id": org_id,
                    "return_origin": self._return_origin(),
                    "return_path": "/login",
                    "remember": False,
                }
            )
            res = self.client.get(
                reverse("google-oauth-callback"),
                {"code": "auth-code", "state": state},
            )
        self.assertEqual(res.status_code, 302)
        self.assertIn("google_not_linked", res["Location"])

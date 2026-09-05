"""Tests for Microsoft OAuth state and token refresh failure handling."""

import unittest
from datetime import date
from unittest import TestCase
from unittest.mock import MagicMock, patch
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import msal
from django.core.management import call_command
from django.db import connection
from django.test import TestCase as DjangoTestCase
from django.test import override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_microsoft.oauth import (
    MicrosoftOAuthError,
    OAuthReturnPathError,
    OAuthStateError,
    PKCE_VERIFIER_STATE_KEY,
    build_authorize_url,
    build_state_token,
    exchange_code,
    generate_pkce_pair,
    get_valid_access_token,
    parse_state_token,
    validate_return_path,
)
from app_microsoft.oauth_views import _build_authorize_for_payload, _oauth_redirect
from app_organization.models import MicrosoftDelegatedAccount, Organization
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class OAuthReturnPathTests(TestCase):
    def test_accepts_course_path(self):
        self.assertEqual(validate_return_path("/courses/42"), "/courses/42")

    def test_rejects_absolute_url(self):
        with self.assertRaises(OAuthReturnPathError):
            validate_return_path("https://evil.com")

    def test_rejects_protocol_relative(self):
        with self.assertRaises(OAuthReturnPathError):
            validate_return_path("//evil.com")

    def test_empty_returns_none(self):
        self.assertIsNone(validate_return_path(None))
        self.assertIsNone(validate_return_path(""))

    def test_state_round_trip_preserves_return_path(self):
        token = build_state_token(
            {
                "schema_name": "demo",
                "purpose": "connect_personal",
                "return_path": "/courses/42",
            }
        )
        state = parse_state_token(token)
        self.assertEqual(state["return_path"], "/courses/42")


class OAuthRedirectTests(TestCase):
    @override_settings(FRONTEND_BASE_URL="https://app.example.com")
    def test_personal_oauth_redirects_to_return_path(self):
        response = _oauth_redirect(
            None,
            ok=True,
            post_oauth="personal_profile",
            return_path="/courses/42",
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            response["Location"],
            "https://app.example.com/courses/42?microsoft_oauth_personal=success",
        )

    @override_settings(FRONTEND_BASE_URL="https://app.example.com")
    def test_personal_oauth_falls_back_to_profile(self):
        response = _oauth_redirect(
            None,
            ok=True,
            post_oauth="personal_profile",
        )
        self.assertEqual(response.status_code, 302)
        self.assertIn("/organizations/profile?", response["Location"])
        self.assertIn("section=video", response["Location"])

    @override_settings(FRONTEND_BASE_URL="https://app.example.com")
    def test_service_oauth_redirects_to_return_path(self):
        response = _oauth_redirect(
            None,
            ok=True,
            post_oauth="service_account",
            return_path="/internal/organizations/7",
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            response["Location"],
            "https://app.example.com/internal/organizations/7?microsoft_oauth_service=success",
        )

    @override_settings(FRONTEND_BASE_URL="https://app.example.com")
    def test_service_oauth_without_return_path_falls_back_to_profile(self):
        response = _oauth_redirect(
            None,
            ok=True,
            post_oauth="service_account",
        )
        self.assertEqual(response.status_code, 302)
        self.assertIn("/organizations/profile?", response["Location"])
        self.assertIn("microsoft_oauth_service=success", response["Location"])


class OAuthStateTests(TestCase):
    def test_tampered_token_rejected(self):
        token = build_state_token({"schema_name": "demo", "purpose": "connect_personal"})
        with self.assertRaises(OAuthStateError):
            parse_state_token(token + "x")

    def test_state_round_trip_preserves_pkce_verifier(self):
        token = build_state_token(
            {
                "schema_name": "demo",
                "purpose": "connect_service",
                PKCE_VERIFIER_STATE_KEY: "verifier-abc",
            }
        )
        state = parse_state_token(token)
        self.assertEqual(state[PKCE_VERIFIER_STATE_KEY], "verifier-abc")


class OAuthPkceTests(TestCase):
    @override_settings(MS_OAUTH_REDIRECT_URL="https://api.example.com/microsoft/oauth/callback")
    def test_build_authorize_url_includes_pkce(self):
        tenant = MagicMock()
        tenant.app_id = "client-id"
        tenant.authority = "https://login.microsoftonline.com/tenant"
        _, challenge = generate_pkce_pair()
        url = build_authorize_url(
            tenant,
            "signed-state",
            ["ChannelMessage.Send"],
            code_challenge=challenge,
        )
        self.assertIn("code_challenge=", url)
        self.assertIn("code_challenge_method=S256", url)

    @override_settings(MS_OAUTH_REDIRECT_URL="https://api.example.com/microsoft/oauth/callback")
    @patch("app_microsoft.oauth.get_msal_app")
    def test_exchange_code_sends_code_verifier(self, mock_get_app):
        app = MagicMock()
        app.acquire_token_by_authorization_code.return_value = {"access_token": "tok"}
        mock_get_app.return_value = app
        tenant = MagicMock()

        exchange_code(
            tenant,
            "auth-code",
            ["ChannelMessage.Send"],
            code_verifier="pkce-verifier",
        )

        args, kwargs = app.acquire_token_by_authorization_code.call_args
        self.assertEqual(kwargs["data"]["code_verifier"], "pkce-verifier")

    @override_settings(MS_OAUTH_REDIRECT_URL="https://api.example.com/microsoft/oauth/callback")
    @patch("app_microsoft.oauth.build_authorize_url")
    def test_build_authorize_for_payload_stores_pkce_in_state(self, mock_build_url):
        import base64
        import hashlib

        mock_build_url.return_value = "https://login.microsoftonline.com/authorize"
        org = MagicMock()
        org.app_id = "client-id"
        org.authority = "https://login.microsoftonline.com/tenant"

        _build_authorize_for_payload(
            {
                "schema_name": "demo",
                "purpose": "connect_service",
                "organization_id": 1,
                "post_oauth": "service_account",
            },
            org,
        )

        _, kwargs = mock_build_url.call_args
        state = parse_state_token(kwargs["state"])
        embedded = state[PKCE_VERIFIER_STATE_KEY]
        expected_challenge = (
            base64.urlsafe_b64encode(hashlib.sha256(embedded.encode("ascii")).digest())
            .decode("ascii")
            .rstrip("=")
        )
        self.assertTrue(embedded)
        self.assertEqual(kwargs["code_challenge"], expected_challenge)


class GetValidAccessTokenTests(TestCase):
    @patch("app_microsoft.oauth.get_msal_app")
    def test_refresh_failure_sets_needs_reconnect(self, mock_get_app):
        app = MagicMock()
        app.get_accounts.return_value = [{"username": "teacher@example.com"}]
        app.acquire_token_silent.return_value = {
            "error": "invalid_grant",
            "error_description": "token expired",
        }
        mock_get_app.return_value = app

        credential = MagicMock()
        credential.get_msal_cache_blob.return_value = ""
        credential.__class__.Status = type(
            "Status",
            (),
            {"NEEDS_RECONNECT": "needs_reconnect", "ACTIVE": "active"},
        )

        tenant = MagicMock()
        with self.assertRaises(MicrosoftOAuthError):
            get_valid_access_token(tenant, credential, ["ChannelMessage.Send"])

        self.assertEqual(credential.status, "needs_reconnect")
        self.assertIn("invalid_grant", credential.last_error)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class ServiceAccountOrganizationTargetingTests(DjangoTestCase):
    """Cross-org targeting of the org service-account OAuth views."""

    admin_schema = "xschedjuice"
    customer_schema = "xschedjuicethihanet"
    redirect_url = "https://api.example.com/microsoft/oauth/callback"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.admin_schema, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:8]
        with schema_context(get_public_schema_name()):
            self.admin_org = Organization.objects.get(schema_name=self.admin_schema)
            self.customer_org = Organization.objects.get(
                schema_name=self.customer_schema
            )
            self._originals = {
                org.pk: {
                    "is_admin": org.is_admin,
                    "is_microsoft_on": org.is_microsoft_on,
                    "app_id": org.app_id,
                    "authority": org.authority,
                }
                for org in (self.admin_org, self.customer_org)
            }
            Organization.objects.filter(pk=self.admin_org.pk).update(
                is_admin=True,
                is_microsoft_on=True,
                app_id="admin-app-id",
                authority="https://login.microsoftonline.com/admin-tenant",
            )
            Organization.objects.filter(pk=self.customer_org.pk).update(
                is_admin=False,
                is_microsoft_on=True,
                app_id="customer-app-id",
                authority="https://login.microsoftonline.com/customer-tenant",
            )
            self.admin_org.refresh_from_db()
            self.customer_org.refresh_from_db()
        with schema_context(self.admin_schema):
            seed_rbac()
            self.superadmin = User.objects.create_user(
                email=f"sa-{suffix}@example.com",
                password="x",
                name="Superadmin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.SUPERADMIN],
            )
        with schema_context(self.customer_schema):
            seed_rbac()
            self.customer_superadmin = User.objects.create_user(
                email=f"csa-{suffix}@example.com",
                password="x",
                name="Customer Superadmin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.SUPERADMIN],
            )

    def tearDown(self):
        with schema_context(get_public_schema_name()):
            for pk, values in self._originals.items():
                Organization.objects.filter(pk=pk).update(**values)

    def _client(self, user: User, schema: str) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=schema)
        return client

    def _state_from_authorize_url(self, authorize_url: str) -> dict:
        query = parse_qs(urlparse(authorize_url).query)
        return parse_state_token(query["state"][0])

    @override_settings(MS_OAUTH_REDIRECT_URL=redirect_url)
    def test_platform_superadmin_can_start_for_target_org(self):
        response = self._client(self.superadmin, self.admin_schema).get(
            "/api/v1/microsoft/oauth/start/service-account",
            {"organization_id": self.customer_org.id},
        )
        self.assertEqual(response.status_code, 200)
        authorize_url = response.data["authorize_url"]
        self.assertIn("customer-app-id", authorize_url)
        state = self._state_from_authorize_url(authorize_url)
        self.assertEqual(state["organization_id"], self.customer_org.id)
        self.assertEqual(state["schema_name"], self.customer_schema)
        self.assertEqual(state["purpose"], "connect_service")

    @override_settings(MS_OAUTH_REDIRECT_URL=redirect_url)
    def test_start_without_organization_id_targets_session_tenant(self):
        response = self._client(self.superadmin, self.admin_schema).get(
            "/api/v1/microsoft/oauth/start/service-account"
        )
        self.assertEqual(response.status_code, 200)
        state = self._state_from_authorize_url(response.data["authorize_url"])
        self.assertEqual(state["organization_id"], self.admin_org.id)
        self.assertEqual(state["schema_name"], self.admin_schema)

    @override_settings(MS_OAUTH_REDIRECT_URL=redirect_url)
    def test_start_forwards_return_path_into_state(self):
        response = self._client(self.superadmin, self.admin_schema).get(
            "/api/v1/microsoft/oauth/start/service-account",
            {
                "organization_id": self.customer_org.id,
                "return_path": f"/internal/organizations/{self.customer_org.id}",
            },
        )
        self.assertEqual(response.status_code, 200)
        state = self._state_from_authorize_url(response.data["authorize_url"])
        self.assertEqual(
            state["return_path"],
            f"/internal/organizations/{self.customer_org.id}",
        )

    def test_non_platform_admin_cannot_target_foreign_org(self):
        response = self._client(self.customer_superadmin, self.customer_schema).get(
            "/api/v1/microsoft/oauth/start/service-account",
            {"organization_id": self.admin_org.id},
        )
        self.assertEqual(response.status_code, 403)

    def test_unknown_organization_id_returns_400(self):
        response = self._client(self.superadmin, self.admin_schema).get(
            "/api/v1/microsoft/oauth/start/service-account",
            {"organization_id": 99999999},
        )
        self.assertEqual(response.status_code, 400)

    @override_settings(MS_OAUTH_REDIRECT_URL=redirect_url)
    def test_start_requires_microsoft_enabled_on_target(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(pk=self.customer_org.pk).update(
                is_microsoft_on=False
            )
        response = self._client(self.superadmin, self.admin_schema).get(
            "/api/v1/microsoft/oauth/start/service-account",
            {"organization_id": self.customer_org.id},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn(
            "not enabled", str(response.data.get("details", "")), response.data
        )

    @override_settings(MS_OAUTH_REDIRECT_URL=redirect_url)
    def test_status_targets_requested_org(self):
        with schema_context(get_public_schema_name()):
            MicrosoftDelegatedAccount.objects.create(
                organization=self.customer_org,
                authorized_upn="svc@customer.com",
                status=MicrosoftDelegatedAccount.Status.ACTIVE,
                msal_cache_ct="stub",
            )
        response = self._client(self.superadmin, self.admin_schema).get(
            "/api/v1/microsoft/oauth/service-account/status",
            {"organization_id": self.customer_org.id},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["data"]["connected"])
        self.assertEqual(response.data["data"]["authorized_upn"], "svc@customer.com")

    def test_status_without_organization_id_targets_session_tenant(self):
        response = self._client(self.superadmin, self.admin_schema).get(
            "/api/v1/microsoft/oauth/service-account/status"
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["data"]["connected"])

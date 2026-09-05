from datetime import timedelta
from unittest.mock import patch

from django.core.management import call_command
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken
from tenant_schemas.utils import schema_context

from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM
from app_auth.models import RefreshSession, User, VerificationCode
from app_auth.views import get_hashed_token


class RefreshSessionAuthTest(APITestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(cls.schema_name):
            User.objects.filter(email="james@schedjuice.com").update(
                is_password_change_required=False,
                is_active=True,
            )

    def _tenant_headers(self):
        return {"HTTP_X_DTS_SCHEMA": self.schema_name}

    def _login(self, remember=False):
        payload = {"email": "james@schedjuice.com", "password": "password123"}
        if remember:
            payload["remember"] = True
        return self.client.post(reverse("login"), payload, **self._tenant_headers())

    def test_login_returns_refresh_session_fields(self):
        res = self._login()
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.data)
        self.assertIn("refresh", res.data)
        self.assertIn("session_id", res.data)
        self.assertIn("refresh_expires_at", res.data)
        access = AccessToken(res.data["access"])
        self.assertEqual(access[JWT_TENANT_SCHEMA_CLAIM], self.schema_name)
        refresh = RefreshToken(res.data["refresh"])
        self.assertEqual(refresh[JWT_TENANT_SCHEMA_CLAIM], self.schema_name)
        with schema_context(self.schema_name):
            self.assertEqual(
                RefreshSession.objects.filter(
                    user__email="james@schedjuice.com"
                ).count(),
                1,
            )

    def test_refresh_rotates_tokens(self):
        login_res = self._login()
        old_refresh = login_res.data["refresh"]
        session_id = login_res.data["session_id"]

        refresh_res = self.client.post(
            reverse("token-refresh"),
            {"refresh": old_refresh, "session_id": session_id},
            **self._tenant_headers(),
        )
        self.assertEqual(refresh_res.status_code, 200)
        self.assertFalse(refresh_res.data.get("isError", True))
        self.assertIn("data", refresh_res.data)
        payload = refresh_res.data["data"]
        self.assertIn("access", payload)
        self.assertIn("refresh", payload)
        self.assertIn("session_id", payload)
        self.assertNotEqual(payload["refresh"], old_refresh)

    def test_refresh_replay_revokes_session(self):
        login_res = self._login()
        old_refresh = login_res.data["refresh"]
        session_id = login_res.data["session_id"]

        self.client.post(
            reverse("token-refresh"),
            {"refresh": old_refresh, "session_id": session_id},
            **self._tenant_headers(),
        )
        replay_res = self.client.post(
            reverse("token-refresh"),
            {"refresh": old_refresh, "session_id": session_id},
            **self._tenant_headers(),
        )
        self.assertEqual(replay_res.status_code, 401)

        with schema_context(self.schema_name):
            session = RefreshSession.objects.get(session_id=session_id)
            self.assertIsNotNone(session.revoked_at)

    def test_logout_revokes_session(self):
        login_res = self._login()
        session_id = login_res.data["session_id"]
        refresh = login_res.data["refresh"]

        logout_res = self.client.post(
            reverse("logout"),
            {"session_id": session_id, "refresh": refresh},
            **self._tenant_headers(),
        )
        self.assertEqual(logout_res.status_code, 200)
        payload = logout_res.data.get("data", logout_res.data)
        self.assertTrue(payload["revoked"])

        refresh_res = self.client.post(
            reverse("token-refresh"),
            {"refresh": refresh, "session_id": session_id},
            **self._tenant_headers(),
        )
        self.assertEqual(refresh_res.status_code, 401)

    def test_remember_extends_session_expiry(self):
        normal_res = self._login(remember=False)
        remembered_res = self._login(remember=True)

        with schema_context(self.schema_name):
            normal_session = RefreshSession.objects.get(
                session_id=normal_res.data["session_id"]
            )
            remembered_session = RefreshSession.objects.get(
                session_id=remembered_res.data["session_id"]
            )
        normal_days = (normal_session.expires_at - timezone.now()).days
        remembered_days = (remembered_session.expires_at - timezone.now()).days
        self.assertGreaterEqual(normal_days, 6)
        self.assertLessEqual(normal_days, 8)
        self.assertGreaterEqual(remembered_days, 85)
        self.assertLessEqual(remembered_days, 91)

    def test_logout_all_revokes_sessions(self):
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
            RefreshSession.objects.filter(user=user).delete()

        self._login()
        self._login()
        with schema_context(self.schema_name):
            active_count = RefreshSession.objects.filter(
                user=user, revoked_at__isnull=True
            ).count()
            self.assertEqual(active_count, 2)

        login_res = self._login()
        with schema_context(self.schema_name):
            active_before_logout = RefreshSession.objects.filter(
                user=user, revoked_at__isnull=True
            ).count()
            self.assertEqual(active_before_logout, 3)

        res = self.client.post(
            reverse("logout-all"),
            HTTP_AUTHORIZATION=f"Bearer {login_res.data['access']}",
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 200)
        payload = res.data.get("data", res.data)
        self.assertEqual(payload["revoked_count"], active_before_logout)
        with schema_context(self.schema_name):
            self.assertEqual(
                RefreshSession.objects.filter(
                    user=user, revoked_at__isnull=True
                ).count(),
                0,
            )

    def test_expired_session_rejects_refresh(self):
        login_res = self._login()
        with schema_context(self.schema_name):
            session = RefreshSession.objects.get(
                session_id=login_res.data["session_id"]
            )
            session.expires_at = timezone.now() - timedelta(minutes=1)
            session.save(update_fields=["expires_at"])

        refresh_res = self.client.post(
            reverse("token-refresh"),
            {
                "refresh": login_res.data["refresh"],
                "session_id": login_res.data["session_id"],
            },
            **self._tenant_headers(),
        )
        self.assertEqual(refresh_res.status_code, 401)

    @patch.object(User, "send_password_reset_email_notification")
    def test_password_reset_revokes_refresh_sessions(self, _mock_email):
        login_res = self._login()
        old_refresh = login_res.data["refresh"]
        session_id = login_res.data["session_id"]
        raw_token = "reset-token-abc"
        with schema_context(self.schema_name):
            VerificationCode.objects.create(
                email="james@schedjuice.com",
                token=get_hashed_token(raw_token),
                source=VerificationCode.Source.PASSWORD_RESET,
            )

        reset_res = self.client.post(
            reverse("password-reset"),
            {"token": raw_token, "password": "newpassword123"},
            **self._tenant_headers(),
        )
        self.assertEqual(reset_res.status_code, 200)

        refresh_res = self.client.post(
            reverse("token-refresh"),
            {"refresh": old_refresh, "session_id": session_id},
            **self._tenant_headers(),
        )
        self.assertEqual(refresh_res.status_code, 401)
        with schema_context(self.schema_name):
            session = RefreshSession.objects.get(session_id=session_id)
            self.assertIsNotNone(session.revoked_at)

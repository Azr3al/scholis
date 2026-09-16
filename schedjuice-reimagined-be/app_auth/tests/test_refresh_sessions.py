from datetime import timedelta
from unittest.mock import patch
import uuid

from django.core.management import call_command
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken
from tenant_schemas.utils import schema_context

from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM
from app_auth.models import ClientType, MobileDevice, RefreshSession, User, VerificationCode
from app_auth.session_revoked import (
    REVOKED_REASON_PASSWORD_RESET,
    REVOKED_REASON_USER_LOGOUT,
    SESSION_REVOKED_CODE,
    SESSION_REVOKED_DETAIL,
)
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

    def _login(self, remember=False, **extra):
        payload = {"email": "james@schedjuice.com", "password": "password123"}
        if remember:
            payload["remember"] = True
        payload.update(extra)
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

    def test_web_login_defaults_client_type_web(self):
        before = timezone.now()
        res = self._login()
        after = timezone.now()
        self.assertEqual(res.status_code, 200)
        with schema_context(self.schema_name):
            session = RefreshSession.objects.get(session_id=res.data["session_id"])
        self.assertEqual(session.client_type, ClientType.WEB)
        self.assertIsNotNone(session.last_seen_at)
        self.assertGreaterEqual(session.last_seen_at, before)
        self.assertLessEqual(session.last_seen_at, after)

    def test_mobile_native_login_requires_device_installation_id(self):
        res = self._login(client_type=ClientType.MOBILE_NATIVE)
        self.assertEqual(res.status_code, 400)
        details = res.data.get("details", res.data)
        self.assertIn("device_installation_id", details)

    def test_mobile_native_login_rejects_invalid_client_type(self):
        res = self._login(
            client_type="tablet",
            device_installation_id=str(uuid.uuid4()),
        )
        self.assertEqual(res.status_code, 400)
        details = res.data.get("details", res.data)
        self.assertIn("client_type", details)

    def test_mobile_native_login_rejects_invalid_installation_id(self):
        res = self._login(
            client_type=ClientType.MOBILE_NATIVE,
            device_installation_id="not-a-uuid",
        )
        self.assertEqual(res.status_code, 400)
        details = res.data.get("details", res.data)
        self.assertIn("device_installation_id", details)

    def test_mobile_native_login_sets_session_metadata(self):
        installation_id = uuid.uuid4()
        before = timezone.now()
        res = self._login(
            client_type=ClientType.MOBILE_NATIVE,
            device_installation_id=str(installation_id),
            device_name="James's iPhone 15 Pro",
            device_model="iPhone15,3",
            os_name="iOS",
            os_version="18.0",
            app_version="2.4.1",
        )
        after = timezone.now()
        self.assertEqual(res.status_code, 200)
        with schema_context(self.schema_name):
            session = RefreshSession.objects.get(session_id=res.data["session_id"])
            device = session.mobile_device
        self.assertEqual(session.client_type, ClientType.MOBILE_NATIVE)
        self.assertEqual(session.device_name, "James's iPhone 15 Pro")
        self.assertIsNotNone(session.last_seen_at)
        self.assertGreaterEqual(session.last_seen_at, before)
        self.assertLessEqual(session.last_seen_at, after)
        self.assertIsNotNone(device)
        self.assertEqual(device.installation_id, installation_id)

    def test_refresh_bumps_last_seen_at(self):
        installation_id = uuid.uuid4()
        login_res = self._login(
            client_type=ClientType.MOBILE_NATIVE,
            device_installation_id=str(installation_id),
        )
        self.assertEqual(login_res.status_code, 200)
        session_id = login_res.data["session_id"]
        stale = timezone.now() - timedelta(days=30)
        with schema_context(self.schema_name):
            session = RefreshSession.objects.get(session_id=session_id)
            device = session.mobile_device
            RefreshSession.objects.filter(pk=session.pk).update(last_seen_at=stale)
            MobileDevice.objects.filter(pk=device.pk).update(last_seen_at=stale)

        before = timezone.now()
        refresh_res = self.client.post(
            reverse("token-refresh"),
            {
                "refresh": login_res.data["refresh"],
                "session_id": session_id,
                "device_installation_id": str(installation_id),
            },
            **self._tenant_headers(),
        )
        after = timezone.now()
        self.assertEqual(refresh_res.status_code, 200)

        with schema_context(self.schema_name):
            session.refresh_from_db()
            device.refresh_from_db()
        self.assertGreaterEqual(session.last_seen_at, before)
        self.assertLessEqual(session.last_seen_at, after)
        self.assertGreaterEqual(device.last_seen_at, before)
        self.assertLessEqual(device.last_seen_at, after)

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
        self.assertEqual(refresh_res.data["detail"], SESSION_REVOKED_DETAIL)
        self.assertEqual(refresh_res.data["code"], SESSION_REVOKED_CODE)
        self.assertEqual(refresh_res.data["reason"], REVOKED_REASON_USER_LOGOUT)
        with schema_context(self.schema_name):
            session = RefreshSession.objects.get(session_id=session_id)
            self.assertEqual(session.revoked_reason, REVOKED_REASON_USER_LOGOUT)

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
        self.assertEqual(refresh_res.data["detail"], SESSION_REVOKED_DETAIL)
        self.assertEqual(refresh_res.data["code"], SESSION_REVOKED_CODE)
        self.assertEqual(refresh_res.data["reason"], REVOKED_REASON_PASSWORD_RESET)
        with schema_context(self.schema_name):
            session = RefreshSession.objects.get(session_id=session_id)
            self.assertIsNotNone(session.revoked_at)
            self.assertEqual(session.revoked_reason, REVOKED_REASON_PASSWORD_RESET)

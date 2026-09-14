from unittest.mock import patch
import uuid

from django.core.management import call_command
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from tenant_schemas.utils import schema_context

from app_auth.session_revoked import (
    REVOKED_REASON_DEVICE_DISPLACED,
    REVOKED_REASON_SESSION_ROTATED,
    SESSION_REVOKED_CODE,
    SESSION_REVOKED_DETAIL,
)
from app_auth.models import ClientType, MobileDevice, RefreshSession, User
from app_organization.models import Organization


class MobileDevicePolicyTest(APITestCase):
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

    def setUp(self):
        Organization.objects.filter(schema_name=self.schema_name).update(
            is_single_mobile_device_enabled=False,
            single_mobile_device_enabled_at=None,
        )
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
            RefreshSession.objects.filter(user=user).delete()
            MobileDevice.objects.filter(user=user).delete()

    def _tenant_headers(self):
        return {"HTTP_X_DTS_SCHEMA": self.schema_name}

    def _login(self, **extra):
        payload = {"email": "james@schedjuice.com", "password": "password123"}
        payload.update(extra)
        return self.client.post(reverse("login"), payload, **self._tenant_headers())

    def _mobile_login(self, installation_id=None, **extra):
        installation_id = installation_id or uuid.uuid4()
        return self._login(
            client_type=ClientType.MOBILE_NATIVE,
            device_installation_id=str(installation_id),
            device_name="Test Phone",
            **extra,
        )

    def _enable_single_device_policy(self):
        Organization.objects.filter(schema_name=self.schema_name).update(
            is_single_mobile_device_enabled=True,
            single_mobile_device_enabled_at=timezone.now(),
        )

    def test_flag_off_two_mobile_sessions_both_active(self):
        install_a = uuid.uuid4()
        install_b = uuid.uuid4()

        res_a = self._mobile_login(installation_id=install_a)
        res_b = self._mobile_login(installation_id=install_b)
        self.assertEqual(res_a.status_code, 200)
        self.assertEqual(res_b.status_code, 200)

        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
            active = RefreshSession.objects.filter(
                user=user,
                client_type=ClientType.MOBILE_NATIVE,
                revoked_at__isnull=True,
            )
            self.assertEqual(active.count(), 2)

    def test_flag_on_grandfathered_sessions_still_refresh(self):
        res = self._mobile_login()
        self.assertEqual(res.status_code, 200)
        self._enable_single_device_policy()

        refresh_res = self.client.post(
            reverse("token-refresh"),
            {"refresh": res.data["refresh"], "session_id": res.data["session_id"]},
            **self._tenant_headers(),
        )
        self.assertEqual(refresh_res.status_code, 200)

        with schema_context(self.schema_name):
            session = RefreshSession.objects.get(session_id=res.data["session_id"])
            self.assertIsNone(session.revoked_at)

    @patch("app_auth.mobile_device_policy.send_session_revoked_push")
    def test_flag_on_second_installation_displaces_first(self, mock_push):
        self._enable_single_device_policy()
        install_a = uuid.uuid4()
        install_b = uuid.uuid4()

        res_a = self._mobile_login(installation_id=install_a)
        res_b = self._mobile_login(installation_id=install_b)
        self.assertEqual(res_a.status_code, 200)
        self.assertEqual(res_b.status_code, 200)

        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
            session_a = RefreshSession.objects.get(session_id=res_a.data["session_id"])
            session_b = RefreshSession.objects.get(session_id=res_b.data["session_id"])
            device_a = MobileDevice.objects.get(installation_id=install_a)

        self.assertIsNotNone(session_a.revoked_at)
        self.assertEqual(session_a.revoked_reason, REVOKED_REASON_DEVICE_DISPLACED)
        self.assertIsNone(session_b.revoked_at)
        device_a.refresh_from_db()
        self.assertFalse(device_a.is_active)
        mock_push.assert_called_once_with(user, REVOKED_REASON_DEVICE_DISPLACED)

        refresh_res = self.client.post(
            reverse("token-refresh"),
            {"refresh": res_a.data["refresh"], "session_id": res_a.data["session_id"]},
            **self._tenant_headers(),
        )
        self.assertEqual(refresh_res.status_code, 401)
        self.assertEqual(refresh_res.data["detail"], SESSION_REVOKED_DETAIL)
        self.assertEqual(refresh_res.data["code"], SESSION_REVOKED_CODE)
        self.assertEqual(refresh_res.data["reason"], REVOKED_REASON_DEVICE_DISPLACED)

    @patch("app_auth.mobile_device_policy.send_session_revoked_push")
    def test_same_installation_relogin_rotates_without_displace_push(self, mock_push):
        self._enable_single_device_policy()
        install_id = uuid.uuid4()

        res_first = self._mobile_login(installation_id=install_id)
        res_second = self._mobile_login(installation_id=install_id)
        self.assertEqual(res_first.status_code, 200)
        self.assertEqual(res_second.status_code, 200)

        with schema_context(self.schema_name):
            session_first = RefreshSession.objects.get(
                session_id=res_first.data["session_id"]
            )
            session_second = RefreshSession.objects.get(
                session_id=res_second.data["session_id"]
            )
            device = MobileDevice.objects.get(installation_id=install_id)
            device_count = MobileDevice.objects.filter(
                user__email="james@schedjuice.com"
            ).count()

        self.assertEqual(device_count, 1)
        self.assertIsNotNone(session_first.revoked_at)
        self.assertEqual(session_first.revoked_reason, REVOKED_REASON_SESSION_ROTATED)
        self.assertIsNone(session_second.revoked_at)
        self.assertTrue(device.is_active)
        mock_push.assert_not_called()

    def test_web_login_never_displaces_mobile(self):
        self._enable_single_device_policy()
        mobile_res = self._mobile_login()
        self.assertEqual(mobile_res.status_code, 200)

        web_res = self._login()
        self.assertEqual(web_res.status_code, 200)

        with schema_context(self.schema_name):
            mobile_session = RefreshSession.objects.get(
                session_id=mobile_res.data["session_id"]
            )
            web_session = RefreshSession.objects.get(session_id=web_res.data["session_id"])

        self.assertIsNone(mobile_session.revoked_at)
        self.assertEqual(web_session.client_type, ClientType.WEB)
        self.assertIsNone(web_session.mobile_device_id)

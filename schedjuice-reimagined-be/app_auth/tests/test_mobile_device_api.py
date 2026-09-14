import uuid
from datetime import date, timedelta
from unittest.mock import patch

from django.core.management import call_command
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from tenant_schemas.utils import schema_context

from app_auth.models import ClientType, MobileDevice, RefreshSession, User
from app_auth.session_revoked import REVOKED_REASON_ADMIN_REVOKED
from app_rbac.seeding import seed_rbac


class MobileDeviceAPITest(APITestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(self.schema_name):
            seed_rbac()
            suffix = uuid.uuid4().hex[:6]
            self.viewer = User.objects.create_user(
                email=f"md-viewer-{suffix}@example.com",
                password="password123",
                name="Device Viewer",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.MANAGER],
                is_password_change_required=False,
            )
            self.teacher = User.objects.create_user(
                email=f"md-teacher-{suffix}@example.com",
                password="password123",
                name="Plain Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
                is_password_change_required=False,
            )
            self.target_user = User.objects.create_user(
                email=f"md-target-{suffix}@example.com",
                password="password123",
                name="Target User",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
                is_password_change_required=False,
            )
            self.other_user = User.objects.create_user(
                email=f"md-other-{suffix}@example.com",
                password="password123",
                name="Other User",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
                is_password_change_required=False,
            )

    def _tenant_headers(self):
        return {"HTTP_X_DTS_SCHEMA": self.schema_name}

    def _auth(self, user: User):
        self.client.force_authenticate(user=user)

    def _create_device(
        self,
        user: User,
        *,
        display_name: str,
        is_active: bool = True,
        with_session: bool = True,
        last_seen_at=None,
    ):
        with schema_context(self.schema_name):
            device = MobileDevice.objects.create(
                user=user,
                installation_id=uuid.uuid4(),
                display_name=display_name,
                device_model="Pixel 8",
                os_name="Android",
                os_version="14",
                app_version="2.0.0",
                is_active=is_active,
                last_seen_at=last_seen_at or timezone.now(),
            )
            if is_active and with_session:
                RefreshSession.objects.create(
                    user=user,
                    mobile_device=device,
                    refresh_jti=f"jti-{device.id}",
                    schema_name=self.schema_name,
                    expires_at=timezone.now() + timedelta(days=7),
                    client_type=ClientType.MOBILE_NATIVE,
                    last_seen_at=last_seen_at or timezone.now(),
                )
            return device

    @override_settings(RBAC_ENFORCE="enforce")
    def test_list_forbidden_without_view_permission(self):
        self._auth(self.teacher)
        res = self.client.get(reverse("mobile-devices"), **self._tenant_headers())
        self.assertEqual(res.status_code, 403, res.content)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_list_ok_with_view_permission(self):
        device = self._create_device(self.target_user, display_name="Target Phone")
        self._auth(self.viewer)
        res = self.client.get(reverse("mobile-devices"), **self._tenant_headers())
        self.assertEqual(res.status_code, 200, res.content)
        items = res.data["data"]["items"]
        ids = {row["id"] for row in items}
        self.assertIn(device.id, ids)
        row = next(item for item in items if item["id"] == device.id)
        self.assertEqual(row["user"]["id"], self.target_user.id)
        self.assertEqual(row["user"]["full_name"], self.target_user.name)
        self.assertEqual(row["user"]["email"], self.target_user.email)
        self.assertEqual(row["display_name"], "Target Phone")
        self.assertIsNotNone(row["active_session_id"])

    @override_settings(RBAC_ENFORCE="enforce")
    def test_filter_by_user_id(self):
        target_device = self._create_device(
            self.target_user, display_name="Target Phone"
        )
        self._create_device(self.other_user, display_name="Other Phone")
        self._auth(self.viewer)
        res = self.client.get(
            reverse("mobile-devices"),
            {"user_id": self.target_user.id},
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 200, res.content)
        items = res.data["data"]["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], target_device.id)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_detail_ok_with_view_permission(self):
        device = self._create_device(self.target_user, display_name="Detail Phone")
        self._auth(self.viewer)
        res = self.client.get(
            reverse("mobile-device-detail", kwargs={"device_id": device.id}),
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 200, res.content)
        payload = res.data["data"]
        self.assertEqual(payload["id"], device.id)
        self.assertEqual(payload["display_name"], "Detail Phone")
        self.assertIsNotNone(payload["active_session_id"])
        self.assertIsNotNone(payload["active_session"])
        self.assertEqual(
            payload["active_session"]["session_id"], payload["active_session_id"]
        )

    @override_settings(RBAC_ENFORCE="enforce")
    def test_user_mobile_devices_list(self):
        device = self._create_device(self.target_user, display_name="User Phone")
        self._create_device(self.other_user, display_name="Other Phone")
        self._auth(self.viewer)
        res = self.client.get(
            reverse("user-mobile-devices", kwargs={"user_id": self.target_user.id}),
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 200, res.content)
        items = res.data["data"]["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], device.id)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_revoke_forbidden_without_revoke_permission(self):
        device = self._create_device(self.target_user, display_name="Revoke Phone")
        self._auth(self.teacher)
        res = self.client.post(
            reverse("mobile-device-revoke", kwargs={"device_id": device.id}),
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 403, res.content)

    @override_settings(RBAC_ENFORCE="enforce")
    @patch("app_auth.mobile_device_policy.send_session_revoked_push")
    def test_revoke_single_device(self, mock_push):
        device = self._create_device(self.target_user, display_name="Revoke Phone")
        self._auth(self.viewer)
        res = self.client.post(
            reverse("mobile-device-revoke", kwargs={"device_id": device.id}),
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 200, res.content)
        payload = res.data["data"]
        self.assertTrue(payload["revoked"])
        self.assertEqual(payload["device_id"], device.id)
        self.assertEqual(payload["sessions_revoked"], 1)
        with schema_context(self.schema_name):
            device.refresh_from_db()
            self.assertFalse(device.is_active)
            self.assertIsNotNone(device.revoked_at)
            session = RefreshSession.objects.get(mobile_device=device)
            self.assertIsNotNone(session.revoked_at)
            self.assertEqual(session.revoked_reason, REVOKED_REASON_ADMIN_REVOKED)
        mock_push.assert_called_once_with(self.target_user, REVOKED_REASON_ADMIN_REVOKED)

    @override_settings(RBAC_ENFORCE="enforce")
    @patch("app_auth.mobile_device_policy.send_session_revoked_push")
    def test_bulk_revoke_by_user_id(self, mock_push):
        device_a = self._create_device(self.target_user, display_name="Phone A")
        device_b = self._create_device(self.target_user, display_name="Phone B")
        self._create_device(self.other_user, display_name="Other Phone")
        self._auth(self.viewer)
        res = self.client.post(
            reverse("mobile-devices-bulk-revoke"),
            {"user_id": self.target_user.id},
            format="json",
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 200, res.content)
        payload = res.data["data"]
        self.assertEqual(payload["revoked_count"], 2)
        self.assertEqual(payload["sessions_revoked"], 2)
        self.assertCountEqual(payload["device_ids"], [device_a.id, device_b.id])
        with schema_context(self.schema_name):
            for device in (device_a, device_b):
                device.refresh_from_db()
                self.assertFalse(device.is_active)
                session = RefreshSession.objects.get(mobile_device=device)
                self.assertIsNotNone(session.revoked_at)
                self.assertEqual(session.revoked_reason, REVOKED_REASON_ADMIN_REVOKED)
            other_session = RefreshSession.objects.get(mobile_device__user=self.other_user)
            self.assertIsNone(other_session.revoked_at)
        self.assertEqual(mock_push.call_count, 2)

    @override_settings(RBAC_ENFORCE="enforce")
    @patch("app_auth.mobile_device_policy.send_session_revoked_push")
    def test_bulk_revoke_by_device_ids(self, mock_push):
        device = self._create_device(self.target_user, display_name="Bulk Phone")
        self._auth(self.viewer)
        res = self.client.post(
            reverse("mobile-devices-bulk-revoke"),
            {"device_ids": [device.id]},
            format="json",
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 200, res.content)
        payload = res.data["data"]
        self.assertEqual(payload["revoked_count"], 1)
        self.assertEqual(payload["sessions_revoked"], 1)
        self.assertEqual(payload["device_ids"], [device.id])
        mock_push.assert_called_once()

    @override_settings(RBAC_ENFORCE="enforce")
    @patch("app_auth.mobile_device_policy.send_session_revoked_push")
    def test_revoke_stale_devices(self, mock_push):
        stale_cutoff = timezone.now() - timedelta(days=100)
        stale_device = self._create_device(
            self.target_user,
            display_name="Stale Phone",
            last_seen_at=stale_cutoff,
        )
        fresh_device = self._create_device(
            self.target_user,
            display_name="Fresh Phone",
            last_seen_at=timezone.now(),
        )
        self._auth(self.viewer)
        res = self.client.post(
            reverse("mobile-devices-revoke-stale"),
            {"inactive_days": 90},
            format="json",
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 200, res.content)
        payload = res.data["data"]
        self.assertEqual(payload["revoked_count"], 1)
        self.assertEqual(payload["device_ids"], [stale_device.id])
        with schema_context(self.schema_name):
            stale_device.refresh_from_db()
            fresh_device.refresh_from_db()
            self.assertFalse(stale_device.is_active)
            self.assertTrue(fresh_device.is_active)
        mock_push.assert_called_once()

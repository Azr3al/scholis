import json

from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User, WebPushSubscription


class WebPushSubscriptionModelTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(self.schema_name):
            self.user = User.objects.get(email="student@schedjuice.com")

    def test_unique_constraint_user_endpoint(self):
        """Test that user + endpoint combination is unique."""
        endpoint = "https://fcm.googleapis.com/fcm/send/test-endpoint"

        with schema_context(self.schema_name):
            WebPushSubscription.objects.create(
                user=self.user,
                endpoint=endpoint,
                p256dh="test-p256dh-key-1",
                auth="test-auth-key-1",
            )

            with self.assertRaises(Exception):
                WebPushSubscription.objects.create(
                    user=self.user,
                    endpoint=endpoint,
                    p256dh="test-p256dh-key-2",
                    auth="test-auth-key-2",
                    )


class WebPushSubscriptionAPITest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.client = APIClient()
        with schema_context(self.schema_name):
            self.user = User.objects.get(email="student@schedjuice.com")
            self.user.is_password_change_required = False
            self.user.is_active = True
            self.user.save(update_fields=["is_password_change_required", "is_active"])

        login = self.client.post(
            reverse("login"),
            {"email": "student@schedjuice.com", "password": "password123"},
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {login.data['access']}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )

        self.upsert_url = reverse("web-push-subscription-upsert")
        self.deactivate_url = reverse("web-push-subscription-deactivate")

    def test_upsert_web_push_subscription_create(self):
        """Test creating a new web push subscription via POST."""
        data = {
            "endpoint": "https://fcm.googleapis.com/fcm/send/test-endpoint",
            "keys": {
                "p256dh": "test-p256dh-key",
                "auth": "test-auth-key",
            },
            "user_agent": "Mozilla/5.0",
        }

        response = self.client.post(self.upsert_url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["isError"])
        self.assertEqual(response.data["message"], "created")
        self.assertIn("data", response.data)

        with schema_context(self.schema_name):
            subscription = WebPushSubscription.objects.get(user=self.user)
            self.assertEqual(subscription.endpoint, data["endpoint"])
            self.assertEqual(subscription.p256dh, data["keys"]["p256dh"])
            self.assertEqual(subscription.auth, data["keys"]["auth"])
            self.assertTrue(subscription.is_active)
            self.assertEqual(subscription.user_agent, data["user_agent"])

    def test_upsert_web_push_subscription_update(self):
        """Test updating an existing web push subscription."""
        with schema_context(self.schema_name):
            WebPushSubscription.objects.create(
                user=self.user,
                endpoint="https://fcm.googleapis.com/fcm/send/test-endpoint",
                p256dh="old-p256dh-key",
                auth="old-auth-key",
                is_active=False,
            )

        data = {
            "endpoint": "https://fcm.googleapis.com/fcm/send/test-endpoint",
            "keys": {
                "p256dh": "new-p256dh-key",
                "auth": "new-auth-key",
            },
            "user_agent": "Updated Agent",
        }

        response = self.client.post(self.upsert_url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["message"], "updated")

        with schema_context(self.schema_name):
            subscription = WebPushSubscription.objects.get(user=self.user)
            self.assertEqual(subscription.p256dh, "new-p256dh-key")
            self.assertEqual(subscription.auth, "new-auth-key")
            self.assertTrue(subscription.is_active)
            self.assertEqual(subscription.user_agent, "Updated Agent")

    def test_upsert_web_push_subscription_invalid_data(self):
        """Test upsert with invalid data returns 400."""
        data = {
            "endpoint": "https://fcm.googleapis.com/fcm/send/test-endpoint",
            "keys": {"p256dh": "test-p256dh-key"},
        }

        response = self.client.post(self.upsert_url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_upsert_web_push_subscription_unauthenticated(self):
        """Test upsert without authentication returns 401."""
        self.client.credentials()
        data = {
            "endpoint": "https://fcm.googleapis.com/fcm/send/test-endpoint",
            "keys": {
                "p256dh": "test-p256dh-key",
                "auth": "test-auth-key",
            },
        }

        response = self.client.post(self.upsert_url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_deactivate_web_push_subscription(self):
        """Test deactivating a web push subscription."""
        with schema_context(self.schema_name):
            subscription = WebPushSubscription.objects.create(
                user=self.user,
                endpoint="https://fcm.googleapis.com/fcm/send/test-endpoint",
                p256dh="test-p256dh-key",
                auth="test-auth-key",
                is_active=True,
            )

        data = {"endpoint": subscription.endpoint}
        response = self.client.post(self.deactivate_url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["isError"])
        self.assertEqual(response.data["message"], "success")

        with schema_context(self.schema_name):
            subscription.refresh_from_db()
            self.assertFalse(subscription.is_active)

    def test_deactivate_nonexistent_subscription(self):
        """Deactivating a missing subscription is a no-op (deactivated count 0)."""
        data = {"endpoint": "https://fcm.googleapis.com/fcm/send/nonexistent"}
        response = self.client.post(self.deactivate_url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["isError"])
        self.assertEqual(response.data["data"]["deactivated"], 0)

    def test_deactivate_web_push_subscription_invalid_data(self):
        """Test deactivate with invalid data returns 400."""
        response = self.client.post(self.deactivate_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_deactivate_web_push_subscription_unauthenticated(self):
        """Test deactivate without authentication returns 401."""
        self.client.credentials()
        data = {"endpoint": "https://fcm.googleapis.com/fcm/send/test-endpoint"}
        response = self.client.post(self.deactivate_url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

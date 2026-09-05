import hashlib
import hmac
import time
from unittest.mock import patch

from cryptography.fernet import Fernet
from django.core.management import call_command
from django.urls import reverse
from django.test import override_settings
from rest_framework.test import APITestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import RefreshSession, User
from app_organization.models import Organization

KEY = Fernet.generate_key().decode()
BOT_TOKEN = "123456789:AAH-test-token-for-telegram-login"


def _sign_widget_payload(fields: dict[str, str]) -> dict[str, str]:
    check_string = "\n".join(f"{k}={fields[k]}" for k in sorted(fields.keys()))
    secret_key = hashlib.sha256(BOT_TOKEN.encode("utf-8")).digest()
    signed = dict(fields)
    signed["hash"] = hmac.new(
        secret_key, check_string.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return signed


def _widget_payload(telegram_user_id: int) -> dict:
    return _sign_widget_payload(
        {
            "auth_date": str(int(time.time())),
            "first_name": "Test",
            "id": str(telegram_user_id),
        }
    )


@override_settings(TELEGRAM_TOKEN_ENCRYPTION_KEY=KEY)
class TelegramLoginApiTests(APITestCase):
    schema_name = "xschedjuice"
    telegram_user_id = 987654321

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=cls.schema_name)
            org.is_telegram_on = True
            org.is_telegram_login_on = True
            org.telegram_bot_username = "schoolbot"
            org.set_telegram_bot_token(BOT_TOKEN)
            org.save()
        with schema_context(cls.schema_name):
            User.objects.filter(email="james@schedjuice.com").update(
                is_password_change_required=False,
                is_active=True,
                telegram_user_id=cls.telegram_user_id,
                telegram_username="testuser",
            )

    def _tenant_headers(self):
        return {"HTTP_X_DTS_SCHEMA": self.schema_name}

    def test_login_success_creates_refresh_session(self):
        res = self.client.post(
            reverse("telegram-login"),
            _widget_payload(self.telegram_user_id),
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.data)
        self.assertIn("refresh", res.data)
        self.assertIn("session_id", res.data)
        with schema_context(self.schema_name):
            self.assertTrue(
                RefreshSession.objects.filter(
                    user__email="james@schedjuice.com"
                ).exists()
            )

    def test_login_disabled(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_telegram_login_on = False
            org.save()
        res = self.client.post(
            reverse("telegram-login"),
            _widget_payload(self.telegram_user_id),
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["message"], "telegram_login_disabled")

    def test_unknown_telegram_user(self):
        res = self.client.post(
            reverse("telegram-login"),
            _widget_payload(111222333),
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["message"], "telegram_not_linked")

    def test_ms_on_requires_microsoft_id(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_microsoft_on = True
            org.save()
        with schema_context(self.schema_name):
            User.objects.filter(email="james@schedjuice.com").update(
                microsoft_id=None
            )
        res = self.client.post(
            reverse("telegram-login"),
            _widget_payload(self.telegram_user_id),
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["message"], "microsoft_link_required")

    def test_ms_on_with_microsoft_id_succeeds(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_microsoft_on = True
            org.save()
        with schema_context(self.schema_name):
            User.objects.filter(email="james@schedjuice.com").update(
                microsoft_id="ms-object-id-123"
            )
        res = self.client.post(
            reverse("telegram-login"),
            _widget_payload(self.telegram_user_id),
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.data)

    def test_inactive_user_rejected(self):
        with schema_context(self.schema_name):
            User.objects.filter(email="james@schedjuice.com").update(
                is_active=False,
                is_waiting_for_activation=False,
            )
        res = self.client.post(
            reverse("telegram-login"),
            _widget_payload(self.telegram_user_id),
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["message"], "inactive_user")

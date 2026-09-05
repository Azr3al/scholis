from datetime import timedelta
from unittest.mock import patch

from cryptography.fernet import Fernet
from django.core.management import call_command
from django.urls import reverse
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import RefreshSession, User
from app_organization.models import Organization
from app_telegram.binding import handle_message
from app_telegram.bot_login import _hash_otp, build_login_start_payload
from app_telegram.models import TelegramLoginSession

KEY = Fernet.generate_key().decode()
BOT_TOKEN = "123456789:AAH-test-token-for-telegram-login"


@override_settings(TELEGRAM_TOKEN_ENCRYPTION_KEY=KEY)
class TelegramBotLoginApiTests(APITestCase):
    schema_name = "xschedjuice"
    telegram_user_id = 987654321
    telegram_chat_id = 42424242

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
                telegram_chat_id=cls.telegram_chat_id,
                telegram_username="testuser",
            )

    def _tenant_headers(self):
        return {"HTTP_X_DTS_SCHEMA": self.schema_name}

    def _create_session(self):
        res = self.client.post(
            reverse("telegram-login-bot-session"),
            {},
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 200)
        return res.data

    def test_session_mint_requires_telegram_login_enabled(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_telegram_login_on = False
            org.save()
        res = self.client.post(
            reverse("telegram-login-bot-session"),
            {},
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["message"], "telegram_login_disabled")

    def test_session_mint_includes_telegram_deep_link(self):
        session = self._create_session()
        self.assertIn("telegram_deep_link", session)
        self.assertEqual(
            session["telegram_deep_link"],
            f"https://t.me/schoolbot?start={build_login_start_payload(session['pairing_code'])}",
        )

    def test_start_deep_link_binds_session_and_verify_issues_jwt(self):
        session = self._create_session()
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
        start_payload = build_login_start_payload(session["pairing_code"])
        with schema_context(self.schema_name):
            with patch("app_telegram.bot_login.TelegramClient") as mock_client:
                handle_message(
                    org,
                    {
                        "text": f"/start {start_payload}",
                        "chat": {"id": self.telegram_chat_id, "type": "private"},
                        "from": {"id": self.telegram_user_id, "username": "testuser"},
                    },
                )
                send_args = mock_client.return_value.send_message.call_args
                otp_line = send_args[0][1]
                otp = otp_line.split("sign-in code is: ")[1].split("\n")[0].strip()

            db_session = TelegramLoginSession.objects.get(
                session_id=session["session_id"],
            )
            self.assertEqual(db_session.user.email, "james@schedjuice.com")
            self.assertTrue(db_session.otp_hash)

        verify_res = self.client.post(
            reverse("telegram-login-bot-verify"),
            {"session_id": session["session_id"], "otp": otp},
            **self._tenant_headers(),
        )
        self.assertEqual(verify_res.status_code, 200)
        self.assertIn("access", verify_res.data)
        self.assertIn("refresh", verify_res.data)
        with schema_context(self.schema_name):
            self.assertTrue(
                RefreshSession.objects.filter(
                    user__email="james@schedjuice.com"
                ).exists()
            )
            db_session.refresh_from_db()
            self.assertIsNotNone(db_session.consumed_at)

    def test_verify_rejects_wrong_otp(self):
        session = self._create_session()
        with schema_context(self.schema_name):
            db_session = TelegramLoginSession.objects.get(
                session_id=session["session_id"],
            )
            db_session.user = User.objects.get(email="james@schedjuice.com")
            db_session.otp_hash = _hash_otp(str(db_session.session_id), "123456")
            db_session.otp_sent_at = timezone.now()
            db_session.save()

        res = self.client.post(
            reverse("telegram-login-bot-verify"),
            {"session_id": session["session_id"], "otp": "000000"},
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["message"], "bot_otp_invalid")

    def test_verify_rejects_expired_session(self):
        session = self._create_session()
        with schema_context(self.schema_name):
            db_session = TelegramLoginSession.objects.get(
                session_id=session["session_id"],
            )
            db_session.expires_at = timezone.now() - timedelta(minutes=1)
            db_session.user = User.objects.get(email="james@schedjuice.com")
            db_session.otp_hash = _hash_otp(str(db_session.session_id), "123456")
            db_session.otp_sent_at = timezone.now()
            db_session.save()

        res = self.client.post(
            reverse("telegram-login-bot-verify"),
            {"session_id": session["session_id"], "otp": "123456"},
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["message"], "bot_session_expired")

    def test_start_deep_link_rejects_unlinked_chat(self):
        session = self._create_session()
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
        start_payload = build_login_start_payload(session["pairing_code"])
        with patch("app_telegram.bot_login.TelegramClient") as mock_client:
            handle_message(
                org,
                {
                    "text": f"/start {start_payload}",
                    "chat": {"id": 99999999, "type": "private"},
                    "from": {"id": 88888888, "username": "stranger"},
                },
            )
        reply = mock_client.return_value.send_message.call_args[0][1]
        self.assertIn("isn't linked", reply)

    def test_ms_on_requires_microsoft_id(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_microsoft_on = True
            org.save()
        with schema_context(self.schema_name):
            User.objects.filter(email="james@schedjuice.com").update(
                microsoft_id=None
            )
            db_session = TelegramLoginSession.objects.create(
                pairing_code="ABC123",
                expires_at=timezone.now() + timedelta(minutes=10),
                user=User.objects.get(email="james@schedjuice.com"),
                otp_hash=_hash_otp("00000000-0000-0000-0000-000000000001", "654321"),
                otp_sent_at=timezone.now(),
            )

        res = self.client.post(
            reverse("telegram-login-bot-verify"),
            {
                "session_id": str(db_session.session_id),
                "otp": "654321",
            },
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["message"], "microsoft_link_required")

    def test_inactive_user_rejected_on_verify(self):
        session = self._create_session()
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
            user.is_active = False
            user.is_waiting_for_activation = False
            user.save()
            db_session = TelegramLoginSession.objects.get(
                session_id=session["session_id"],
            )
            db_session.user = user
            db_session.otp_hash = _hash_otp(str(db_session.session_id), "123456")
            db_session.otp_sent_at = timezone.now()
            db_session.save()

        res = self.client.post(
            reverse("telegram-login-bot-verify"),
            {"session_id": session["session_id"], "otp": "123456"},
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["message"], "inactive_user")

    def test_consumed_session_cannot_verify_twice(self):
        session = self._create_session()
        with schema_context(self.schema_name):
            db_session = TelegramLoginSession.objects.get(
                session_id=session["session_id"],
            )
            db_session.user = User.objects.get(email="james@schedjuice.com")
            db_session.otp_hash = _hash_otp(str(db_session.session_id), "123456")
            db_session.otp_sent_at = timezone.now()
            db_session.consumed_at = timezone.now()
            db_session.save()

        res = self.client.post(
            reverse("telegram-login-bot-verify"),
            {"session_id": session["session_id"], "otp": "123456"},
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["message"], "bot_session_invalid")

    def test_verify_remember_extends_refresh_session(self):
        session = self._create_session()
        with schema_context(self.schema_name):
            db_session = TelegramLoginSession.objects.get(
                session_id=session["session_id"],
            )
            db_session.user = User.objects.get(email="james@schedjuice.com")
            db_session.otp_hash = _hash_otp(str(db_session.session_id), "123456")
            db_session.otp_sent_at = timezone.now()
            db_session.save()

        verify_res = self.client.post(
            reverse("telegram-login-bot-verify"),
            {"session_id": session["session_id"], "otp": "123456", "remember": True},
            **self._tenant_headers(),
        )
        self.assertEqual(verify_res.status_code, 200)
        with schema_context(self.schema_name):
            refresh_session = RefreshSession.objects.get(
                session_id=verify_res.data["session_id"]
            )
            self.assertTrue(refresh_session.remembered)
            remembered_days = (refresh_session.expires_at - timezone.now()).days
            self.assertGreaterEqual(remembered_days, 85)
            self.assertLessEqual(remembered_days, 91)

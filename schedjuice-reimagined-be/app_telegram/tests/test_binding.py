import unittest
from datetime import date, timedelta
from uuid import uuid4
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_organization.models import Organization
from app_telegram.binding import handle_message
from app_telegram.models import TelegramLinkToken

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

def _jwt_token_user(email: str):
    return type(
        "TokenUser",
        (),
        {"id": email, "is_authenticated": True},
    )()

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class TelegramBindingTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
            self.org.telegram_bot_username = "schoolbot"
            self.org.save()
        with schema_context(self.schema_name):
            self.teacher = User.objects.create_user(
                email=f"t-{uuid4().hex[:6]}@e.com",
                password="x",
                name="T",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )

    def _client(self, user):
        c = APIClient()
        c.force_authenticate(user=user)
        c.credentials(HTTP_TENANT=self.schema_name)
        return c

    def test_link_token_with_jwt_token_user(self):
        """Stateless JWT auth yields TokenUser, not a User model instance."""
        token_user = _jwt_token_user(self.teacher.email)
        res = self._client(token_user).post("/api/v1/telegram/link-token")
        self.assertEqual(res.status_code, 200, res.content)
        with schema_context(self.schema_name):
            self.assertTrue(
                TelegramLinkToken.objects.filter(user=self.teacher).exists()
            )

    def test_start_message_binds_account(self):
        with schema_context(self.schema_name):
            tok = TelegramLinkToken.objects.create(
                user=self.teacher,
                token="abc123",
                expires_at=timezone.now() + timedelta(minutes=15),
            )
            with patch("app_telegram.binding.TelegramClient"):
                handle_message(
                    self.org,
                    {
                        "text": "/start abc123",
                        "chat": {"id": 4242, "type": "private"},
                        "from": {"id": 4242, "username": "teach"},
                    },
                )
            self.teacher.refresh_from_db()
            tok.refresh_from_db()
        self.assertEqual(self.teacher.telegram_user_id, 4242)
        self.assertEqual(self.teacher.telegram_chat_id, 4242)
        self.assertEqual(self.teacher.telegram_username, "teach")
        self.assertIsNotNone(self.teacher.telegram_linked_at)
        self.assertIsNotNone(tok.consumed_at)

    @patch("app_telegram.binding.TelegramClient")
    def test_invalid_start_token_reply_is_tenant_aware(self, MockClient):
        with schema_context(get_public_schema_name()):
            self.org.name = "Test School"
            self.org.save()
        with schema_context(self.schema_name):
            handle_message(
                self.org,
                {
                    "text": "/start expired-token",
                    "chat": {"id": 4242, "type": "private"},
                    "from": {"id": 4242, "username": "teach"},
                },
            )
        MockClient.return_value.send_message.assert_called_once_with(
            4242,
            "This link is invalid or expired. Generate a new one from your Test School profile.",
        )

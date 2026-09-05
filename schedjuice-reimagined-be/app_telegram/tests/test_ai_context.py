import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac
from app_telegram.context import build_telegram_ai_history
from app_telegram.models import TelegramAIExchange


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class TelegramContextBuilderTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
            self.org.ai_max_context_turns = 2
            self.org.save(update_fields=["ai_max_context_turns"])
        with schema_context(self.schema_name):
            seed_rbac()
            self.user = User.objects.create_user(
                email=f"u-{uuid4().hex[:6]}@e.com",
                password="x",
                name="User",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.chat_id = 5555
            for i in range(3):
                TelegramAIExchange.objects.create(
                    user=self.user,
                    chat_id=self.chat_id,
                    user_message_id=100 + i * 2,
                    bot_message_id=101 + i * 2,
                    user_text=f"question {i}",
                    bot_text=f"answer {i}",
                )

    def test_rolling_window_returns_last_n_exchanges(self):
        with schema_context(self.schema_name):
            history = build_telegram_ai_history(
                message={
                    "chat": {"id": self.chat_id},
                    "text": "follow up",
                },
                user=self.user,
                org=self.org,
            )
        self.assertEqual(len(history), 4)
        self.assertEqual(history[0]["text"], "question 1")
        self.assertEqual(history[-1]["text"], "answer 2")

    def test_reply_anchor_includes_replied_exchange(self):
        with schema_context(self.schema_name):
            history = build_telegram_ai_history(
                message={
                    "chat": {"id": self.chat_id},
                    "text": "follow up",
                    "reply_to_message": {"message_id": 101},
                },
                user=self.user,
                org=self.org,
            )
        texts = [t["text"] for t in history]
        self.assertIn("question 0", texts)
        self.assertIn("answer 0", texts)

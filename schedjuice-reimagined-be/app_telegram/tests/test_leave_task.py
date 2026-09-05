import unittest
from unittest.mock import patch

from cryptography.fernet import Fernet
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization
from app_tasks import tasks as task_handlers
from app_tasks.models import Task

KEY = Fernet.generate_key().decode()


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(TELEGRAM_TOKEN_ENCRYPTION_KEY=KEY)
class LeaveTelegramTaskTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_leave_telegram_group_calls_client(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_telegram_on = True
            org.set_telegram_bot_token("1:tok")
            org.save()
        with schema_context(self.schema_name):
            t = Task.objects.create(
                name=Task.TaskName.LEAVE_TELEGRAM_GROUP,
                data={"chat_id": -100999},
                response="",
            )
            with patch("app_tasks.tasks.TelegramClient") as MockClient:
                task_handlers.leave_telegram_group(t, org)
            MockClient.return_value.leave_chat.assert_called_once_with(-100999)
            t.refresh_from_db()
        self.assertTrue(t.is_success)

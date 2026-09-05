import unittest

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_tasks.models import Task
from app_telegram.tests.helpers import create_test_course


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class TelegramModelFieldTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_course_delete_queues_leave_task(self):
        with schema_context(self.schema_name):
            c = create_test_course(telegram_chat_id=-100123)
            c.delete()
            self.assertTrue(
                Task.objects.filter(name=Task.TaskName.LEAVE_TELEGRAM_GROUP).exists()
            )

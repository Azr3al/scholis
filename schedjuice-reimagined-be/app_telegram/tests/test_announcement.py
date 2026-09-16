import unittest
from datetime import date
from uuid import uuid4
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_organization.models import Organization
from app_telegram.announcement import send_announcement_to_telegram
from app_telegram.tests.helpers import create_test_course


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class TelegramAnnouncementTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
            self.org.is_telegram_on = True
            self.org.save()
        with schema_context(self.schema_name):
            self.author = User.objects.create_user(
                email=f"a-{uuid4().hex[:6]}@e.com",
                password="x",
                name="A",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.course = create_test_course(telegram_chat_id=-100888)

    def test_send_announcement_posts_to_group(self):
        from app_announcement.models import Announcement

        with schema_context(self.schema_name):
            ann = Announcement.objects.create(
                title="Exam Monday",
                data="Study!",
                course=self.course,
                created_by=self.author,
                send_to_telegram=True,
            )
            with patch("app_telegram.announcement.TelegramClient") as MockClient:
                send_announcement_to_telegram(ann.id, self.schema_name)
            MockClient.return_value.send_message.assert_called_once()
            args = MockClient.return_value.send_message.call_args[0]
        self.assertEqual(args[0], -100888)
        self.assertIn("Exam Monday", args[1])

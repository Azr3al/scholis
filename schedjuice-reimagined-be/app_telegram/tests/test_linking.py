import unittest
from datetime import date, timedelta
from uuid import uuid4
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_organization.models import Organization
from app_telegram.linking import handle_my_chat_member
from app_telegram.models import TelegramPendingGroupLink
from app_telegram.tests.helpers import create_test_course

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class TelegramLinkingTests(TestCase):
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
            self.admin = User.objects.create_user(
                email=f"a-{uuid4().hex[:6]}@e.com",
                password="x",
                name="A",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.admin.telegram_user_id = 7001
            self.admin.save()
            self.course = create_test_course(title=f"Algebra-{uuid4().hex[:6]}")

    def test_my_chat_member_links_course(self):
        with schema_context(self.schema_name):
            TelegramPendingGroupLink.objects.create(
                course=self.course,
                initiated_by=self.admin,
                expires_at=timezone.now() + timedelta(minutes=30),
            )
            with patch("app_telegram.linking.TelegramClient") as MockClient:
                MockClient.return_value.create_chat_invite_link.return_value = {
                    "invite_link": "https://t.me/+abc"
                }
                handle_my_chat_member(
                    self.org,
                    {
                        "chat": {
                            "id": -100555,
                            "title": "Algebra Group",
                            "type": "supergroup",
                        },
                        "from": {"id": 7001},
                        "new_chat_member": {
                            "user": {"id": 555, "is_bot": True},
                            "status": "administrator",
                        },
                        "old_chat_member": {
                            "user": {"id": 555, "is_bot": True},
                            "status": "left",
                        },
                    },
                )
            self.course.refresh_from_db()
        self.assertEqual(self.course.telegram_chat_id, -100555)
        self.assertEqual(self.course.telegram_chat_title, "Algebra Group")
        self.assertEqual(self.course.telegram_invite_link, "https://t.me/+abc")
        self.assertIsNotNone(self.course.telegram_linked_at)

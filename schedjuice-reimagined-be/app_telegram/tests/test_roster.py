import unittest
from datetime import date
from uuid import uuid4
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import UserCourse
from app_organization.models import Organization
from app_telegram.roster import handle_join_request
from app_telegram.tests.helpers import create_test_course


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class TelegramRosterTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        from tenant_schemas.utils import get_public_schema_name

        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
            self.org.is_telegram_on = True
            self.org.is_telegram_roster_sync_enabled = True
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
            self.teacher.telegram_user_id = 8001
            self.teacher.save()
            self.course = create_test_course(telegram_chat_id=-100777)

    def test_approves_assigned_teacher(self):
        with schema_context(self.schema_name):
            with patch("app_telegram.signals.dm_invite_link_to_teacher.delay"):
                UserCourse.objects.create(
                    user=self.teacher,
                    course=self.course,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                )
            with patch("app_telegram.roster.TelegramClient") as MockClient:
                handle_join_request(
                    self.org,
                    {"chat": {"id": -100777}, "from": {"id": 8001}},
                )
            MockClient.return_value.approve_chat_join_request.assert_called_once_with(
                -100777, 8001
            )

    def test_declines_non_teacher(self):
        with schema_context(self.schema_name):
            with patch("app_telegram.roster.TelegramClient") as MockClient:
                handle_join_request(
                    self.org,
                    {"chat": {"id": -100777}, "from": {"id": 9999}},
                )
            MockClient.return_value.decline_chat_join_request.assert_called_once_with(
                -100777, 9999
            )

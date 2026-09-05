import unittest
from datetime import date, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_telegram.models import TelegramLinkToken


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class TelegramModelsTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_link_token_is_active(self):
        with schema_context(self.schema_name):
            u = User.objects.create_user(
                email=f"t-{uuid4().hex[:6]}@e.com",
                password="x",
                name="T",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            tok = TelegramLinkToken.objects.create(
                user=u,
                token=uuid4().hex,
                expires_at=timezone.now() + timedelta(minutes=15),
            )
            self.assertTrue(tok.is_active())
            tok.consumed_at = timezone.now()
            self.assertFalse(tok.is_active())

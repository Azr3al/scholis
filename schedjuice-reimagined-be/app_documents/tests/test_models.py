import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import IntegrityError, connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_documents.document import EMPTY_DOCUMENT
from app_documents.models import DocumentTemplate


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class DocumentTemplateModelTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def test_org_duplicate_name_case_insensitive(self):
        with schema_context(self.schema_name):
            DocumentTemplate.objects.create(
                name="Offer",
                scope=DocumentTemplate.Scope.ORG,
                document=dict(EMPTY_DOCUMENT),
            )
            with self.assertRaises(IntegrityError):
                DocumentTemplate.objects.create(
                    name="offer",
                    scope=DocumentTemplate.Scope.ORG,
                    document=dict(EMPTY_DOCUMENT),
                )

    def test_two_owners_may_share_private_name(self):
        with schema_context(self.schema_name):
            a = User.objects.create_user(
                email=f"a-{uuid4().hex[:6]}@example.com",
                password="x",
                name="A",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            b = User.objects.create_user(
                email=f"b-{uuid4().hex[:6]}@example.com",
                password="x",
                name="B",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            DocumentTemplate.objects.create(
                name="Mine",
                scope=DocumentTemplate.Scope.USER,
                owner=a,
                document=dict(EMPTY_DOCUMENT),
            )
            DocumentTemplate.objects.create(
                name="Mine",
                scope=DocumentTemplate.Scope.USER,
                owner=b,
                document=dict(EMPTY_DOCUMENT),
            )

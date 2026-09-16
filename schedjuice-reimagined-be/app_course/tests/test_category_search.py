import unittest
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_course.category_search import apply_category_search_q
from app_course.models import Category


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CategorySearchTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_fuzzy_matches_partial_name(self):
        suffix = uuid4().hex[:4]
        with schema_context(self.schema_name):
            Category.objects.create(name=f"KET Prep {suffix}")
            qs = apply_category_search_q(Category.objects.all(), "KET")
            names = list(qs.values_list("name", flat=True))
        self.assertTrue(any("KET" in n for n in names))

    def test_no_match_returns_empty(self):
        with schema_context(self.schema_name):
            qs = apply_category_search_q(Category.objects.all(), "ZZZNOHIT999")
            self.assertEqual(qs.count(), 0)

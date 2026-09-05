import unittest
from datetime import date
from uuid import uuid4

from django.conf import settings
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_auth.user_search import (
    apply_multi_word_ilike_q,
    apply_user_search_q,
    strip_active_filters,
)


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class UserSearchHelpersTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _make_user(self, **kwargs):
        defaults = {
            "email": f"user-{uuid4().hex[:8]}@example.com",
            "password": "pw-test-123",
            "phone_number": "09-123-4567",
            "communication_email": kwargs.pop("communication_email", None),
            "name": "Test User",
            "date_of_birth": date(1990, 1, 1),
            "code": f"u-{uuid4().hex[:6]}",
            "roles": [User.UserRole.STUDENT],
        }
        if defaults["communication_email"] is None:
            defaults["communication_email"] = defaults["email"]
        defaults.update(kwargs)
        return User.objects.create_user(**defaults)

    def test_strip_active_filters(self):
        fps = [
            {"field_name": "is_active", "operator": "exact", "value": "true"},
            {"field_name": "roles", "operator": "contained_by", "value": "{student}"},
        ]
        stripped = strip_active_filters(fps)
        self.assertEqual(len(stripped), 1)
        self.assertEqual(stripped[0]["field_name"], "roles")

    @override_settings(USER_SEARCH_FUZZY_ENABLED=False)
    def test_multi_word_ilike_matches_all_words(self):
        with schema_context(self.schema_name):
            self._make_user(name="Jane Algebra Smith", email="jane@example.com")
            self._make_user(name="Bob History", email="bob@example.com")
            qs = User.objects.all()
            result = list(
                apply_multi_word_ilike_q(qs, "jane algebra").values_list("name", flat=True)
            )
        self.assertIn("Jane Algebra Smith", result)
        self.assertNotIn("Bob History", result)

    @override_settings(USER_SEARCH_FUZZY_ENABLED=True)
    def test_fuzzy_q_finds_typo_in_name(self):
        with schema_context(self.schema_name):
            self._make_user(name="James Thiha", email="james@example.com")
            self._make_user(name="Other Person", email="other@example.com")
            qs = User.objects.all()
            result = list(
                apply_user_search_q(qs, "jmaes thiha").values_list("name", flat=True)
            )
        self.assertIn("James Thiha", result)
        self.assertNotIn("Other Person", result)

    @override_settings(USER_SEARCH_FUZZY_ENABLED=True)
    def test_fuzzy_q_finds_partial_email(self):
        with schema_context(self.schema_name):
            self._make_user(
                name="Email User",
                email="unique.search@example.com",
                communication_email="unique.search@example.com",
            )
            self._make_user(name="Other", email="other@example.com")
            qs = User.objects.all()
            result = list(
                apply_user_search_q(qs, "unique.serch").values_list("email", flat=True)
            )
        self.assertIn("unique.search@example.com", result)

    @override_settings(USER_SEARCH_FUZZY_ENABLED=True)
    def test_fuzzy_q_matches_phone_with_formatting(self):
        with schema_context(self.schema_name):
            self._make_user(
                name="Phone User",
                email=f"phone-{uuid4().hex[:6]}@example.com",
                phone_number="+95 9 8765 4321",
            )
            self._make_user(
                name="No Match",
                email=f"nomatch-{uuid4().hex[:6]}@example.com",
                phone_number="111111",
            )
            qs = User.objects.all()
            result = list(
                apply_user_search_q(qs, "959876543").values_list("name", flat=True)
            )
        self.assertIn("Phone User", result)
        self.assertNotIn("No Match", result)

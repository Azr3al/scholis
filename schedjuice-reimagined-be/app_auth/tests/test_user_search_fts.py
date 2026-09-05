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
    apply_user_search_q_with_meta,
    user_suggest_queryset,
)
from app_department.models import Department, Job, UserDepartment


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class UserSearchFtsTest(TestCase):
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
            "communication_email": None,
            "name": "Test User",
            "date_of_birth": date(1990, 1, 1),
            "code": f"u-{uuid4().hex[:6]}",
            "roles": [User.UserRole.STUDENT],
        }
        if defaults["communication_email"] is None:
            defaults["communication_email"] = defaults["email"]
        defaults.update(kwargs)
        return User.objects.create_user(**defaults)

    def test_user_department_populates_search_text_via_trigger(self):
        with schema_context(self.schema_name):
            user = self._make_user(name="Dept Member")
            dept = Department.objects.create(name=f"Engineering {uuid4().hex[:4]}")
            job = Job.objects.create(
                name=f"Developer {uuid4().hex[:4]}",
                department=dept,
            )
            UserDepartment.objects.create(user=user, department=dept, job=job)
            user.refresh_from_db()
            self.assertIn(dept.name, user.search_text)
            self.assertIn(job.name, user.search_text)

    def test_department_rename_propagates_to_search_text(self):
        with schema_context(self.schema_name):
            user = self._make_user(name="Rename Dept User")
            dept = Department.objects.create(name="Old Dept Name")
            job = Job.objects.create(name="Analyst", department=dept)
            UserDepartment.objects.create(user=user, department=dept, job=job)
            dept.name = "New Dept Name"
            dept.save(update_fields=["name"])
            user.refresh_from_db()
            self.assertIn("New Dept Name", user.search_text)
            self.assertNotIn("Old Dept Name", user.search_text)

    def test_job_rename_propagates_to_search_text(self):
        with schema_context(self.schema_name):
            user = self._make_user(name="Rename Job User")
            dept = Department.objects.create(name="Ops")
            job = Job.objects.create(name="Old Job Title", department=dept)
            UserDepartment.objects.create(user=user, department=dept, job=job)
            job.name = "New Job Title"
            job.save(update_fields=["name"])
            user.refresh_from_db()
            self.assertIn("New Job Title", user.search_text)

    def test_fts_prefix_match_on_name(self):
        with schema_context(self.schema_name):
            user = self._make_user(name="Alice Wong")
            qs, used_fallback = apply_user_search_q_with_meta(User.objects.all(), "ali")
            ids = list(qs.values_list("id", flat=True))
        self.assertFalse(used_fallback)
        self.assertIn(user.id, ids)

    @override_settings(USER_SEARCH_FALLBACK_MIN_RESULTS=2)
    def test_fts_name_outranks_emergency_contact_match(self):
        with schema_context(self.schema_name):
            name_hit = self._make_user(
                name="Alice Primary",
                emergency_contact_name="unrelated",
            )
            contact_hit = self._make_user(
                name="Bob Other",
                emergency_contact_name="Alice Primary contact",
            )
            qs, _ = apply_user_search_q_with_meta(User.objects.all(), "alice primary")
            ids = list(qs.values_list("id", flat=True))
        self.assertEqual(ids[0], name_hit.id)
        self.assertIn(contact_hit.id, ids)

    def test_accent_insensitive_search(self):
        with schema_context(self.schema_name):
            self._make_user(name="José García")
            qs, _ = apply_user_search_q_with_meta(User.objects.all(), "jose")
            names = list(qs.values_list("name", flat=True))
        self.assertIn("José García", names)

    @override_settings(
        USER_SEARCH_FALLBACK_MIN_RESULTS=10,
        USER_SEARCH_TRIGRAM_THRESHOLD=0.1,
    )
    def test_trigram_fallback_when_fts_sparse(self):
        with schema_context(self.schema_name):
            self._make_user(name="Jmes Thiha", email="jmes@example.com")
            qs, used_fallback = apply_user_search_q_with_meta(
                User.objects.all(), "james"
            )
            names = list(qs.values_list("name", flat=True))
        self.assertTrue(used_fallback)
        self.assertIn("Jmes Thiha", names)

    def test_suggest_requires_two_characters(self):
        with schema_context(self.schema_name):
            self._make_user(name="Suggest User Alpha")
            qs = user_suggest_queryset(User.objects.all(), "a")
        self.assertEqual(qs.count(), 0)

    def test_empty_query_returns_no_crash(self):
        with schema_context(self.schema_name):
            qs, used = apply_user_search_q_with_meta(User.objects.all(), "")
        self.assertFalse(used)
        self.assertGreaterEqual(qs.count(), 0)

    def test_code_searchable_at_weight_a(self):
        with schema_context(self.schema_name):
            user = self._make_user(name="Code Search", code="STU-9999")
            qs, _ = apply_user_search_q_with_meta(User.objects.all(), "STU-9999")
            ids = list(qs.values_list("id", flat=True))
        self.assertIn(user.id, ids)

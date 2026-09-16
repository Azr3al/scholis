import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_auth.shortcuts_availability_helpers import STAFF_ROLES_FOR_SHORTCUTS
from app_auth.user_search import apply_user_search_q_with_meta
from utilitas.views import BaseView


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _staff_tab_role_filter():
    inner = ",".join(STAFF_ROLES_FOR_SHORTCUTS)
    return {
        "field_name": "roles",
        "operator": "overlap",
        "value": f"{{{inner}}}",
    }


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class UserHubStaffFilterTest(TestCase):
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

    def test_overlap_filter_includes_staff_with_custom_role(self):
        with schema_context(self.schema_name):
            user = self._make_user(
                name="Custom Role Staff",
                roles=[User.UserRole.TEACHER, "telegram-beta-tester"],
            )
            filter_dict = BaseView.build_body_params(
                [_staff_tab_role_filter()],
                model=User,
            )
            qs = User.objects.filter(**filter_dict)
            ids = set(qs.values_list("id", flat=True))
        self.assertIn(user.id, ids)

    def test_contained_by_staff_filter_excludes_staff_with_custom_role(self):
        with schema_context(self.schema_name):
            user = self._make_user(
                name="Custom Role Staff Excluded",
                roles=[User.UserRole.TEACHER, "telegram-beta-tester"],
            )
            inner = ",".join(STAFF_ROLES_FOR_SHORTCUTS)
            filter_dict = BaseView.build_body_params(
                [
                    {
                        "field_name": "roles",
                        "operator": "contained_by",
                        "value": f"{{{inner}}}",
                    }
                ],
                model=User,
            )
            qs = User.objects.filter(**filter_dict)
            ids = set(qs.values_list("id", flat=True))
        self.assertNotIn(user.id, ids)

    def test_staff_tab_filter_plus_search_finds_custom_role_staff(self):
        with schema_context(self.schema_name):
            user = self._make_user(
                name="Htoo Myat Minn Search",
                roles=[
                    User.UserRole.TEACHER,
                    User.UserRole.MANAGER,
                    "telegram-beta-tester",
                ],
            )
            filter_dict = BaseView.build_body_params(
                [_staff_tab_role_filter()],
                model=User,
            )
            qs = User.objects.filter(**filter_dict)
            qs, _ = apply_user_search_q_with_meta(qs, "htoo myat minn search")
            ids = list(qs.values_list("id", flat=True))
        self.assertEqual(ids[0], user.id)
        self.assertIn(user.id, ids)

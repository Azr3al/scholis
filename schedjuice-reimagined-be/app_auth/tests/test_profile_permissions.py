# app_auth/tests/test_profile_permissions.py
#
# NOTE: The plan specifies `tenant_schemas.test.cases.TenantTestCase`, but that base
# class fails to set up in this project (its setup saves an Organization without the
# NOT NULL `available_domains` and other required fields). We therefore use the
# project's established DB-backed tenant test pattern (see app_rbac/tests/test_models.py
# and app_rbac/tests/test_seeding.py): a plain `django.test.TestCase` bound to the
# bootstrapped `xschedjuice` schema, with ORM operations wrapped in `schema_context(...)`.
# Assertions are unchanged from the plan.
#
# The 0002_seed_roles data migration already seeds the 7 system roles into `xschedjuice`
# during test-DB setup, so `seed_rbac()` here is effectively a no-op (it is idempotent).
# A non-superadmin's effective permissions resolve from RolePermission rows in the current
# schema, so these tests MUST run inside `schema_context("xschedjuice")`.
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_rbac.seeding import seed_rbac


class ProfilePermissionsTests(TestCase):
    schema_name = "xschedjuice"

    def setUp(self):
        with schema_context(self.schema_name):
            seed_rbac()

    def test_get_effective_permissions_for_teacher(self):
        with schema_context(self.schema_name):
            u = User(email="t@x.io", roles=["teacher"])
            perms = u.get_effective_permissions()
            self.assertIn("attendance.mark", perms)
            self.assertNotIn("payment.verify", perms)

    def test_superadmin_has_platform_codes(self):
        with schema_context(self.schema_name):
            u = User(email="s@x.io", roles=["superadmin"])
            self.assertIn("debug.access", u.get_effective_permissions())

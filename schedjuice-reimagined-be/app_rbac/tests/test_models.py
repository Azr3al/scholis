# app_rbac/tests/test_models.py
#
# NOTE: The plan specifies `tenant_schemas.test.cases.TenantTestCase`, but that base
# class fails to set up in this project: its `setUpClass` saves an Organization (the
# tenant model) with only `domain_url`/`schema_name`, which violates the NOT NULL
# constraint on `available_domains` (and other required fields). We therefore use the
# same pattern the project already uses for DB-backed tenant tests (see
# app_course/tests/test_course_scoping.py): a plain `django.test.TestCase` run against
# a bootstrapped tenant schema, with ORM operations wrapped in `schema_context(...)`.
# The expected-IntegrityError creates are wrapped in `transaction.atomic()` (a savepoint)
# so the surrounding test transaction stays usable. Assertions are unchanged from the plan.
from django.db import IntegrityError, transaction
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_rbac.models import Role, RolePermission


class RoleModelTests(TestCase):
    schema_name = "xschedjuice"

    # NOTE: Use non-system slugs below. The 0002_seed_roles data migration seeds the
    # 7 system roles (incl. "teacher"/"finance") into every tenant schema during test
    # DB setup, so reusing a system slug would collide on the *first* create rather
    # than the intended duplicate.
    def test_slug_is_unique(self):
        with schema_context(self.schema_name):
            Role.objects.create(slug="qa-teacher", display_name="Teacher", is_system=True)
            with self.assertRaises(IntegrityError):
                with transaction.atomic():
                    Role.objects.create(slug="qa-teacher", display_name="Dup")

    def test_role_permission_unique_per_code(self):
        with schema_context(self.schema_name):
            role = Role.objects.create(slug="qa-finance", display_name="Finance")
            RolePermission.objects.create(role=role, permission_code="payment.verify")
            with self.assertRaises(IntegrityError):
                with transaction.atomic():
                    RolePermission.objects.create(role=role, permission_code="payment.verify")

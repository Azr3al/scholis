# app_rbac/tests/test_seeding.py
#
# NOTE: The plan specifies `tenant_schemas.test.cases.TenantTestCase`, but that base
# class fails to set up in this project: its setup saves an Organization (the tenant
# model) without `available_domains` and other NOT NULL fields. We therefore use the
# project's established DB-backed tenant test pattern (see
# app_course/tests/test_course_scoping.py and app_rbac/tests/test_models.py): a plain
# `django.test.TestCase` bound to the bootstrapped `xschedjuice` schema, with ORM
# operations wrapped in `schema_context(...)`. Assertions are unchanged from the plan.
#
# The data migration 0002_seed_roles runs during test-DB setup, so `xschedjuice` may
# already be seeded before `seed_rbac()` is called here. `seed_rbac()` is idempotent,
# so the assertions (counts == expected) hold regardless of pre-seeding.
from contextlib import contextmanager
from unittest import mock

from django.test import SimpleTestCase, TestCase
from tenant_schemas.utils import schema_context

from app_rbac import catalog, defaults
from app_rbac.models import Role, RolePermission
from app_rbac.seeding import seed_rbac

class SeedingTests(TestCase):
    schema_name = "xschedjuice"

    def test_seed_is_idempotent_and_complete(self):
        with schema_context(self.schema_name):
            seed_rbac()
            seed_rbac()  # second run must not duplicate
            self.assertEqual(Role.objects.filter(is_system=True).count(), 8)
            admin = Role.objects.get(slug="admin")
            self.assertEqual(admin.display_name, "Founder / Principal")
            codes = set(
                RolePermission.objects.filter(role=admin).values_list(
                    "permission_code", flat=True
                )
            )
            self.assertEqual(codes, set(defaults.DEFAULT_MATRIX["admin"]))

    def test_hr_seed_includes_school_wide_course_read(self):
        with schema_context(self.schema_name):
            seed_rbac()
            hr = Role.objects.get(slug="hr")
            codes = set(
                RolePermission.objects.filter(role=hr).values_list(
                    "permission_code", flat=True
                )
            )
            self.assertEqual(codes, set(defaults.DEFAULT_MATRIX["hr"]))
            self.assertIn("course.view", codes)
            self.assertIn("course.view_all", codes)

    def test_default_matrix_codes_all_exist_in_catalog(self):
        for codes in defaults.DEFAULT_MATRIX.values():
            for c in codes:
                self.assertIn(c, catalog.ALL_CODES)

    def test_teacher_default_excludes_assign_self_events(self):
        self.assertNotIn(
            "course.assign_self_events", defaults.DEFAULT_MATRIX["teacher"]
        )
        self.assertIn("course.assign_self_events", catalog.ALL_CODES)

    def test_teacher_default_excludes_payment_show_fee(self):
        self.assertNotIn("payment.show_fee", defaults.DEFAULT_MATRIX["teacher"])
        self.assertIn("payment.show_fee", catalog.ALL_CODES)

    def test_document_template_manage_on_admin_and_manager(self):
        self.assertIn(
            "document_template.manage", defaults.DEFAULT_MATRIX["admin"]
        )
        self.assertIn(
            "document_template.manage", defaults.DEFAULT_MATRIX["manager"]
        )
        for codes in defaults.DEFAULT_MATRIX.values():
            for c in codes:
                self.assertFalse(c.startswith("certificate."))

    def test_admissions_view_on_admin_and_manager_only(self):
        self.assertIn("admissions.view", catalog.ALL_CODES)
        self.assertTrue(catalog.BY_CODE["admissions.view"].sensitive)
        self.assertEqual(catalog.BY_CODE["admissions.view"].data_class, "Operational")
        self.assertIn("admissions.view", defaults.DEFAULT_MATRIX["admin"])
        self.assertIn("admissions.view", defaults.DEFAULT_MATRIX["manager"])
        for slug in ("finance", "hr", "teacher", "student", "consultant"):
            self.assertNotIn("admissions.view", defaults.DEFAULT_MATRIX[slug])

class NewTenantProvisioningHookTests(SimpleTestCase):
    """The org-provisioning path (`OrganizationSerializer.create`) must seed RBAC in
    the freshly created tenant's schema so new schools start with the full matrix.

    We assert the wiring deterministically with mocks instead of provisioning a real
    schema: creating a brand-new tenant schema runs the full migration set (including
    `CREATE INDEX CONCURRENTLY` migrations) which cannot execute inside a transactional
    TestCase. End-to-end seeding of newly migrated schemas is additionally guaranteed
    by data migration 0002_seed_roles (run via `create_schema` -> `migrate_schemas`).
    """

    def test_create_calls_seed_rbac_in_new_schema_context(self):
        from app_organization import serializers as org_serializers

        fake_instance = mock.Mock(schema_name="xnewschoolio")
        seen = {}

        @contextmanager
        def fake_schema_context(schema):
            seen["entered_schema"] = schema
            yield

        def record_seed():
            # Captures the schema active when seed_rbac() is invoked.
            seen["seed_called_within"] = seen.get("entered_schema")

        with mock.patch(
            "rest_framework.serializers.ModelSerializer.create",
            return_value=fake_instance,
        ), mock.patch.object(
            org_serializers, "schema_context", fake_schema_context
        ), mock.patch.object(
            org_serializers, "create_default_general_program"
        ), mock.patch.object(
            org_serializers, "seed_rbac", side_effect=record_seed
        ) as mock_seed:
            serializer = org_serializers.OrganizationSerializer()
            result = serializer.create(
                {"domain_url": "NewSchool.io", "name": "New School"}
            )

        self.assertIs(result, fake_instance)
        mock_seed.assert_called_once()
        self.assertEqual(seen["seed_called_within"], fake_instance.schema_name)

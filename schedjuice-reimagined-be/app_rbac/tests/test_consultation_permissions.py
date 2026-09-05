from django.test import SimpleTestCase, TestCase
from tenant_schemas.utils import schema_context

from app_rbac import catalog, defaults
from app_rbac.models import Role, RolePermission
from app_rbac.seeding import seed_rbac

CONSULTATION_CODES = frozenset(
    {
        "consultation.view",
        "consultation.create",
        "consultation.update",
        "consultation.delete",
        "consultation.manage_schedule",
    }
)


class ConsultationCatalogTests(SimpleTestCase):
    def test_consultation_permissions_exist_in_catalog(self):
        for code in CONSULTATION_CODES:
            self.assertIn(code, catalog.ALL_CODES)

    def test_consultation_permissions_are_operational_school_tier(self):
        for code in CONSULTATION_CODES:
            perm = catalog.BY_CODE[code]
            self.assertEqual(perm.data_class, "Operational")
            self.assertEqual(perm.tier, catalog.SCHOOL)
            self.assertIn(code, catalog.SCHOOL_TIER_CODES)
            self.assertIn(code, catalog.TENANT_MATRIX_CODES)

    def test_consultant_default_matrix_codes_exist_in_catalog(self):
        for code in defaults.DEFAULT_MATRIX["consultant"]:
            self.assertIn(code, catalog.ALL_CODES)


class ConsultationSeedingTests(TestCase):
    schema_name = "xschedjuice"

    def test_consultant_role_seeds_with_all_consultation_permissions(self):
        with schema_context(self.schema_name):
            seed_rbac()
            consultant = Role.objects.get(slug="consultant")
            self.assertEqual(consultant.display_name, "Consultant")
            self.assertTrue(consultant.is_system)
            self.assertTrue(consultant.is_assignable)

            codes = set(
                RolePermission.objects.filter(role=consultant).values_list(
                    "permission_code", flat=True
                )
            )
            self.assertEqual(codes, set(defaults.DEFAULT_MATRIX["consultant"]))
            self.assertEqual(codes, CONSULTATION_CODES)

    def test_other_roles_do_not_get_consultation_permissions_by_default(self):
        with schema_context(self.schema_name):
            seed_rbac()
            for slug in ("teacher", "student", "hr", "finance"):
                role = Role.objects.get(slug=slug)
                codes = set(
                    RolePermission.objects.filter(role=role).values_list(
                        "permission_code", flat=True
                    )
                )
                self.assertFalse(codes & CONSULTATION_CODES, slug)

from django.test import SimpleTestCase, TestCase
from tenant_schemas.utils import schema_context

from app_rbac import catalog, defaults
from app_rbac.models import Role, RolePermission
from app_rbac.seeding import seed_rbac

COMPLAINT_CODES = frozenset(
    {
        "complaint.create",
        "complaint.view_own",
        "complaint.comment",
        "complaint.reopen",
    }
)


class ComplaintCatalogTests(SimpleTestCase):
    def test_complaint_permissions_exist_in_catalog(self):
        for code in COMPLAINT_CODES:
            self.assertIn(code, catalog.ALL_CODES)

    def test_complaint_permissions_are_personal_data_class(self):
        for code in COMPLAINT_CODES:
            perm = catalog.BY_CODE[code]
            self.assertEqual(perm.data_class, "Personal")

    def test_student_default_matrix_codes_exist_in_catalog(self):
        for code in defaults.DEFAULT_MATRIX["student"]:
            self.assertIn(code, catalog.ALL_CODES)


class ComplaintSeedingTests(TestCase):
    schema_name = "xschedjuice"

    def test_student_role_seeds_with_all_complaint_permissions(self):
        with schema_context(self.schema_name):
            seed_rbac()
            student = Role.objects.get(slug="student")
            codes = set(
                RolePermission.objects.filter(role=student).values_list(
                    "permission_code", flat=True
                )
            )
            self.assertTrue(COMPLAINT_CODES.issubset(codes))
            self.assertFalse(any(code.startswith("issue.") for code in codes))

    def test_other_roles_do_not_get_complaint_permissions_by_default(self):
        with schema_context(self.schema_name):
            seed_rbac()
            for slug in ("teacher", "admin", "manager", "hr", "finance"):
                role = Role.objects.get(slug=slug)
                codes = set(
                    RolePermission.objects.filter(role=role).values_list(
                        "permission_code", flat=True
                    )
                )
                self.assertFalse(codes & COMPLAINT_CODES, slug)

    def test_student_matrix_matches_seeded_complaint_codes(self):
        matrix_codes = set(defaults.DEFAULT_MATRIX["student"])
        self.assertEqual(matrix_codes & COMPLAINT_CODES, COMPLAINT_CODES)

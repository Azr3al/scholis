from django.test import SimpleTestCase, TestCase
from tenant_schemas.utils import schema_context

from app_rbac import catalog, defaults
from app_rbac.models import Role, RolePermission
from app_rbac.seeding import seed_rbac

STUDENT_LEAVE_CODES = frozenset(
    {
        "leave.create",
        "leave.view_own",
        "leave.update_own",
    }
)

ADMIN_LEAVE_CODES = frozenset(
    {
        "leave.view_all",
        "leave.manage_all",
    }
)

ALL_LEAVE_CODES = STUDENT_LEAVE_CODES | ADMIN_LEAVE_CODES


class LeaveCatalogTests(SimpleTestCase):
    def test_leave_permissions_exist_in_catalog(self):
        for code in ALL_LEAVE_CODES:
            self.assertIn(code, catalog.ALL_CODES)

    def test_student_leave_permissions_are_personal_data_class(self):
        for code in STUDENT_LEAVE_CODES:
            perm = catalog.BY_CODE[code]
            self.assertEqual(perm.data_class, "Personal")

    def test_admin_leave_permissions_are_academic_data_class(self):
        for code in ADMIN_LEAVE_CODES:
            perm = catalog.BY_CODE[code]
            self.assertEqual(perm.data_class, "Academic")

    def test_default_matrix_codes_exist_in_catalog(self):
        for role in ("student", "admin", "manager"):
            for code in defaults.DEFAULT_MATRIX[role]:
                self.assertIn(code, catalog.ALL_CODES)


class LeaveSeedingTests(TestCase):
    schema_name = "xschedjuice"

    def test_student_role_seeds_with_student_leave_permissions(self):
        with schema_context(self.schema_name):
            seed_rbac()
            student = Role.objects.get(slug="student")
            codes = set(
                RolePermission.objects.filter(role=student).values_list(
                    "permission_code", flat=True
                )
            )
            self.assertTrue(STUDENT_LEAVE_CODES.issubset(codes))
            self.assertFalse(codes & ADMIN_LEAVE_CODES)

    def test_admin_and_manager_seed_with_admin_leave_permissions(self):
        with schema_context(self.schema_name):
            seed_rbac()
            for slug in ("admin", "manager"):
                role = Role.objects.get(slug=slug)
                codes = set(
                    RolePermission.objects.filter(role=role).values_list(
                        "permission_code", flat=True
                    )
                )
                self.assertTrue(
                    ADMIN_LEAVE_CODES.issubset(codes),
                    slug,
                )
                self.assertFalse(codes & STUDENT_LEAVE_CODES, slug)

    def test_teacher_does_not_get_leave_permissions_by_default(self):
        with schema_context(self.schema_name):
            seed_rbac()
            teacher = Role.objects.get(slug="teacher")
            codes = set(
                RolePermission.objects.filter(role=teacher).values_list(
                    "permission_code", flat=True
                )
            )
            self.assertFalse(codes & ALL_LEAVE_CODES)

    def test_student_matrix_matches_seeded_leave_codes(self):
        matrix_codes = set(defaults.DEFAULT_MATRIX["student"])
        self.assertEqual(matrix_codes & STUDENT_LEAVE_CODES, STUDENT_LEAVE_CODES)

    def test_admin_matrix_matches_seeded_leave_codes(self):
        matrix_codes = set(defaults.DEFAULT_MATRIX["admin"])
        self.assertEqual(matrix_codes & ADMIN_LEAVE_CODES, ADMIN_LEAVE_CODES)

from unittest.mock import patch
from uuid import uuid4

from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_auth.role_grants import merge_role_add
from app_organization.models import Organization
from app_rbac.models import Role
from app_rbac.seeding import seed_rbac


class MergeRoleAddTests(SimpleTestCase):
    def test_adds_staff_role_and_removes_student(self):
        result = merge_role_add(["student", "teacher"], User.UserRole.FINANCE)
        self.assertEqual(result, ["teacher", "finance"])

    def test_adds_custom_role_to_existing(self):
        result = merge_role_add(["teacher"], "department-head")
        self.assertEqual(result, ["teacher", "department-head"])

    def test_student_replaces_all_roles(self):
        result = merge_role_add(["teacher", "finance"], User.UserRole.STUDENT)
        self.assertEqual(result, [User.UserRole.STUDENT])

    def test_idempotent_when_already_present(self):
        result = merge_role_add(["teacher", "finance"], User.UserRole.FINANCE)
        self.assertEqual(result, ["teacher", "finance"])


class UserAssignRoleBulkTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    def setUp(self):
        self.broadcast_patcher = patch("app_auth.views.broadcast_rbac_updated_to_user")
        self.broadcast_patcher.start()
        self.addCleanup(self.broadcast_patcher.stop)
        with schema_context(self.schema_name):
            seed_rbac()
            suffix = uuid4().hex[:8]
            self.admin = self._create_user(f"admin-{suffix}@x.io", ["admin"])
            self.manager = self._create_user(f"mgr-{suffix}@x.io", ["manager"])
            self.teacher_a = self._create_user(f"ta-{suffix}@x.io", ["teacher"])
            self.teacher_b = self._create_user(f"tb-{suffix}@x.io", ["teacher"])
            self.student_only = self._create_user(f"stu-{suffix}@x.io", ["student"])

    def _create_user(self, email: str, roles: list[str]) -> User:
        return User.objects.create(
            email=email,
            name=email.split("@")[0],
            phone_number="1",
            communication_email=email,
            code=f"bulk-{uuid4().hex[:8]}",
            roles=roles,
        )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_X_DTS_SCHEMA=self.schema_name)
        return client

    def _set_consultation_flag(self, value: bool) -> None:
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_consultation_booking_on=value
            )

    @override_settings(RBAC_ENFORCE="enforce")
    def test_admin_adds_system_role_to_multiple_users(self):
        with schema_context(self.schema_name):
            ids = [self.teacher_a.id, self.teacher_b.id]

        response = self._client(self.admin).post(
            f"{self.api_prefix}/users/assign-role-bulk",
            {"role_slug": "finance", "user_ids": ids},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.data["data"]
        self.assertEqual(len(data["updated"]), 2)
        self.assertEqual(data["skipped"], [])
        self.assertEqual(data["failed"], [])
        with schema_context(self.schema_name):
            self.teacher_a.refresh_from_db()
            self.teacher_b.refresh_from_db()
            self.assertIn("finance", self.teacher_a.roles)
            self.assertIn("finance", self.teacher_b.roles)
            self.assertIn("teacher", self.teacher_a.roles)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_skips_already_assigned(self):
        with schema_context(self.schema_name):
            self.teacher_a.roles = ["teacher", "finance"]
            self.teacher_a.save(update_fields=["roles"])
            ids = [self.teacher_a.id, self.teacher_b.id]

        response = self._client(self.admin).post(
            f"{self.api_prefix}/users/assign-role-bulk",
            {"role_slug": "finance", "user_ids": ids},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.data["data"]
        self.assertEqual(len(data["updated"]), 1)
        self.assertEqual(len(data["skipped"]), 1)
        self.assertEqual(data["skipped"][0]["reason"], "already_assigned")

    @override_settings(RBAC_ENFORCE="enforce")
    def test_admin_adds_consultant_role(self):
        self._set_consultation_flag(True)
        with schema_context(self.schema_name):
            target_id = self.teacher_a.id

        response = self._client(self.admin).post(
            f"{self.api_prefix}/users/assign-role-bulk",
            {"role_slug": "consultant", "user_ids": [target_id]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["data"]["updated"]), 1)
        with schema_context(self.schema_name):
            self.teacher_a.refresh_from_db()
            self.assertIn("consultant", self.teacher_a.roles)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_admin_cannot_add_consultant_when_consultation_flag_off(self):
        self._set_consultation_flag(False)
        with schema_context(self.schema_name):
            target_id = self.teacher_a.id

        response = self._client(self.admin).post(
            f"{self.api_prefix}/users/assign-role-bulk",
            {"role_slug": "consultant", "user_ids": [target_id]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["data"]["updated"], [])
        self.assertEqual(len(response.data["data"]["failed"]), 1)
        with schema_context(self.schema_name):
            self.teacher_a.refresh_from_db()
            self.assertNotIn("consultant", self.teacher_a.roles)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_manager_cannot_assign_admin_role(self):
        with schema_context(self.schema_name):
            admin_target = self._create_user(
                f"adm-tgt-{uuid4().hex[:8]}@x.io", ["manager"]
            )
            target_id = admin_target.id

        response = self._client(self.manager).post(
            f"{self.api_prefix}/users/assign-role-bulk",
            {"role_slug": "admin", "user_ids": [target_id]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        data = response.data["data"]
        self.assertEqual(data["updated"], [])
        self.assertEqual(len(data["failed"]), 1)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_custom_role_requires_rbac_manage(self):
        with schema_context(self.schema_name):
            Role.objects.create(
                slug="department-head",
                display_name="Department Head",
                is_system=False,
                is_assignable=True,
            )
            target_id = self.teacher_a.id

        response = self._client(self.manager).post(
            f"{self.api_prefix}/users/assign-role-bulk",
            {"role_slug": "department-head", "user_ids": [target_id]},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

        response = self._client(self.admin).post(
            f"{self.api_prefix}/users/assign-role-bulk",
            {"role_slug": "department-head", "user_ids": [target_id]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["data"]["updated"]), 1)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_student_only_user_fails(self):
        with schema_context(self.schema_name):
            target_id = self.student_only.id

        response = self._client(self.admin).post(
            f"{self.api_prefix}/users/assign-role-bulk",
            {"role_slug": "teacher", "user_ids": [target_id]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["data"]["failed"][0]["reason"], "student_only")

    @override_settings(RBAC_ENFORCE="enforce")
    def test_rejects_more_than_100_users(self):
        response = self._client(self.admin).post(
            f"{self.api_prefix}/users/assign-role-bulk",
            {"role_slug": "teacher", "user_ids": list(range(1, 102))},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

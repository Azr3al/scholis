from unittest.mock import patch
from uuid import uuid4

from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_auth.role_grants import has_legacy_role
from app_organization.models import Organization
from app_rbac.models import Role
from app_rbac.seeding import seed_rbac


class RoleAssignmentTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    def setUp(self):
        with schema_context(self.schema_name):
            seed_rbac()
            suffix = uuid4().hex[:8]
            self.admin = self._create_user(f"admin-{suffix}@x.io", ["admin"])
            self.manager = self._create_user(f"mgr-{suffix}@x.io", ["manager"])
            self.target = self._create_user(f"target-{suffix}@x.io", ["student"])

    def _create_user(self, email: str, roles: list[str]) -> User:
        return User.objects.create(
            email=email,
            name=email.split("@")[0],
            phone_number="1",
            communication_email=email,
            code=f"assign-{uuid4().hex[:8]}",
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

    def test_has_legacy_role_true_for_system_slug(self):
        with schema_context(self.schema_name):
            self.assertTrue(has_legacy_role(["teacher"]))
            self.assertTrue(has_legacy_role(["custom-coordinator", "student"]))

    def test_has_legacy_role_false_for_custom_only(self):
        with schema_context(self.schema_name):
            Role.objects.create(
                slug="custom-coordinator",
                display_name="Coordinator",
                is_system=False,
            )
            self.assertFalse(has_legacy_role(["custom-coordinator"]))

    @patch("app_auth.views.broadcast_rbac_updated_to_user")
    @override_settings(RBAC_ENFORCE="enforce")
    def test_role_assignment_returns_has_legacy_role(self, mock_broadcast):
        with schema_context(self.schema_name):
            target_id = self.target.id

        response = self._client(self.admin).put(
            f"{self.api_prefix}/users/{target_id}",
            {"roles": ["teacher"]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["data"]["has_legacy_role"])
        mock_broadcast.assert_called_once_with(self.schema_name, target_id)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_role_assignment_rejects_hierarchy_violation(self):
        with schema_context(self.schema_name):
            target_id = self.target.id

        response = self._client(self.manager).put(
            f"{self.api_prefix}/users/{target_id}",
            {"roles": ["admin"]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_role_assignment_requires_assign_roles_permission(self):
        with schema_context(self.schema_name):
            teacher = self._create_user(f"t-{uuid4().hex[:8]}@x.io", ["teacher"])
            target_id = self.target.id

        response = self._client(teacher).put(
            f"{self.api_prefix}/users/{target_id}",
            {"roles": ["student"]},
            format="json",
        )

        self.assertEqual(response.status_code, 403)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_admin_can_assign_custom_role(self):
        with schema_context(self.schema_name):
            Role.objects.create(
                slug="department-head",
                display_name="Department Head",
                is_system=False,
            )
            target_id = self.target.id

        response = self._client(self.admin).put(
            f"{self.api_prefix}/users/{target_id}",
            {"roles": ["teacher", "department-head"]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        with schema_context(self.schema_name):
            self.target.refresh_from_db()
            self.assertIn("department-head", self.target.roles)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_manager_cannot_assign_custom_role(self):
        with schema_context(self.schema_name):
            Role.objects.create(
                slug="department-head",
                display_name="Department Head",
                is_system=False,
            )
            target_id = self.target.id

        response = self._client(self.manager).put(
            f"{self.api_prefix}/users/{target_id}",
            {"roles": ["teacher", "department-head"]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_manager_preserves_existing_custom_role_when_editing_system_roles(
        self,
    ):
        with schema_context(self.schema_name):
            Role.objects.create(
                slug="department-head",
                display_name="Department Head",
                is_system=False,
            )
            self.target.roles = ["teacher", "department-head"]
            self.target.save(update_fields=["roles"])
            target_id = self.target.id

        response = self._client(self.manager).put(
            f"{self.api_prefix}/users/{target_id}",
            {"roles": ["department-head"]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        with schema_context(self.schema_name):
            self.target.refresh_from_db()
            self.assertEqual(self.target.roles, ["department-head"])

    @override_settings(RBAC_ENFORCE="enforce")
    def test_manager_cannot_remove_custom_role(self):
        with schema_context(self.schema_name):
            Role.objects.create(
                slug="department-head",
                display_name="Department Head",
                is_system=False,
            )
            self.target.roles = ["teacher", "department-head"]
            self.target.save(update_fields=["roles"])
            target_id = self.target.id

        response = self._client(self.manager).put(
            f"{self.api_prefix}/users/{target_id}",
            {"roles": ["teacher"]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_admin_cannot_assign_consultant_when_consultation_flag_off(self):
        self._set_consultation_flag(False)
        with schema_context(self.schema_name):
            target_id = self.target.id

        response = self._client(self.admin).put(
            f"{self.api_prefix}/users/{target_id}",
            {"roles": ["teacher", "consultant"]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_admin_can_assign_consultant_when_consultation_flag_on(self):
        self._set_consultation_flag(True)
        with schema_context(self.schema_name):
            target_id = self.target.id

        response = self._client(self.admin).put(
            f"{self.api_prefix}/users/{target_id}",
            {"roles": ["teacher", "consultant"]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        with schema_context(self.schema_name):
            self.target.refresh_from_db()
            self.assertIn("consultant", self.target.roles)

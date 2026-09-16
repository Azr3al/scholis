# app_rbac/tests/test_api.py
#
# NOTE: The plan specifies `tenant_schemas.test.cases.TenantTestCase`, but that base
# class fails to set up in this project (Organization NOT NULL constraints). We use the
# project's established pattern: plain `django.test.TestCase` with ORM operations and
# API calls scoped via `schema_context("xschedjuice")` + `HTTP_X_DTS_SCHEMA`.
from uuid import uuid4

from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_rbac.models import Role, RolePermission
from app_rbac.seeding import seed_rbac

class RbacApiTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    def setUp(self):
        with schema_context(self.schema_name):
            seed_rbac()
            self.founder = self._create_user("f@x.io", ["admin"])
            self.school_admin = self._create_user("sa@x.io", ["manager"])
            self.teacher = self._create_user("t@x.io", ["teacher"])

    def _create_user(self, email: str, roles: list[str]) -> User:
        return User.objects.create(
            email=email,
            name=email.split("@")[0],
            phone_number="1",
            communication_email=email,
            code=f"rbac-{uuid4().hex[:8]}",
            roles=roles,
        )

    def _c(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_X_DTS_SCHEMA=self.schema_name)
        return client

    def test_catalog_excludes_platform_internal_for_tenant(self):
        with override_settings(RBAC_ENFORCE="enforce"):
            resp = self._c(self.founder).get(f"{self.api_prefix}/rbac/catalog")
        self.assertEqual(resp.status_code, 200)
        codes = {p["code"] for p in resp.json()["data"]}
        self.assertIn("course.view", codes)
        self.assertNotIn("debug.access", codes)

    def test_edit_matrix_requires_rbac_manage(self):
        with schema_context(self.schema_name):
            role = Role.objects.get(slug="teacher")
            role_id = role.id
        with override_settings(RBAC_ENFORCE="enforce"):
            r1 = (
                self._c(self.school_admin)
                .put(
                    f"{self.api_prefix}/rbac/roles/{role_id}/permissions",
                    {"codes": ["course.view"]},
                    format="json",
                )
            )
            self.assertEqual(r1.status_code, 403)
            r2 = (
                self._c(self.founder)
                .put(
                    f"{self.api_prefix}/rbac/roles/{role_id}/permissions",
                    {"codes": ["course.view"]},
                    format="json",
                )
            )
            self.assertEqual(r2.status_code, 200)
        with schema_context(self.schema_name):
            self.assertEqual(
                set(
                    RolePermission.objects.filter(role_id=role_id).values_list(
                        "permission_code", flat=True
                    )
                ),
                {"course.view"},
            )

    def test_cannot_grant_platform_internal_via_api(self):
        with schema_context(self.schema_name):
            role = Role.objects.get(slug="manager")
            role_id = role.id
        with override_settings(RBAC_ENFORCE="enforce"):
            resp = (
                self._c(self.founder)
                .put(
                    f"{self.api_prefix}/rbac/roles/{role_id}/permissions",
                    {"codes": ["debug.access"]},
                    format="json",
                )
            )
        self.assertEqual(resp.status_code, 400)

    def test_cannot_delete_system_role(self):
        with schema_context(self.schema_name):
            role = Role.objects.get(slug="admin")
            role_id = role.id
        with override_settings(RBAC_ENFORCE="enforce"):
            resp = self._c(self.founder).delete(
                f"{self.api_prefix}/rbac/roles/{role_id}"
            )
        self.assertEqual(resp.status_code, 400)

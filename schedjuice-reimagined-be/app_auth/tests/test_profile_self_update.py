from uuid import uuid4

from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_rbac.seeding import seed_rbac


class ProfileSelfUpdateTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    def setUp(self):
        with schema_context(self.schema_name):
            seed_rbac()
            suffix = uuid4().hex[:8]
            self.teacher = self._create_user(f"teacher-{suffix}@x.io", ["teacher"])
            self.other_teacher = self._create_user(f"teacher2-{suffix}@x.io", ["teacher"])
            self.student = self._create_user(f"student-{suffix}@x.io", ["student"])

    def _create_user(self, email: str, roles: list[str]) -> User:
        return User.objects.create(
            email=email,
            name=email.split("@")[0],
            phone_number="1",
            communication_email=email,
            code=f"profile-{uuid4().hex[:8]}",
            roles=roles,
        )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_X_DTS_SCHEMA=self.schema_name)
        return client

    @override_settings(RBAC_ENFORCE="enforce")
    def test_teacher_can_update_own_profile(self):
        with schema_context(self.schema_name):
            teacher_id = self.teacher.id

        response = self._client(self.teacher).put(
            f"{self.api_prefix}/users/{teacher_id}",
            {"name": "Updated Teacher Name", "phone_number": "999"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["data"]["name"], "Updated Teacher Name")
        self.assertEqual(response.json()["data"]["phone_number"], "999")

    @override_settings(RBAC_ENFORCE="enforce")
    def test_teacher_cannot_update_other_user_profile(self):
        with schema_context(self.schema_name):
            other_id = self.other_teacher.id

        response = self._client(self.teacher).put(
            f"{self.api_prefix}/users/{other_id}",
            {"name": "Hacked Name"},
            format="json",
        )

        self.assertEqual(response.status_code, 403, response.content)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_teacher_put_with_unchanged_roles_succeeds(self):
        with schema_context(self.schema_name):
            teacher_id = self.teacher.id

        response = self._client(self.teacher).put(
            f"{self.api_prefix}/users/{teacher_id}",
            {"name": "Teacher With Roles Key", "roles": ["teacher"]},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["data"]["name"], "Teacher With Roles Key")

    @override_settings(RBAC_ENFORCE="enforce")
    def test_teacher_cannot_change_own_roles(self):
        with schema_context(self.schema_name):
            teacher_id = self.teacher.id

        response = self._client(self.teacher).put(
            f"{self.api_prefix}/users/{teacher_id}",
            {"roles": ["admin"]},
            format="json",
        )

        self.assertEqual(response.status_code, 403, response.content)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_student_can_update_own_profile(self):
        with schema_context(self.schema_name):
            student_id = self.student.id

        response = self._client(self.student).put(
            f"{self.api_prefix}/users/{student_id}",
            {"name": "Student Self Edit"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["data"]["name"], "Student Self Edit")

    @override_settings(RBAC_ENFORCE="enforce")
    def test_student_without_update_own_cannot_edit_profile(self):
        from app_rbac.models import Role, RolePermission

        with schema_context(self.schema_name):
            student_id = self.student.id
            student_role = Role.objects.get(slug="student")
            RolePermission.objects.filter(
                role=student_role, permission_code="user.update_own"
            ).delete()

        response = self._client(self.student).put(
            f"{self.api_prefix}/users/{student_id}",
            {"name": "Blocked Student Edit"},
            format="json",
        )

        self.assertEqual(response.status_code, 403, response.content)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_student_cannot_update_own_code(self):
        with schema_context(self.schema_name):
            student_id = self.student.id
            old_code = self.student.code

        response = self._client(self.student).put(
            f"{self.api_prefix}/users/{student_id}",
            {"code": "HACK"},
            format="json",
        )

        self.assertEqual(response.status_code, 403, response.content)
        with schema_context(self.schema_name):
            self.assertEqual(User.objects.get(pk=student_id).code, old_code)

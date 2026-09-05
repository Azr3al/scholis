import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_auth.public_profile_helpers import (
    generate_public_profile_slug,
    should_assign_public_profile_slug,
)
from app_auth.staff_helpers import staff_role_label, user_is_staff
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

class StaffHelpersTests(SimpleTestCase):
    def test_user_is_staff_true_for_hr(self):
        user = User(roles=[User.UserRole.HR])
        self.assertTrue(user_is_staff(user))

    def test_user_is_staff_false_for_student_only(self):
        user = User(roles=[User.UserRole.STUDENT])
        self.assertFalse(user_is_staff(user))

    def test_staff_role_label(self):
        user = User(roles=[User.UserRole.HR, User.UserRole.TEACHER])
        self.assertEqual(staff_role_label(user), "HR")

class PublicProfileSlugTests(SimpleTestCase):

    def test_should_assign_for_hr_staff(self):
        user = User(roles=[User.UserRole.HR])
        self.assertTrue(
            should_assign_public_profile_slug(user, {"is_public_profile_enabled": True})
        )

    def test_should_not_assign_for_student(self):
        user = User(roles=[User.UserRole.STUDENT])
        self.assertFalse(
            should_assign_public_profile_slug(user, {"is_public_profile_enabled": True})
        )

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class PublicProfileEndpointTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.client = APIClient()
        with schema_context(self.schema_name):
            seed_rbac()
            self.hr_user = User.objects.create_user(
                email=f"hr-{suffix}@example.com",
                password="x",
                name="HR Person",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"hr-{suffix}@example.com",
                code=f"hr-{suffix}",
                roles=[User.UserRole.HR],
                public_profile_slug=f"p_{suffix}",
                is_public_profile_enabled=True,
            )

    def test_public_people_returns_hr_profile(self):
        res = self.client.get(
            f"{self.api_prefix}/public/people/{self.hr_user.public_profile_slug}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["data"]["name"], "HR Person")
        self.assertEqual(res.data["data"]["role_label"], "HR")

    def test_legacy_teachers_route_removed(self):
        res = self.client.get(
            f"{self.api_prefix}/public/teachers/{self.hr_user.public_profile_slug}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 404)

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class UserCertificationApiTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.client = APIClient()
        with schema_context(self.schema_name):
            seed_rbac()
            self.hr_user = User.objects.create_user(
                email=f"cert-hr-{suffix}@example.com",
                password="x",
                name="Cert HR",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"cert-hr-{suffix}@example.com",
                code=f"cert-hr-{suffix}",
                roles=[User.UserRole.HR],
            )
            self.other = User.objects.create_user(
                email=f"cert-other-{suffix}@example.com",
                password="x",
                name="Other Teacher",
                phone_number="2",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"cert-other-{suffix}@example.com",
                code=f"cert-other-{suffix}",
                roles=[User.UserRole.TEACHER],
            )

    def test_self_can_create_certification(self):
        self.client.force_authenticate(user=self.hr_user)
        res = self.client.post(
            f"{self.api_prefix}/users/{self.hr_user.id}/certifications",
            {
                "title": "HR Certificate",
                "issuing_organization": "Example Org",
                "issued_on": "2024-01-15",
            },
            format="json",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["data"]["title"], "HR Certificate")

    def test_unrelated_user_cannot_create_certification(self):
        self.client.force_authenticate(user=self.other)
        res = self.client.post(
            f"{self.api_prefix}/users/{self.hr_user.id}/certifications",
            {
                "title": "Sneaky",
                "issuing_organization": "Bad",
                "issued_on": "2024-01-15",
            },
            format="json",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 403)

    def test_expiry_before_issue_rejected(self):
        self.client.force_authenticate(user=self.hr_user)
        res = self.client.post(
            f"{self.api_prefix}/users/{self.hr_user.id}/certifications",
            {
                "title": "Bad dates",
                "issuing_organization": "Org",
                "issued_on": "2024-06-01",
                "expires_on": "2024-01-01",
            },
            format="json",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 400)

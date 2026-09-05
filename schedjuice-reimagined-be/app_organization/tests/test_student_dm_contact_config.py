from django.db import connection
from django.test import SimpleTestCase, TestCase

from app_organization.models import Organization
from app_organization.serializers import OrganizationSerializer


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class StudentDmContactSerializerTests(SimpleTestCase):
    def test_rejects_admins_only_without_contact(self):
        org = Organization(
            name="T",
            schema_name="xschedjuice",
            available_domains=[],
        )
        ser = OrganizationSerializer(
            org,
            data={"is_students_dm_admins_only_enabled": True},
            partial=True,
        )
        self.assertFalse(ser.is_valid())
        self.assertIn("student_dm_contact_user_id", ser.errors)


class StudentDmContactPersistenceTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if not _database_reachable():
            raise AssertionError("PostgreSQL not available")

    def setUp(self):
        self.org = Organization.objects.filter(schema_name="xschedjuice").first()
        if self.org is None:
            self.skipTest("xschedjuice tenant not bootstrapped")

    def test_rejects_non_admin_contact(self):
        from tenant_schemas.utils import schema_context

        from app_auth.models import User

        with schema_context("xschedjuice"):
            teacher = next(
                u for u in User.objects.iterator(chunk_size=500) if u.is_teacher()
            )
            teacher_id = teacher.id

        ser = OrganizationSerializer(
            self.org,
            data={
                "is_students_dm_admins_only_enabled": True,
                "student_dm_contact_user_id": teacher_id,
            },
            partial=True,
        )
        self.assertFalse(ser.is_valid())
        self.assertIn("student_dm_contact_user_id", ser.errors)

    def test_accepts_admin_contact_when_admins_only_enabled(self):
        from tenant_schemas.utils import schema_context

        from app_auth.models import User

        previous_flag = self.org.is_students_dm_admins_only_enabled
        previous_contact = self.org.student_dm_contact_user_id
        try:
            with schema_context("xschedjuice"):
                admin = next(
                    u for u in User.objects.iterator(chunk_size=500) if u.is_admin()
                )
                admin_id = admin.id

            ser = OrganizationSerializer(
                self.org,
                data={
                    "is_students_dm_admins_only_enabled": True,
                    "student_dm_contact_user_id": admin_id,
                },
                partial=True,
            )
            self.assertTrue(ser.is_valid(), ser.errors)
            ser.save()

            self.org.refresh_from_db()
            self.assertTrue(self.org.is_students_dm_admins_only_enabled)
            self.assertEqual(self.org.student_dm_contact_user_id, admin_id)
        finally:
            self.org.is_students_dm_admins_only_enabled = previous_flag
            self.org.student_dm_contact_user_id = previous_contact
            self.org.save(
                update_fields=[
                    "is_students_dm_admins_only_enabled",
                    "student_dm_contact_user_id",
                    "updated_at",
                ]
            )

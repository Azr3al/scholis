import io
import unittest
from datetime import date
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _make_png() -> SimpleUploadedFile:
    buf = io.BytesIO()
    Image.new("RGBA", (120, 60), color=(0, 0, 0, 255)).save(buf, format="PNG")
    return SimpleUploadedFile("signature.png", buf.getvalue(), content_type="image/png")


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class UserSignatureApiTests(TestCase):
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
            self.admin = User.objects.create_user(
                email=f"sig-adm-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"sig-adm-{suffix}@example.com",
                code=f"SIG-ADM-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"sig-tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="2",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"sig-tch-{suffix}@example.com",
                code=f"SIG-TCH-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"sig-stu-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="3",
                date_of_birth=date(2005, 1, 1),
                communication_email=f"sig-stu-{suffix}@example.com",
                code=f"SIG-STU-{suffix}",
                roles=[User.UserRole.STUDENT],
            )

    def _put_user(self, actor: User, subject_id: int, data, *, multipart=False):
        self.client.force_authenticate(user=actor)
        fmt = "multipart" if multipart else "json"
        return self.client.put(
            f"{self.api_prefix}/users/{subject_id}",
            data,
            format=fmt,
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )

    def test_staff_self_upload_sets_signature_url(self):
        res = self._put_user(
            self.teacher,
            self.teacher.id,
            {"user_signature": _make_png()},
            multipart=True,
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.data["data"]["user_signature_url"])

    def test_admin_cannot_upload_for_other_user(self):
        res = self._put_user(
            self.admin,
            self.teacher.id,
            {"user_signature": _make_png()},
            multipart=True,
        )
        self.assertEqual(res.status_code, 403, res.content)

    def test_student_cannot_set_signature(self):
        res = self._put_user(
            self.student,
            self.student.id,
            {"user_signature": _make_png()},
            multipart=True,
        )
        self.assertIn(res.status_code, (400, 403), res.content)

    def test_staff_self_can_clear_signature(self):
        upload = self._put_user(
            self.teacher,
            self.teacher.id,
            {"user_signature": _make_png()},
            multipart=True,
        )
        self.assertEqual(upload.status_code, 200, upload.content)

        cleared = self._put_user(
            self.teacher,
            self.teacher.id,
            {"user_signature": None},
        )
        self.assertEqual(cleared.status_code, 200, cleared.content)
        self.assertIsNone(cleared.data["data"]["user_signature_url"])

    def test_admin_can_read_other_staff_signature_url(self):
        self._put_user(
            self.teacher,
            self.teacher.id,
            {"user_signature": _make_png()},
            multipart=True,
        )
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(
            f"{self.api_prefix}/users/{self.teacher.id}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.data["data"]["user_signature_url"])

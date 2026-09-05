import io
import unittest
import zipfile
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
from app_course.models import Category, Course, Program, UserCourse
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

def _make_jpeg_upload(name: str = "photo.jpg") -> SimpleUploadedFile:
    buf = io.BytesIO()
    Image.new("RGB", (80, 100), color=(120, 140, 160)).save(buf, format="JPEG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/jpeg")

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class IdPhotosExportTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.manager = User.objects.create_user(
                email=f"ipe-m-{suffix}@example.com",
                password="x",
                name="Mgr",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"ipe-m-{suffix}@example.com",
                code=f"ipe-m-{suffix}",
                roles=[User.UserRole.MANAGER],
            )
            self.teacher = User.objects.create_user(
                email=f"ipe-t-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="2",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"ipe-t-{suffix}@example.com",
                code=f"ipe-t-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.student_a = User.objects.create_user(
                email=f"ipe-sa-{suffix}@example.com",
                password="x",
                name="Student A",
                phone_number="0911",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"ipe-sa-{suffix}@example.com",
                code=f"ipe-sa-{suffix}",
                roles=[User.UserRole.STUDENT],
                id_photo=_make_jpeg_upload("a.jpg"),
            )
            self.student_b = User.objects.create_user(
                email=f"ipe-sb-{suffix}@example.com",
                password="x",
                name="Student B",
                phone_number="0912",
                date_of_birth=date(2001, 1, 1),
                communication_email=f"ipe-sb-{suffix}@example.com",
                code=f"ipe-sb-{suffix}",
                roles=[User.UserRole.STUDENT],
                id_photo=_make_jpeg_upload("b.jpg"),
            )
            self.staff = User.objects.create_user(
                email=f"ipe-st-{suffix}@example.com",
                password="x",
                name="Staff Person",
                phone_number="0933",
                date_of_birth=date(1985, 1, 1),
                communication_email=f"ipe-st-{suffix}@example.com",
                code=f"ipe-st-{suffix}",
                roles=[User.UserRole.TEACHER],
                id_photo=_make_jpeg_upload("staff.jpg"),
            )
            self.cat_a = Category.objects.create(name=f"CatA-{suffix}", sort_order=1)
            self.cat_b = Category.objects.create(name=f"CatB-{suffix}", sort_order=2)
            self.program = Program.objects.create(name=f"P-ipe-{suffix}")
            self.course_a = Course.objects.create(
                title=f"Course A-{suffix}",
                start_date=date(2026, 1, 1),
                end_date=date(2030, 1, 1),
                status=Course.CourseStatus.ACTIVE,
                category=self.cat_a,
                program=self.program,
            )
            self.course_b = Course.objects.create(
                title=f"Course B-{suffix}",
                start_date=date(2026, 1, 1),
                end_date=date(2030, 1, 1),
                status=Course.CourseStatus.ACTIVE,
                category=self.cat_b,
                program=self.program,
            )
            UserCourse.objects.create(
                user=self.student_a,
                course=self.course_a,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=self.student_b,
                course=self.course_b,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def _client(self, user):
        c = APIClient()
        c.force_authenticate(user=user)
        c.credentials(HTTP_TENANT=self.schema_name)
        return c

    def test_category_filter_narrows_student_zip(self):
        resp = self._client(self.manager).get(
            f"{self.api_prefix}/reports/id-photos/export",
            {
                "audience": "student",
                "format": "zip",
                "category_id": self.cat_a.id,
            },
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            names = zf.namelist()
        self.assertEqual(len(names), 1)
        self.assertTrue(any(self.student_a.code in n for n in names))

    def test_manager_can_export_staff_zip(self):
        resp = self._client(self.manager).get(
            f"{self.api_prefix}/reports/id-photos/export",
            {"audience": "staff", "format": "zip"},
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            names = zf.namelist()
        self.assertEqual(len(names), 1)
        self.assertTrue(any(self.staff.code in n for n in names))
        self.assertFalse(any(self.student_a.code in n for n in names))

    def test_teacher_forbidden(self):
        resp = self._client(self.teacher).get(
            f"{self.api_prefix}/reports/id-photos/export",
            {"audience": "student", "format": "zip"},
        )
        self.assertEqual(resp.status_code, 403)

    def test_pdf_export_returns_pdf(self):
        resp = self._client(self.manager).get(
            f"{self.api_prefix}/reports/id-photos/export",
            {"audience": "student", "format": "pdf"},
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp["Content-Type"], "application/pdf")
        self.assertTrue(resp.content.startswith(b"%PDF"))

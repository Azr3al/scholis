import unittest
from datetime import date, timedelta
from io import BytesIO
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_announcement.models import AnnouncementAttachment
from app_auth.models import User
from app_course.models import AssignedAsRole, Category, Course, Program, UserCourse
from app_rbac.seeding import seed_rbac


def _jwt_token_user(email: str):
    return type(
        "TokenUser",
        (),
        {"id": email, "is_authenticated": True},
    )()


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class StagingAttachmentUploadTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        today = timezone.localdate()
        with schema_context(self.schema_name):
            seed_rbac()
            self.teacher = User.objects.create_user(
                email=f"tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"Prog {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"Course {suffix}",
                category=cat,
                program=prog,
                start_date=today,
                end_date=today + timedelta(days=30),
                created_by=self.teacher,
            )
            role = AssignedAsRole.objects.first()
            UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as_role=role,
            )

    def _client(self, user=None) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user or self.teacher)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_teacher_can_upload_staging_image(self):
        url = f"/api/v1/courses/{self.course.id}/announcement-attachments"
        with schema_context(self.schema_name):
            resp = self._client().post(
                url,
                {"file": SimpleUploadedFile("shot.png", b"png-bytes", content_type="image/png")},
                format="multipart",
            )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()["data"]
        self.assertIn("id", data)
        self.assertIn("byte_size", data)
        with schema_context(self.schema_name):
            att = AnnouncementAttachment.objects.get(id=data["id"])
            self.assertIsNone(att.announcement_id)
            self.assertEqual(att.course_id, self.course.id)

    def test_teacher_can_upload_staging_image_with_jwt_token_user(self):
        """Stateless JWT auth yields TokenUser, not a User model instance."""
        url = f"/api/v1/courses/{self.course.id}/announcement-attachments"
        token_user = _jwt_token_user(self.teacher.email)
        with schema_context(self.schema_name):
            resp = self._client(token_user).post(
                url,
                {"file": SimpleUploadedFile("shot.png", b"png-bytes", content_type="image/png")},
                format="multipart",
            )
        self.assertEqual(resp.status_code, 201, resp.content)
        data = resp.json()["data"]
        with schema_context(self.schema_name):
            att = AnnouncementAttachment.objects.get(id=data["id"])
            self.assertEqual(att.uploaded_by_id, self.teacher.id)

    def test_rejects_non_image_file(self):
        url = f"/api/v1/courses/{self.course.id}/announcement-attachments"
        with schema_context(self.schema_name):
            resp = self._client().post(
                url,
                {"file": SimpleUploadedFile("doc.pdf", b"pdf", content_type="application/pdf")},
                format="multipart",
            )
        self.assertEqual(resp.status_code, 400)

    def test_student_forbidden(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            student = User.objects.create_user(
                email=f"stu-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            url = f"/api/v1/courses/{self.course.id}/announcement-attachments"
            resp = self._client(student).post(
                url,
                {"file": SimpleUploadedFile("shot.png", b"png", content_type="image/png")},
                format="multipart",
            )
        self.assertEqual(resp.status_code, 403)

import unittest
from datetime import date, timedelta
from io import BytesIO
from unittest.mock import patch
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_announcement.announcement_batch_create import MAX_BATCH_COURSE_IDS
from app_announcement.models import Announcement, AnnouncementAttachment, PostType
from app_auth.models import User
from app_course.models import AssignedAsRole, Category, Course, Program, UserCourse
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class AnnouncementBatchCreateTests(TestCase):
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
            self.admin = User.objects.create_user(
                email=f"adm-batch-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"tch-batch-{suffix}@example.com",
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
            self.course_a = Course.objects.create(
                title=f"Course A {suffix}",
                category=cat,
                program=prog,
                start_date=today,
                end_date=today + timedelta(days=30),
                created_by=self.admin,
            )
            self.course_b = Course.objects.create(
                title=f"Course B {suffix}",
                category=cat,
                program=prog,
                start_date=today,
                end_date=today + timedelta(days=30),
                created_by=self.admin,
            )
            mt_role = AssignedAsRole.objects.create(
                name=f"MT {suffix}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
            )
            with patch("app_telegram.signals.dm_invite_link_to_teacher.delay"):
                UserCourse.objects.create(
                    user=self.teacher,
                    course=self.course_a,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                    assigned_as_role=mt_role,
                )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _batch_payload(self, course_ids, **extra):
        payload = {
            "title": "Batch title",
            "data": "<p>Batch body</p>",
            "post_type": "announcement",
            "course_ids": course_ids,
            **extra,
        }
        return payload

    def test_teacher_without_announcement_manage_gets_403(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).post(
                "/api/v1/announcements/batch",
                self._batch_payload([self.course_a.id]),
                format="multipart",
            )
        self.assertEqual(resp.status_code, 403)

    def test_empty_course_ids_returns_400(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.admin).post(
                "/api/v1/announcements/batch",
                self._batch_payload("[]"),
                format="multipart",
            )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("course_ids", resp.json().get("details", ""))

    def test_invalid_course_ids_json_returns_400(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.admin).post(
                "/api/v1/announcements/batch",
                {
                    "title": "Batch title",
                    "data": "<p>Batch body</p>",
                    "post_type": "announcement",
                    "course_ids": "not-json",
                },
                format="multipart",
            )
        self.assertEqual(resp.status_code, 400)

    def test_course_field_rejected_on_batch(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.admin).post(
                "/api/v1/announcements/batch",
                {
                    "title": "Batch title",
                    "data": "<p>Batch body</p>",
                    "post_type": "announcement",
                    "course_ids": f"[{self.course_a.id}]",
                    "course": str(self.course_a.id),
                },
                format="multipart",
            )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("course_ids", resp.json().get("details", ""))

    def test_over_max_course_ids_returns_400(self):
        ids = list(range(1, MAX_BATCH_COURSE_IDS + 2))
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.admin).post(
                "/api/v1/announcements/batch",
                self._batch_payload(ids),
                format="multipart",
            )
        self.assertEqual(resp.status_code, 400)

    @patch("app_announcement.serializers.send_announcement_push_notifications_task.delay")
    def test_admin_creates_for_all_courses_returns_201(self, mock_push_delay):
        course_ids = [self.course_a.id, self.course_b.id]
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.admin).post(
                "/api/v1/announcements/batch",
                self._batch_payload(course_ids),
                format="multipart",
            )
        self.assertEqual(resp.status_code, 201, resp.content)
        body = resp.json()
        self.assertFalse(body["isError"])
        created = body["data"]["created"]
        self.assertEqual(len(created), 2)
        self.assertEqual({row["course_id"] for row in created}, set(course_ids))
        self.assertEqual(body["data"]["failed"], [])
        self.assertEqual(mock_push_delay.call_count, 2)
        with schema_context(self.schema_name):
            self.assertEqual(
                Announcement.objects.filter(
                    title="Batch title",
                    course_id__in=course_ids,
                ).count(),
                2,
            )

    def test_partial_failure_returns_207(self):
        missing_id = 999_999_991
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.admin).post(
                "/api/v1/announcements/batch",
                self._batch_payload([self.course_a.id, missing_id]),
                format="multipart",
            )
        self.assertEqual(resp.status_code, 207, resp.content)
        body = resp.json()
        self.assertFalse(body["isError"])
        self.assertEqual(len(body["data"]["created"]), 1)
        self.assertEqual(body["data"]["created"][0]["course_id"], self.course_a.id)
        self.assertEqual(len(body["data"]["failed"]), 1)
        self.assertEqual(body["data"]["failed"][0]["course_id"], missing_id)

    def test_all_courses_missing_returns_400(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.admin).post(
                "/api/v1/announcements/batch",
                self._batch_payload([999_999_992, 999_999_993]),
                format="multipart",
            )
        self.assertEqual(resp.status_code, 400, resp.content)
        body = resp.json()
        self.assertTrue(body["isError"])
        self.assertEqual(body["data"]["created"], [])

    def test_dedupes_duplicate_course_ids(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.admin).post(
                "/api/v1/announcements/batch",
                self._batch_payload(
                    f"[{self.course_a.id}, {self.course_a.id}, {self.course_b.id}]"
                ),
                format="multipart",
            )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(len(resp.json()["data"]["created"]), 2)

    def test_attachments_applied_to_each_created_announcement(self):
        image = SimpleUploadedFile(
            "notice.png",
            BytesIO(b"\x89PNG\r\n\x1a\n").getvalue(),
            content_type="image/png",
        )
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.admin).post(
                "/api/v1/announcements/batch",
                self._batch_payload(
                    [self.course_a.id, self.course_b.id],
                    files=image,
                ),
                format="multipart",
            )
        self.assertEqual(resp.status_code, 201, resp.content)
        created_ids = [row["id"] for row in resp.json()["data"]["created"]]
        with schema_context(self.schema_name):
            for announcement_id in created_ids:
                self.assertEqual(
                    AnnouncementAttachment.objects.filter(
                        announcement_id=announcement_id
                    ).count(),
                    1,
                )

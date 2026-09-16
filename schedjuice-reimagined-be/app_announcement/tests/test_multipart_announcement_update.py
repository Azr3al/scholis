import json
import unittest
from datetime import date
from io import BytesIO
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_announcement.models import Announcement, AnnouncementAttachment, PostType
from app_announcement.views import (
    _apply_announcement_attachment_mutations,
    _parse_deleted_attachment_ids,
)
from app_auth.models import User
from app_course.models import Course
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

class ParseDeletedAttachmentIdsTests(unittest.TestCase):
    def test_json_array_string(self):
        class Data:
            def get(self, key, default=None):
                return "[1, 2]" if key == "deleted_attachment_ids" else default

            def getlist(self, key):
                return []

        self.assertEqual(_parse_deleted_attachment_ids(Data()), [1, 2])

    def test_repeated_form_keys(self):
        class Data:
            def get(self, key, default=None):
                return None

            def getlist(self, key):
                return ["3", "4"] if key == "deleted_attachment_ids" else []

        self.assertEqual(_parse_deleted_attachment_ids(Data()), [3, 4])

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ApplyAnnouncementAttachmentMutationsTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            self.user = User.objects.create_user(
                email=f"teacher-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.course = Course.objects.first()
            self.announcement = Announcement.objects.create(
                post_type=PostType.DAILY_LESSON,
                finished_unit=1,
                data="<p>Hi</p>",
                html_data="<p>Hi</p>",
                course=self.course,
                created_by=self.user,
            )
            self.existing = AnnouncementAttachment.objects.create(
                announcement=self.announcement,
                file=SimpleUploadedFile("old.png", b"old-bytes", content_type="image/png"),
                filename="old.png",
            )

    def test_deletes_and_creates_attachments(self):
        existing_id = self.existing.id

        class Data:
            def get(self, key, default=None):
                return None

            def getlist(self, key):
                if key == "deleted_attachment_ids":
                    return [str(existing_id)]
                return []

        class Files:
            def getlist(self, key):
                return [
                    SimpleUploadedFile("new.jpg", b"new-bytes", content_type="image/jpeg")
                ]

        class Req:
            data = Data()
            FILES = Files()

        with schema_context(self.schema_name):
            _apply_announcement_attachment_mutations(Req(), self.announcement)
            self.assertFalse(
                AnnouncementAttachment.objects.filter(id=existing_id).exists()
            )
            att = AnnouncementAttachment.objects.get(announcement=self.announcement)
            self.assertEqual(att.filename, "new.jpg")

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class MultipartAnnouncementUpdateTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.user = User.objects.create_user(
                email=f"teacher-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.course = Course.objects.first()
            self.announcement = Announcement.objects.create(
                post_type=PostType.DAILY_LESSON,
                finished_unit=2,
                data="<p>Before</p>",
                html_data="<p>Before</p>",
                course=self.course,
                created_by=self.user,
            )

    def _client(self) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=self.user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client


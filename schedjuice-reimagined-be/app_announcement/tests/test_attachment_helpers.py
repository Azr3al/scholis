import unittest
from datetime import date
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_announcement.attachment_helpers import (
    claim_inline_attachments,
    parse_inline_attachment_ids,
)
from app_announcement.models import Announcement, AnnouncementAttachment, PostType
from app_auth.models import User
from app_course.models import Course


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class ParseInlineAttachmentIdsTests(unittest.TestCase):
    def test_extracts_unique_ordered_ids(self):
        html = (
            '<p>Hi</p><img data-attachment-id="5" src="x" />'
            '<img data-attachment-id="3" src="y" />'
        )
        self.assertEqual(parse_inline_attachment_ids(html), [5, 3])

    def test_empty_html_returns_empty(self):
        self.assertEqual(parse_inline_attachment_ids(None), [])
        self.assertEqual(parse_inline_attachment_ids(""), [])


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ClaimInlineAttachmentsTests(TestCase):
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
                html_data="<p>x</p>",
                course=self.course,
                created_by=self.user,
            )

    def test_claims_staging_rows_referenced_in_html(self):
        with schema_context(self.schema_name):
            staging = AnnouncementAttachment.objects.create(
                announcement=None,
                course=self.course,
                uploaded_by=self.user,
                filename="a.png",
                file=SimpleUploadedFile("a.png", b"png", content_type="image/png"),
            )
            html = f'<p>x</p><img data-attachment-id="{staging.id}" src="u" />'
            claim_inline_attachments(
                announcement=self.announcement,
                html_data=html,
                user=self.user,
                course_id=self.course.id,
            )
            staging.refresh_from_db()
            self.assertEqual(staging.announcement_id, self.announcement.id)

    def test_rejects_foreign_staging_attachment(self):
        with schema_context(self.schema_name):
            other = User.objects.create_user(
                email=f"other-{uuid4().hex[:6]}@example.com",
                password="x",
                name="Other",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            foreign = AnnouncementAttachment.objects.create(
                announcement=None,
                course=self.course,
                uploaded_by=other,
                filename="a.png",
                file=SimpleUploadedFile("a.png", b"png", content_type="image/png"),
            )
            html = f'<img data-attachment-id="{foreign.id}" src="u" />'
            with self.assertRaises(PermissionError):
                claim_inline_attachments(
                    announcement=self.announcement,
                    html_data=html,
                    user=self.user,
                    course_id=self.course.id,
                )

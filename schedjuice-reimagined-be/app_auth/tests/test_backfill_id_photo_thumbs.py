import io
import unittest
from datetime import date
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from PIL import Image
from tenant_schemas.utils import schema_context

from app_auth.models import User


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _make_jpeg():
    buf = io.BytesIO()
    Image.new("RGB", (80, 100), color=(120, 140, 160)).save(buf, format="JPEG")
    return SimpleUploadedFile("photo.jpg", buf.getvalue(), content_type="image/jpeg")


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class BackfillIdPhotoThumbsTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_dry_run_counts_users_needing_thumbs(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            user = User.objects.create_user(
                email=f"bf-{suffix}@example.com",
                password="x",
                name="Backfill",
                phone_number="1",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"bf-{suffix}@example.com",
                code=f"bf-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            user.id_photo = _make_jpeg()
            user.save(update_fields=["id_photo"])
            self.assertFalse(user.id_photo_thumb)

        out = io.StringIO()
        call_command(
            "backfill-id-photo-thumbs",
            schema_name=self.schema_name,
            dry_run=True,
            stdout=out,
        )
        self.assertIn("would process", out.getvalue())

    def test_backfill_generates_thumb(self):
        suffix = uuid4().hex[:6]
        user_id = None
        with schema_context(self.schema_name):
            user = User.objects.create_user(
                email=f"bf2-{suffix}@example.com",
                password="x",
                name="Backfill2",
                phone_number="1",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"bf2-{suffix}@example.com",
                code=f"bf2-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            user.id_photo = _make_jpeg()
            user.save(update_fields=["id_photo"])
            user_id = user.id

        call_command(
            "backfill-id-photo-thumbs",
            schema_name=self.schema_name,
        )
        with schema_context(self.schema_name):
            user = User.objects.get(pk=user_id)
            self.assertTrue(bool(user.id_photo_thumb.name))

import io
import unittest
from datetime import date
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from PIL import Image
from rest_framework.test import APIRequestFactory
from tenant_schemas.utils import schema_context

from app_auth.id_photo_thumbs import THUMB_LONG_EDGE, generate_id_photo_thumb, sync_id_photo_thumb
from app_auth.models import User
from app_auth.serializers import UserSerializer
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _make_jpeg(w: int = 400, h: int = 500) -> SimpleUploadedFile:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color=(100, 120, 140)).save(buf, format="JPEG")
    return SimpleUploadedFile("photo.jpg", buf.getvalue(), content_type="image/jpeg")


class GenerateIdPhotoThumbTests(unittest.TestCase):
    def test_resizes_to_long_edge(self):
        thumb = generate_id_photo_thumb(_make_jpeg(800, 1000))
        img = Image.open(thumb)
        self.assertEqual(max(img.size), THUMB_LONG_EDGE)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class SyncIdPhotoThumbTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_creates_thumb_on_upload(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            user = User.objects.create_user(
                email=f"thumb-{suffix}@example.com",
                password="x",
                name="Thumb Test",
                phone_number="1",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"thumb-{suffix}@example.com",
                code=f"thumb-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            user.id_photo = _make_jpeg()
            user.save(update_fields=["id_photo"])
            sync_id_photo_thumb(user)
            user.refresh_from_db()
            self.assertTrue(bool(user.id_photo_thumb.name))
            img = Image.open(user.id_photo_thumb)
            self.assertEqual(max(img.size), THUMB_LONG_EDGE)

    def test_clears_thumb_when_photo_cleared(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            user = User.objects.create_user(
                email=f"clear-{suffix}@example.com",
                password="x",
                name="Clear Test",
                phone_number="1",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"clear-{suffix}@example.com",
                code=f"clear-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            user.id_photo = _make_jpeg()
            user.save(update_fields=["id_photo"])
            sync_id_photo_thumb(user)
            user.id_photo = None
            user.save(update_fields=["id_photo"])
            sync_id_photo_thumb(user)
            user.refresh_from_db()
            self.assertFalse(user.id_photo_thumb)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class UserSerializerIdPhotoThumbTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_update_id_photo_generates_thumb(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            user = User.objects.create_user(
                email=f"ser-{suffix}@example.com",
                password="x",
                name="Ser Test",
                phone_number="1",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"ser-{suffix}@example.com",
                code=f"ser-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            factory = APIRequestFactory()
            request = factory.patch("/")
            ser = UserSerializer(
                user,
                data={"id_photo": _make_jpeg()},
                partial=True,
                context={"request": request},
            )
            self.assertTrue(ser.is_valid(), ser.errors)
            ser.save()
            user.refresh_from_db()
            self.assertTrue(bool(user.id_photo_thumb.name))

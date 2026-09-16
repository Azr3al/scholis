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

from app_auth.id_photo_thumbs import sync_id_photo_thumb
from app_auth.models import User
from app_rbac.seeding import seed_rbac

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

def _jwt_token_user(email: str):
    return type(
        "TokenUser",
        (),
        {"id": email, "is_authenticated": True},
    )()

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class IdPhotoUrlsViewTests(TestCase):
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
            self.manager = User.objects.create_user(
                email=f"url-m-{suffix}@example.com",
                password="x",
                name="Mgr",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"url-m-{suffix}@example.com",
                code=f"url-m-{suffix}",
                roles=[User.UserRole.MANAGER],
            )
            self.student = User.objects.create_user(
                email=f"url-s-{suffix}@example.com",
                password="x",
                name="Stu",
                phone_number="2",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"url-s-{suffix}@example.com",
                code=f"url-s-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            self.student.id_photo = _make_jpeg()
            self.student.save(update_fields=["id_photo"])
            sync_id_photo_thumb(self.student)

    def _post(self, body):
        self.client.force_authenticate(user=self.manager)
        return self.client.post(
            f"{self.api_prefix}/id-photo-urls",
            body,
            format="json",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )

    def test_returns_thumb_urls(self):
        res = self._post({"user_ids": [self.student.id], "variant": "thumb"})
        self.assertEqual(res.status_code, 200)
        urls = res.data["data"]["urls"]
        self.assertIn(str(self.student.id), urls)
        self.assertIsNotNone(urls[str(self.student.id)])

    def test_rejects_oversized_batch(self):
        ids = list(range(1, 52))
        res = self._post({"user_ids": ids, "variant": "thumb"})
        self.assertEqual(res.status_code, 400)

    def test_thumb_falls_back_to_full_when_thumb_missing(self):
        with schema_context(self.schema_name):
            self.student.id_photo_thumb = None
            self.student.save(update_fields=["id_photo_thumb"])

        res = self._post({"user_ids": [self.student.id], "variant": "thumb"})
        self.assertEqual(res.status_code, 200)
        urls = res.data["data"]["urls"]
        self.assertIsNotNone(urls[str(self.student.id)])

    def test_works_with_jwt_token_user(self):
        """Stateless JWT auth yields TokenUser, not a User model instance."""
        token_user = _jwt_token_user(self.manager.email)
        self.client.force_authenticate(user=token_user)
        res = self.client.post(
            f"{self.api_prefix}/id-photo-urls",
            {"user_ids": [self.student.id], "variant": "thumb"},
            format="json",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertIsNotNone(res.data["data"]["urls"][str(self.student.id)])

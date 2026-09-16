"""Tests for attachment field type validation, rules, and upload security."""

from __future__ import annotations

import io
import unittest
import zipfile
from datetime import date
from unittest.mock import MagicMock, patch
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_attachment.validation import (
    sniff_upload_mime,
    validate_custom_field_attachment_upload,
)
from app_auth.models import User
from app_custom_fields.attachment_rules import (
    FILE_TYPE_PRESET_IMAGE,
    MIME_TO_EXTENSIONS,
    resolve_allowed_mimes_and_extensions,
    validate_attachment_definition_rules,
)
from app_custom_fields.models import CustomFieldAttachment, FieldDefinition
from app_custom_fields.serializers import CustomFieldDefinitionSerializer
from app_custom_fields.validation import validate_user_custom_data_for_write
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _png_file(name: str = "photo.png", size: int = 32) -> SimpleUploadedFile:
    # Minimal PNG header
    content = b"\x89PNG\r\n\x1a\n" + b"\x00" * max(0, size - 8)
    return SimpleUploadedFile(name, content, content_type="image/png")


def _docx_file(name: str = "doc.docx") -> SimpleUploadedFile:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("[Content_Types].xml", "<Types/>")
        zf.writestr("word/document.xml", "<w:document/>")
    return SimpleUploadedFile(
        name,
        buf.getvalue(),
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


class AttachmentRulesTests(SimpleTestCase):
    def test_image_preset_resolves_mimes(self):
        mimes, exts = resolve_allowed_mimes_and_extensions(
            {"file_type_preset": FILE_TYPE_PRESET_IMAGE}
        )
        self.assertIn("image/png", mimes)
        self.assertIn(".png", exts)

    def test_normalizes_default_rules(self):
        rules = validate_attachment_definition_rules(None)
        self.assertEqual(rules["max_files"], 1)
        self.assertEqual(rules["file_type_preset"], "image_document")


class AttachmentMimeSniffTests(SimpleTestCase):
    def test_docx_sniffed_not_plain_zip(self):
        f = _docx_file()
        mime = sniff_upload_mime(f, "report.docx")
        self.assertEqual(
            mime,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

    def test_oversized_file_rejected(self):
        f = _png_file(size=64)
        mimes, exts = resolve_allowed_mimes_and_extensions({"file_type_preset": "image"})
        with self.assertRaises(Exception):
            validate_custom_field_attachment_upload(
                f,
                "photo.png",
                max_bytes=10,
                allowed_mimes=mimes,
                allowed_extensions=exts,
                mime_to_extensions=MIME_TO_EXTENSIONS,
            )


class AttachmentCoercionTests(SimpleTestCase):
    def _attachment_def(self, key="scan"):
        return FieldDefinition(
            entity_type="app_auth.User",
            field_key=key,
            field_label=key,
            field_type=FieldDefinition.FieldType.ATTACHMENT,
            validation_rules={"max_files": 2, "file_type_preset": "image"},
            is_active=True,
        )

    def test_rejects_foreign_attachment_id(self):
        defn = self._attachment_def()
        link = MagicMock()
        link.attachment_id = 99
        link.uploaded_by_id = 2
        link.attachment = MagicMock(
            id=99, filename="x.png", size=10, file_type="image/png", is_deleted=False
        )
        actor = MagicMock(id=1)

        with patch(
            "app_custom_fields.validation.CustomFieldAttachment.objects"
        ) as mock_mgr:
            mock_mgr.select_related.return_value.filter.return_value = [link]
            with self.assertRaises(DRFValidationError):
                validate_user_custom_data_for_write(
                    incoming={"scan": [{"id": 99}]},
                    existing={},
                    partial=False,
                    actor_user=actor,
                    definitions=[defn],
                )

    def test_allows_existing_attachment_without_reupload(self):
        defn = self._attachment_def()
        link = MagicMock()
        link.attachment_id = 99
        link.uploaded_by_id = 2
        link.attachment = MagicMock(
            id=99, filename="x.png", size=10, file_type="image/png", is_deleted=False
        )
        actor = MagicMock(id=1)
        existing = {"scan": [{"id": 99, "filename": "x.png", "size": 10, "mime": "image/png"}]}

        with patch(
            "app_custom_fields.validation.CustomFieldAttachment.objects"
        ) as mock_mgr:
            mock_mgr.select_related.return_value.filter.return_value = [link]
            out = validate_user_custom_data_for_write(
                incoming={"scan": [{"id": 99}]},
                existing=existing,
                partial=True,
                actor_user=actor,
                definitions=[defn],
            )
        self.assertEqual(out["scan"][0]["filename"], "x.png")
        self.assertEqual(out["scan"][0]["id"], 99)


class AttachmentDefinitionSerializerTests(SimpleTestCase):
    def test_rejects_registration_required(self):
        ser = CustomFieldDefinitionSerializer(
            data={
                "entity_type": "app_auth.User",
                "field_key": "id_scan",
                "field_label": "ID scan",
                "field_type": "attachment",
                "required_at": "registration",
            }
        )
        self.assertFalse(ser.is_valid())
        self.assertIn("required_at", ser.errors)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class AttachmentUploadIntegrationTests(TestCase):
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
            self.admin = User.objects.create_user(
                email=f"adm-att-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.other = User.objects.create_user(
                email=f"oth-att-{suffix}@example.com",
                password="x",
                name="Other",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.defn = FieldDefinition.objects.create(
                source="custom",
                entity_type="app_auth.User",
                field_key=f"id_scan_{suffix}",
                field_label="ID scan",
                field_type=FieldDefinition.FieldType.ATTACHMENT,
                validation_rules={
                    "max_file_size_mb": 10,
                    "max_files": 1,
                    "file_type_preset": "image",
                },
                is_active=True,
            )
            self.field_key = self.defn.field_key

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_upload_then_save_custom_data(self):
        with schema_context(self.schema_name):
            client = self._client(self.admin)
            f = _png_file()
            res = client.post(
                "/api/v1/custom-field-attachments",
                {
                    "entity_type": "app_auth.User",
                    "field_key": self.field_key,
                    "file": f,
                },
                format="multipart",
            )
            self.assertEqual(res.status_code, 200, res.content)
            att_id = res.json()["data"][0]["id"]

            out = validate_user_custom_data_for_write(
                incoming={self.field_key: [{"id": att_id}]},
                existing={},
                partial=False,
                actor_user=self.admin,
                definitions=[self.defn],
            )
            self.assertEqual(out[self.field_key][0]["filename"], "photo.png")

    def test_cannot_reference_another_users_upload(self):
        with schema_context(self.schema_name):
            client = self._client(self.admin)
            res = client.post(
                "/api/v1/custom-field-attachments",
                {
                    "entity_type": "app_auth.User",
                    "field_key": self.field_key,
                    "file": _png_file(),
                },
                format="multipart",
            )
            att_id = res.json()["data"][0]["id"]

            with self.assertRaises(DRFValidationError):
                validate_user_custom_data_for_write(
                    incoming={self.field_key: [{"id": att_id}]},
                    existing={},
                    partial=False,
                    actor_user=self.other,
                    definitions=[self.defn],
                )

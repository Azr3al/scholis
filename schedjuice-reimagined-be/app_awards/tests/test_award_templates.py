import json
import unittest
from datetime import date, timedelta
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import IntegrityError, connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_awards.document import (
    EMPTY_AWARD_DOCUMENT,
    next_untitled_name,
    validate_award_document,
)
from app_awards.models import AwardTemplate, AwardTitle
from app_course.models import Category, Course, Program
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class NextUntitledNameTests(TestCase):
    def test_untitled_then_numbered(self):
        self.assertEqual(next_untitled_name([]), "Untitled")
        self.assertEqual(next_untitled_name(["Untitled"]), "Untitled 2")
        self.assertEqual(next_untitled_name(["Untitled", "Untitled 2"]), "Untitled 3")
        self.assertEqual(next_untitled_name(["May"]), "Untitled")


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class AwardTemplateModelTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def test_duplicate_name_on_title_raises(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            title = AwardTitle.objects.create(
                name=f"Top 1 {suffix}",
                origin=AwardTitle.Origin.ADMIN,
                is_pinned=True,
            )
            AwardTemplate.objects.create(
                title=title,
                name="May",
                document=dict(EMPTY_AWARD_DOCUMENT),
            )
            with self.assertRaises(IntegrityError):
                AwardTemplate.objects.create(
                    title=title,
                    name="may",
                    document=dict(EMPTY_AWARD_DOCUMENT),
                )


class ValidateAwardDocumentTests(TestCase):
    def test_rejects_unknown_layer_type(self):
        doc = dict(EMPTY_AWARD_DOCUMENT)
        doc["layers"] = [
            {
                "id": "1",
                "type": "blend",
                "x": 0,
                "y": 0,
                "width": 1,
                "height": 1,
                "z": 0,
            }
        ]
        with self.assertRaises(ValidationError) as ctx:
            validate_award_document(doc)
        self.assertIn("layers", ctx.exception.detail)

    def test_rejects_output_data_url_on_layer(self):
        doc = dict(EMPTY_AWARD_DOCUMENT)
        doc["layers"] = [
            {
                "id": "1",
                "type": "text",
                "x": 0,
                "y": 0,
                "width": 1,
                "height": 1,
                "z": 0,
                "text": "x",
                "dataUrl": "data:image/png;base64,aaa",
            }
        ]
        with self.assertRaises(ValidationError) as ctx:
            validate_award_document(doc)
        self.assertIn("layers", ctx.exception.detail)

    def test_rejects_wrong_kind(self):
        doc = dict(EMPTY_AWARD_DOCUMENT)
        doc["kind"] = "certificate"
        with self.assertRaises(ValidationError) as ctx:
            validate_award_document(doc)
        self.assertIn("kind", ctx.exception.detail)

    def test_accepts_named_person_user_id(self):
        doc = dict(EMPTY_AWARD_DOCUMENT)
        doc["layers"] = [
            {
                "id": "1",
                "type": "named_person",
                "x": 0,
                "y": 0,
                "width": 1,
                "height": 1,
                "z": 0,
                "user_id": 9,
                "fontSize": 24,
                "fontFamily": "Arial",
                "color": "#111",
                "align": "center",
            }
        ]
        validate_award_document(doc)

    def test_rejects_non_positive_background_scale(self):
        doc = dict(EMPTY_AWARD_DOCUMENT)
        doc["background"] = {
            "url": None,
            "offsetX": 0,
            "offsetY": 0,
            "scale": 0,
        }
        with self.assertRaises(ValidationError) as ctx:
            validate_award_document(doc)
        self.assertIn("background", ctx.exception.detail)

    def test_accepts_page_preset_and_fill_without_400(self):
        doc = dict(EMPTY_AWARD_DOCUMENT)
        doc["pagePreset"] = "hd_16_9"
        doc["width"] = 1920
        doc["height"] = 1080
        doc["background"] = {
            "url": None,
            "offsetX": -10,
            "offsetY": -4,
            "scale": 1.2,
        }
        validate_award_document(doc)


def _png_file(name: str = "bg.png") -> SimpleUploadedFile:
    return SimpleUploadedFile(
        name,
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
        b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
        b"\r\n-\xdb\x00\x00\x00\x00IEND\xaeB`\x82",
        content_type="image/png",
    )


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class AwardTemplateApiTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

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
                email=f"at-admin-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"at-tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"at-stu-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.cat = Category.objects.create(name=f"Cat {suffix}")
            self.prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=today,
                end_date=today + timedelta(days=60),
            )
            self.org_title = AwardTitle.objects.create(
                name=f"Top 1 {suffix}",
                origin=AwardTitle.Origin.ADMIN,
                is_pinned=True,
            )
            self.local = AwardTitle.objects.create(
                name=f"One-off {suffix}",
                origin=AwardTitle.Origin.LOCAL,
                course=self.course,
            )
            self.other_title = AwardTitle.objects.create(
                name=f"Top 2 {suffix}",
                origin=AwardTitle.Origin.ADMIN,
                is_pinned=True,
            )
            self.suffix = suffix

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_teacher_cannot_create_template(self):
        with schema_context(self.schema_name):
            resp = self._client(self.teacher).post(
                f"{self.api_prefix}/award-titles/{self.org_title.id}/templates",
                {},
                format="json",
            )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_student_cannot_list_templates(self):
        with schema_context(self.schema_name):
            resp = self._client(self.student).get(
                f"{self.api_prefix}/award-titles/{self.org_title.id}/templates",
            )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_local_title_post_400(self):
        with schema_context(self.schema_name):
            resp = self._client(self.admin).post(
                f"{self.api_prefix}/award-titles/{self.local.id}/templates",
                {},
                format="json",
            )
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_post_draft_null_background_201(self):
        with schema_context(self.schema_name):
            resp = self._client(self.admin).post(
                f"{self.api_prefix}/award-titles/{self.org_title.id}/templates",
                {},
                format="json",
            )
        self.assertEqual(resp.status_code, 201, resp.content)
        body = resp.json()["data"]
        self.assertEqual(body["name"], "Untitled")
        self.assertIsNone(body.get("background_url") or body.get("background"))

    def test_patch_document_without_background_400(self):
        with schema_context(self.schema_name):
            created = self._client(self.admin).post(
                f"{self.api_prefix}/award-titles/{self.org_title.id}/templates",
                {},
                format="json",
            )
            tid = created.json()["data"]["id"]
            resp = self._client(self.admin).patch(
                f"{self.api_prefix}/award-templates/{tid}",
                {"document": {**EMPTY_AWARD_DOCUMENT, "layers": []}},
                format="json",
            )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertIn("background", resp.json().get("details", resp.json()))

    def test_unknown_layer_type_400(self):
        with schema_context(self.schema_name):
            created = self._client(self.admin).post(
                f"{self.api_prefix}/award-titles/{self.org_title.id}/templates",
                {},
                format="json",
            )
            tid = created.json()["data"]["id"]
            doc = dict(EMPTY_AWARD_DOCUMENT)
            doc["layers"] = [
                {
                    "id": "1",
                    "type": "blend",
                    "x": 0,
                    "y": 0,
                    "width": 1,
                    "height": 1,
                    "z": 0,
                }
            ]
            resp = self._client(self.admin).patch(
                f"{self.api_prefix}/award-templates/{tid}",
                {"name": "May", "document": doc},
                format="json",
            )
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_named_person_persists_user_id_not_bytes(self):
        png = _png_file()
        with schema_context(self.schema_name):
            created = self._client(self.admin).post(
                f"{self.api_prefix}/award-titles/{self.org_title.id}/templates",
                {},
                format="json",
            )
            tid = created.json()["data"]["id"]
            doc = dict(EMPTY_AWARD_DOCUMENT)
            doc["layers"] = [
                {
                    "id": "np1",
                    "type": "named_person",
                    "x": 0,
                    "y": 0,
                    "width": 10,
                    "height": 10,
                    "z": 1,
                    "user_id": self.admin.id,
                }
            ]
            resp = self._client(self.admin).patch(
                f"{self.api_prefix}/award-templates/{tid}",
                {"name": "May", "document": json.dumps(doc), "background": png},
                format="multipart",
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        layer = resp.json()["data"]["document"]["layers"][0]
        self.assertEqual(layer["user_id"], self.admin.id)
        self.assertFalse(any(str(v).startswith("data:image") for v in layer.values()))

    def test_patch_multipart_background_returns_url(self):
        png = _png_file()
        with schema_context(self.schema_name):
            created = self._client(self.admin).post(
                f"{self.api_prefix}/award-titles/{self.org_title.id}/templates",
                {},
                format="json",
            )
            tid = created.json()["data"]["id"]
            resp = self._client(self.admin).patch(
                f"{self.api_prefix}/award-templates/{tid}",
                {
                    "name": "May",
                    "document": json.dumps(EMPTY_AWARD_DOCUMENT),
                    "background": png,
                },
                format="multipart",
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()["data"]
        self.assertTrue(body.get("background_url"))

    def test_list_scoped_to_title(self):
        with schema_context(self.schema_name):
            self._client(self.admin).post(
                f"{self.api_prefix}/award-titles/{self.org_title.id}/templates",
                {"name": "A"},
                format="json",
            )
            self._client(self.admin).post(
                f"{self.api_prefix}/award-titles/{self.other_title.id}/templates",
                {"name": "B"},
                format="json",
            )
            listed = self._client(self.admin).get(
                f"{self.api_prefix}/award-titles/{self.org_title.id}/templates",
            )
        names = {row["name"] for row in listed.json()["data"]}
        self.assertIn("A", names)
        self.assertNotIn("B", names)

    def test_unknown_template_404(self):
        with schema_context(self.schema_name):
            resp = self._client(self.admin).get(
                f"{self.api_prefix}/award-templates/999999"
            )
        self.assertEqual(resp.status_code, 404, resp.content)

    def test_duplicate_name_400(self):
        with schema_context(self.schema_name):
            first = self._client(self.admin).post(
                f"{self.api_prefix}/award-titles/{self.org_title.id}/templates",
                {"name": "May"},
                format="json",
            )
            self.assertEqual(first.status_code, 201, first.content)
            second = self._client(self.admin).post(
                f"{self.api_prefix}/award-titles/{self.org_title.id}/templates",
                {"name": "may"},
                format="json",
            )
        self.assertEqual(second.status_code, 400, second.content)

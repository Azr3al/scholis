import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_documents.document import EMPTY_DOCUMENT
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class DocumentTemplateApiTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"dt-admin-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.admin_b = User.objects.create_user(
                email=f"dt-adminb-{suffix}@example.com",
                password="x",
                name="Admin B",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.manager = User.objects.create_user(
                email=f"dt-mgr-{suffix}@example.com",
                password="x",
                name="Manager",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.MANAGER],
            )
            self.teacher = User.objects.create_user(
                email=f"dt-tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"dt-stu-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.suffix = suffix

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _token_client(self, user):
        """Stateless JWT shape: id is email; unknown attrs are None (simplejwt TokenUser)."""

        class TokenUserStub:
            def __init__(self, email):
                self.id = email
                self.pk = email
                self.is_authenticated = True

            def __getattr__(self, attr):
                return None

        client = APIClient()
        client.force_authenticate(user=TokenUserStub(user.email))
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_get_does_not_500_for_stateless_jwt_token_user(self):
        with schema_context(self.schema_name):
            created = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates",
                {"scope": "org"},
                format="json",
            )
            self.assertEqual(created.status_code, 201, created.content)
            tid = created.json()["data"]["id"]
            listed = self._token_client(self.admin).get(
                f"{self.api_prefix}/document-templates"
            )
            self.assertEqual(listed.status_code, 200, listed.content)
            detail = self._token_client(self.admin).get(
                f"{self.api_prefix}/document-templates/{tid}"
            )
        self.assertEqual(detail.status_code, 200, detail.content)
        self.assertEqual(detail.json()["data"]["id"], tid)

    def test_two_creates_do_not_share_starter_block_id(self):
        with schema_context(self.schema_name):
            first = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates",
                {"scope": "org"},
                format="json",
            )
            second = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates",
                {"scope": "org"},
                format="json",
            )
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(second.status_code, 201, second.content)
        blocks_a = first.json()["data"]["document"]["blocks"]
        blocks_b = second.json()["data"]["document"]["blocks"]
        self.assertEqual(len(blocks_a), 1)
        self.assertEqual(blocks_a[0]["type"], "text")
        self.assertEqual(blocks_a[0]["text"], "")
        self.assertNotEqual(blocks_a[0]["id"], blocks_b[0]["id"])

    def test_teacher_cannot_list(self):
        with schema_context(self.schema_name):
            resp = self._client(self.teacher).get(
                f"{self.api_prefix}/document-templates"
            )
        self.assertEqual(resp.status_code, 403)

    def test_student_cannot_create(self):
        with schema_context(self.schema_name):
            resp = self._client(self.student).post(
                f"{self.api_prefix}/document-templates",
                {"scope": "org"},
                format="json",
            )
        self.assertEqual(resp.status_code, 403)

    def test_post_draft_published_null(self):
        with schema_context(self.schema_name):
            resp = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates",
                {"scope": "org"},
                format="json",
            )
        self.assertEqual(resp.status_code, 201, resp.content)
        body = resp.json()["data"]
        self.assertIsNone(body["published_document"])
        self.assertEqual(body["status"], "draft")
        self.assertEqual(body["scope"], "org")
        tid = body["id"]
        with schema_context(self.schema_name):
            patched = self._client(self.admin).patch(
                f"{self.api_prefix}/document-templates/{tid}",
                {"document": dict(EMPTY_DOCUMENT)},
                format="json",
            )
        self.assertEqual(patched.status_code, 200, patched.content)
        self.assertIsNone(patched.json()["data"]["published_document"])
        self.assertEqual(patched.json()["data"]["status"], "draft")

    def test_unknown_token_patch_400(self):
        with schema_context(self.schema_name):
            created = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates",
                {"scope": "org"},
                format="json",
            )
            tid = created.json()["data"]["id"]
            doc = dict(EMPTY_DOCUMENT)
            doc["blocks"] = [
                {"id": "t", "type": "text", "text": "{{nope}}", "align": "left"}
            ]
            resp = self._client(self.admin).patch(
                f"{self.api_prefix}/document-templates/{tid}",
                {"document": doc},
                format="json",
            )
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(resp.json().get("details") or resp.json())

    def test_private_of_other_user_404(self):
        with schema_context(self.schema_name):
            created = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates",
                {"scope": "user", "name": f"Priv {self.suffix}"},
                format="json",
            )
            self.assertEqual(created.status_code, 201, created.content)
            tid = created.json()["data"]["id"]
            resp = self._client(self.admin_b).get(
                f"{self.api_prefix}/document-templates/{tid}"
            )
        self.assertEqual(resp.status_code, 404)

    def test_duplicate_org_name_400(self):
        name = f"Offer {self.suffix}"
        with schema_context(self.schema_name):
            first = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates",
                {"scope": "org", "name": name},
                format="json",
            )
            self.assertEqual(first.status_code, 201, first.content)
            second = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates",
                {"scope": "org", "name": name.lower()},
                format="json",
            )
        self.assertEqual(second.status_code, 400, second.content)

    def test_publish_null_image_400(self):
        doc = dict(EMPTY_DOCUMENT)
        doc["blocks"] = [
            {"id": "i", "type": "image", "url": None, "width": 40, "align": "left"}
        ]
        with schema_context(self.schema_name):
            created = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates",
                {"scope": "org"},
                format="json",
            )
            tid = created.json()["data"]["id"]
            patched = self._client(self.admin).patch(
                f"{self.api_prefix}/document-templates/{tid}",
                {"document": doc},
                format="json",
            )
            self.assertEqual(patched.status_code, 200, patched.content)
            resp = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates/{tid}/publish"
            )
            self.assertEqual(resp.status_code, 400, resp.content)
            got = self._client(self.admin).get(
                f"{self.api_prefix}/document-templates/{tid}"
            )
        self.assertIsNone(got.json()["data"]["published_document"])

    def test_publish_idempotent_when_equal(self):
        with schema_context(self.schema_name):
            created = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates",
                {"scope": "org"},
                format="json",
            )
            tid = created.json()["data"]["id"]
            first = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates/{tid}/publish"
            )
            self.assertEqual(first.status_code, 200, first.content)
            self.assertEqual(first.json()["data"]["status"], "published")
            second = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates/{tid}/publish"
            )
        self.assertEqual(second.status_code, 200, second.content)
        self.assertEqual(second.json()["data"]["status"], "published")

    def test_duplicate_org_to_private_clears_published(self):
        with schema_context(self.schema_name):
            created = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates",
                {"scope": "org", "name": f"Dup {self.suffix}"},
                format="json",
            )
            tid = created.json()["data"]["id"]
            published = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates/{tid}/publish"
            )
            self.assertEqual(published.status_code, 200, published.content)
            resp = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates/{tid}/duplicate"
            )
        self.assertEqual(resp.status_code, 201, resp.content)
        body = resp.json()["data"]
        self.assertEqual(body["scope"], "user")
        self.assertEqual(body["owner_id"], self.admin.id)
        self.assertIsNone(body["published_document"])
        self.assertEqual(body["document"], published.json()["data"]["document"])

    def test_duplicate_private_400(self):
        with schema_context(self.schema_name):
            created = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates",
                {"scope": "user"},
                format="json",
            )
            tid = created.json()["data"]["id"]
            resp = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates/{tid}/duplicate"
            )
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_promote_name_collision_400(self):
        name = f"Offer {self.suffix}"
        with schema_context(self.schema_name):
            org = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates",
                {"scope": "org", "name": name},
                format="json",
            )
            self.assertEqual(org.status_code, 201, org.content)
            private = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates",
                {"scope": "user", "name": name},
                format="json",
            )
            self.assertEqual(private.status_code, 201, private.content)
            resp = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates/{private.json()['data']['id']}/promote"
            )
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_promote_creates_unpublished_org(self):
        with schema_context(self.schema_name):
            created = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates",
                {"scope": "user", "name": f"Promo {self.suffix}"},
                format="json",
            )
            tid = created.json()["data"]["id"]
            resp = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates/{tid}/promote"
            )
        self.assertEqual(resp.status_code, 201, resp.content)
        body = resp.json()["data"]
        self.assertEqual(body["scope"], "org")
        self.assertIsNone(body["owner_id"])
        self.assertIsNone(body["published_document"])
        self.assertEqual(body["status"], "draft")

    def test_promote_org_400(self):
        with schema_context(self.schema_name):
            created = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates",
                {"scope": "org"},
                format="json",
            )
            tid = created.json()["data"]["id"]
            resp = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates/{tid}/promote"
            )
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_asset_missing_file_400(self):
        with schema_context(self.schema_name):
            created = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates",
                {"scope": "org"},
                format="json",
            )
            tid = created.json()["data"]["id"]
            resp = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates/{tid}/assets"
            )
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_asset_on_other_private_404(self):
        with schema_context(self.schema_name):
            created = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates",
                {"scope": "user"},
                format="json",
            )
            tid = created.json()["data"]["id"]
            resp = self._client(self.admin_b).post(
                f"{self.api_prefix}/document-templates/{tid}/assets"
            )
        self.assertEqual(resp.status_code, 404, resp.content)

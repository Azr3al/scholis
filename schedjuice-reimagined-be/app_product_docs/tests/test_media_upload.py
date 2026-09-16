import unittest
from unittest.mock import MagicMock, patch

from cryptography.fernet import Fernet
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_product_docs.media_upload import (
    MAX_DOC_IMAGE_BYTES,
    MediaUploadValidationError,
    classify_upload,
)
from app_product_docs.models import DocVideo, DocVideoStatus
from app_product_docs.views import PlatformDocsMediaUploadView

class ClassifyUploadTests(unittest.TestCase):
    def test_rejects_pdf(self):
        f = SimpleUploadedFile("a.pdf", b"x", content_type="application/pdf")
        with self.assertRaises(MediaUploadValidationError):
            classify_upload(f)

    def test_rejects_oversized_image(self):
        f = SimpleUploadedFile(
            "big.png",
            b"x" * (MAX_DOC_IMAGE_BYTES + 1),
            content_type="image/png",
        )
        with self.assertRaises(MediaUploadValidationError) as ctx:
            classify_upload(f)
        self.assertIn("10 MB", str(ctx.exception))

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

_TEST_FERNET_KEY = Fernet.generate_key().decode()

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(
    RBAC_ENFORCE="log_only",
    PLATFORM_SECRETS_ENCRYPTION_KEY=_TEST_FERNET_KEY,
    GITHUB_DOCS_VIDEO_TOKEN="ghp_env_token",
    GITHUB_DOCS_VIDEO_REPO="owner/env-repo",
    GITHUB_DOCS_VIDEO_RELEASE_TAG="videos",
)
class PlatformDocsMediaUploadViewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = MagicMock(is_authenticated=True)
        self.tenant = MagicMock(is_admin=True)

    def _post(self, upload: SimpleUploadedFile):
        request = self.factory.post(
            "/platform/docs/media",
            {"file": upload},
            format="multipart",
        )
        request.tenant = self.tenant
        force_authenticate(request, user=self.user)
        view = PlatformDocsMediaUploadView.as_view()
        with patch(
            "app_rbac.views.effective_permissions",
            return_value=frozenset({"docs.manage"}),
        ), patch(
            "app_organization.permissions.roles_for_user",
            return_value=[User.UserRole.SUPERADMIN],
        ), patch(
            "app_product_docs.views.user_attribution",
            return_value={"user_id": 1, "email": "admin@test.example"},
        ):
            return view(request)

    @patch("app_product_docs.views.GitHubVideoClient")
    def test_video_upload_still_creates_doc_video(self, mock_client_cls):
        url = "https://github.com/owner/repo/releases/download/videos/abc-demo.mp4"
        client = MagicMock()
        client.upload_asset.return_value = url
        mock_client_cls.return_value = client

        upload = SimpleUploadedFile("demo.mp4", b"mp4", content_type="video/mp4")
        response = self._post(upload)

        self.assertEqual(response.status_code, 201)
        data = response.data["data"]
        self.assertEqual(data["media_type"], "video")
        self.assertIn("video:", data["markdown_snippet"])
        with schema_context(get_public_schema_name()):
            video = DocVideo.objects.latest("id")
            self.assertEqual(video.status, DocVideoStatus.READY)

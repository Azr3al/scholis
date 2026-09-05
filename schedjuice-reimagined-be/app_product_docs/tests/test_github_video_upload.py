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
from app_product_docs.github_video_client import GitHubVideoUploadError
from app_product_docs.models import DocVideo, DocVideoStatus
from app_product_docs.views import PlatformDocsVideoUploadView

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
class GitHubVideoUploadViewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = MagicMock(is_authenticated=True)
        self.tenant = MagicMock(is_admin=True)

    def _post_upload(self, *, token="ghp_x", repo="owner/repo"):
        with self.settings(
            GITHUB_DOCS_VIDEO_TOKEN=token,
            GITHUB_DOCS_VIDEO_REPO=repo,
        ):
            upload = SimpleUploadedFile("demo.mp4", b"fake video", content_type="video/mp4")
            request = self.factory.post(
                "/platform/docs/videos",
                {"file": upload},
                format="multipart",
            )
            request.tenant = self.tenant
            force_authenticate(request, user=self.user)
            view = PlatformDocsVideoUploadView.as_view()

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

    def test_missing_config_returns_503(self):
        response = self._post_upload(token="", repo="")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["message"], "not_configured")

    @patch("app_product_docs.views.GitHubVideoClient")
    def test_upload_failure_marks_doc_video_failed(self, mock_client_cls):
        client = MagicMock()
        client.upload_asset.side_effect = GitHubVideoUploadError("GitHub rejected upload")
        mock_client_cls.return_value = client

        response = self._post_upload()

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.data["message"], "upload_failed")
        with schema_context(get_public_schema_name()):
            video = DocVideo.objects.latest("id")
            self.assertEqual(video.status, DocVideoStatus.FAILED)
            self.assertIn("GitHub rejected upload", video.error_message)


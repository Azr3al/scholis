import unittest

from cryptography.fernet import Fernet
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import PlatformOpsSettings
from app_product_docs.github_video_settings import (
    resolve_github_video_release_tag,
    resolve_github_video_repo,
    resolve_github_video_token,
)


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


_TEST_FERNET_KEY = Fernet.generate_key().decode()


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(
    PLATFORM_SECRETS_ENCRYPTION_KEY=_TEST_FERNET_KEY,
    GITHUB_DOCS_VIDEO_TOKEN="ghp_env_token",
    GITHUB_DOCS_VIDEO_REPO="owner/env-repo",
    GITHUB_DOCS_VIDEO_RELEASE_TAG="env-tag",
)
class GitHubVideoSettingsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            obj = PlatformOpsSettings.get_singleton()
            obj.github_docs_video_token_ct = ""
            obj.github_docs_video_repo = ""
            obj.github_docs_video_release_tag = "videos"
            obj.github_docs_video_settings_updated_at = None
            obj.save()

    def test_env_fallback_when_db_empty(self):
        self.assertEqual(resolve_github_video_token(), "ghp_env_token")
        self.assertEqual(resolve_github_video_repo(), "owner/env-repo")
        self.assertEqual(resolve_github_video_release_tag(), "videos")

    def test_db_values_override_env(self):
        with schema_context(get_public_schema_name()):
            obj = PlatformOpsSettings.get_singleton()
            obj.set_github_docs_video_token("ghp_db_token")
            obj.github_docs_video_repo = "owner/db-repo"
            obj.github_docs_video_release_tag = "db-tag"
            obj.save()

        self.assertEqual(resolve_github_video_token(), "ghp_db_token")
        self.assertEqual(resolve_github_video_repo(), "owner/db-repo")
        self.assertEqual(resolve_github_video_release_tag(), "db-tag")

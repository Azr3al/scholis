from unittest.mock import MagicMock, patch

from django.core.cache import cache
from django.test import TestCase

from app_organization.serializers import (
    OrganizationAISettingsSerializer,
    OrganizationSerializer,
)


class OrganizationCacheInvalidationTests(TestCase):
    def setUp(self):
        cache.clear()

    @patch("utilitas.serializers.BaseModelSerializer.update")
    @patch("app_ai.prompt_cache.bump_org_prompt_cache_version")
    def test_update_name_calls_invalidate(self, mock_invalidate, mock_super_update):
        org = MagicMock(schema_name="xschool")
        mock_super_update.return_value = org
        serializer = OrganizationSerializer()
        serializer.update(org, {"name": "After"})
        mock_invalidate.assert_called_once_with(org)

    @patch("utilitas.serializers.BaseModelSerializer.update")
    @patch("app_ai.prompt_cache.bump_org_prompt_cache_version")
    def test_update_unrelated_field_does_not_invalidate(
        self, mock_invalidate, mock_super_update
    ):
        org = MagicMock(schema_name="xschool")
        mock_super_update.return_value = org
        serializer = OrganizationSerializer()
        serializer.update(org, {"timezone": "Asia/Yangon"})
        mock_invalidate.assert_not_called()

    @patch("utilitas.serializers.BaseModelSerializer.update")
    @patch("app_ai.prompt_cache.bump_org_prompt_cache_version")
    def test_ai_settings_update_calls_invalidate(self, mock_invalidate, mock_super_update):
        org = MagicMock(schema_name="xschool")
        mock_super_update.return_value = org
        serializer = OrganizationAISettingsSerializer()
        serializer.update(org, {"ai_school_context": "Updated context"})
        mock_invalidate.assert_called_once_with(org)

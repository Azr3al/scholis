"""Platform docs admin API: RBAC only — no admin-tenant gate."""

import unittest
from unittest.mock import MagicMock, patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_product_docs.models import DocAudience, DocCategory
from app_product_docs.views import PlatformDocsCategoryDetailView

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class PlatformDocsNonAdminTenantAccessTests(TestCase):
    """docs.manage on a non-admin tenant is enough; platform admin tenant not required."""

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        with schema_context(get_public_schema_name()):
            cls.category = DocCategory.objects.create(
                slug="access-test",
                title="Access Test",
                sort_order=0,
                default_audience=DocAudience.ALL,
            )

    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = MagicMock(is_authenticated=True)
        self.tenant = MagicMock(is_admin=False)

    def _as_docs_manager(self, request):
        request.tenant = self.tenant
        force_authenticate(request, user=self.user)
        return patch(
            "app_rbac.views.effective_permissions",
            return_value=frozenset({"docs.manage", "docs.view"}),
        )

    def test_patch_category_on_non_admin_tenant(self):
        request = self.factory.patch(
            f"/platform/docs/categories/{self.category.pk}",
            {"title": "Access Test Updated"},
            format="json",
        )
        with self._as_docs_manager(request):
            response = PlatformDocsCategoryDetailView.as_view()(
                request, pk=self.category.pk
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["data"]["title"], "Access Test Updated")
        with schema_context(get_public_schema_name()):
            self.category.refresh_from_db()
            self.assertEqual(self.category.title, "Access Test Updated")

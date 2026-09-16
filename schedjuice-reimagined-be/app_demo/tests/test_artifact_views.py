from pathlib import Path
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from app_demo.tenant_access import brief_slug_from_schema
from app_demo.views import (
    DemoArtifactBriefDetailView,
    DemoArtifactHubView,
    DemoGuideView,
)

class BriefSlugFromSchemaTests(SimpleTestCase):
    def test_derives_slug_from_xdemo_schema(self):
        self.assertEqual(brief_slug_from_schema("xdemo_yangon_montessori"), "yangon-montessori")
        self.assertEqual(brief_slug_from_schema("xdemo_sunrise"), "sunrise")

    def test_non_demo_schema_returns_none(self):
        self.assertIsNone(brief_slug_from_schema("tenant_acme"))
        self.assertIsNone(brief_slug_from_schema("public"))

class DemoArtifactViewsTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = MagicMock(is_authenticated=True, roles=["superadmin"])
        self.root = Path(__file__).resolve().parents[2] / "demo-artifacts"

    def _get(self, view_cls, path, **kwargs):
        request = self.factory.get(path)
        force_authenticate(request, user=self.user)
        view = view_cls.as_view()
        with patch("app_demo.views.ARTIFACTS_ROOT", self.root):
            with patch(
                "app_rbac.views.effective_permissions",
                return_value=frozenset({"debug.access"}),
            ):
                return view(request, **kwargs)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_hub_requires_debug_access(self):
        request = self.factory.get("/demo-artifacts/")
        force_authenticate(request, user=self.user)
        view = DemoArtifactHubView.as_view()
        with patch("app_demo.views.ARTIFACTS_ROOT", self.root):
            with patch("app_rbac.views.effective_permissions", return_value=frozenset()):
                response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_brief_not_found(self):
        response = self._get(
            DemoArtifactBriefDetailView,
            "/demo-artifacts/briefs/does-not-exist/",
            slug="does-not-exist",
        )
        self.assertEqual(response.status_code, 404)

class DemoGuideViewTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.root = Path(__file__).resolve().parents[2] / "demo-artifacts"
        self.demo_admin = MagicMock(is_authenticated=True, roles=["admin"])
        self.regular_admin = MagicMock(is_authenticated=True, roles=["admin"])

    def _get_guide(self, user, *, schema_name="xdemo_sunrise", is_demo=True):
        request = self.factory.get("/demo-artifacts/guide")
        force_authenticate(request, user=user)
        view = DemoGuideView.as_view()
        with patch("app_demo.views.ARTIFACTS_ROOT", self.root):
            with patch("app_demo.views.connection") as mock_conn:
                mock_conn.schema_name = schema_name
                with patch(
                    "app_demo.permissions.effective_permissions",
                    return_value=frozenset(),
                ):
                    with patch(
                        "app_demo.permissions.is_demo_tenant_schema",
                        return_value=is_demo,
                    ):
                        return view(request)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_guide_denies_non_demo_tenant_admin(self):
        response = self._get_guide(
            self.regular_admin,
            schema_name="tenant_acme",
            is_demo=False,
        )
        self.assertEqual(response.status_code, 403)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_guide_denies_demo_admin_on_catalog_hub(self):
        request = self.factory.get("/demo-artifacts/")
        force_authenticate(request, user=self.demo_admin)
        view = DemoArtifactHubView.as_view()
        with patch("app_demo.views.ARTIFACTS_ROOT", self.root):
            with patch(
                "app_rbac.views.effective_permissions",
                return_value=frozenset(),
            ):
                response = view(request)
        self.assertEqual(response.status_code, 403)


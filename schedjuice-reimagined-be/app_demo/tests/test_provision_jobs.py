import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from django.db import connection
from django.test import SimpleTestCase, TransactionTestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from app_demo.demo_accounts import expected_demo_accounts
from app_demo.models import DemoProvisionJob
from app_demo.provision_jobs import (
    build_provision_status,
    run_demo_provision_job,
)
from app_demo.views import (
    DemoProvisionJobDetailView,
    DemoProvisionStartView,
)
from app_organization.models import Organization

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

class ExpectedDemoAccountsTests(SimpleTestCase):
    def test_returns_four_standard_accounts(self):
        out = expected_demo_accounts("yangon-montessori-demo.thiha.net")
        self.assertEqual(out["password"], "Demo12345!")
        self.assertEqual(len(out["accounts"]), 4)
        self.assertEqual(
            out["accounts"][0]["email"],
            "demo-admin@yangon-montessori-demo.thiha.net",
        )
        roles = {account["role"] for account in out["accounts"]}
        self.assertEqual(roles, {"admin", "finance", "teacher", "student"})
        self.assertEqual(
            out["dev_tenant_domain_hint"],
            "DEV_TENANT_DOMAIN=yangon-montessori-demo.thiha.net",
        )

class BuildProvisionStatusTests(SimpleTestCase):
    @patch("app_demo.provision_jobs.catalog.read_generated_script")
    @patch("app_demo.provision_jobs._active_job_for_slug")
    @patch("app_demo.provision_jobs.Organization.objects.filter")
    @patch("app_demo.provision_jobs.resolve_demo_config")
    @patch("app_demo.provision_jobs.load_blueprint")
    @patch("app_demo.provision_jobs.load_brief")
    @patch("app_demo.provision_jobs.catalog.find_brief_path_by_slug")
    def test_includes_credentials_when_tenant_exists(
        self,
        mock_find_path,
        mock_load_brief,
        mock_load_blueprint,
        mock_resolve,
        mock_org_filter,
        mock_active_job,
        mock_read_script,
    ):
        mock_find_path.return_value = Path("briefs/yangon-montessori.yaml")
        mock_load_brief.return_value = {"niche": "montessori"}
        mock_load_blueprint.return_value = {}
        mock_resolve.return_value = MagicMock(
            domain_url="yangon-montessori-demo.thiha.net",
            schema_name="xdemo_yangon_montessori",
        )
        mock_org_filter.return_value.first.return_value = MagicMock(is_demo=True)
        mock_active_job.return_value = None
        mock_read_script.return_value = {"available": False}

        status = build_provision_status(slug="yangon-montessori", debug=True)

        self.assertTrue(status["tenant_exists"])
        self.assertIsNotNone(status["credentials"])
        self.assertEqual(status["credentials"]["password"], "Demo12345!")
        self.assertEqual(len(status["credentials"]["accounts"]), 4)

    @patch("app_demo.provision_jobs.catalog.read_generated_script")
    @patch("app_demo.provision_jobs._active_job_for_slug")
    @patch("app_demo.provision_jobs.Organization.objects.filter")
    @patch("app_demo.provision_jobs.resolve_demo_config")
    @patch("app_demo.provision_jobs.load_blueprint")
    @patch("app_demo.provision_jobs.load_brief")
    @patch("app_demo.provision_jobs.catalog.find_brief_path_by_slug")
    def test_credentials_null_when_tenant_missing(
        self,
        mock_find_path,
        mock_load_brief,
        mock_load_blueprint,
        mock_resolve,
        mock_org_filter,
        mock_active_job,
        mock_read_script,
    ):
        mock_find_path.return_value = Path("briefs/sunrise.yaml")
        mock_load_brief.return_value = {"niche": "tutoring-center"}
        mock_load_blueprint.return_value = {}
        mock_resolve.return_value = MagicMock(
            domain_url="sunrise-demo.thiha.net",
            schema_name="xdemo_sunrise",
        )
        mock_org_filter.return_value.first.return_value = None
        mock_active_job.return_value = None
        mock_read_script.return_value = {"available": False}

        status = build_provision_status(slug="sunrise", debug=True)

        self.assertFalse(status["tenant_exists"])
        self.assertIsNone(status["credentials"])

class DemoProvisionApiTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = MagicMock(is_authenticated=True, roles=["superadmin"], email="admin@test")
        self.tenant = MagicMock(is_admin=True)
        self.root = Path(__file__).resolve().parents[2] / "demo-artifacts"
        self._patches = []

    def tearDown(self):
        for p in self._patches:
            p.stop()

    def _patch(self, target, **kwargs):
        p = patch(target, **kwargs)
        self._patches.append(p)
        return p.start()

    def _request(self, method, path, view_cls, data=None, **kwargs):
        if method == "GET":
            request = self.factory.get(path)
        else:
            request = self.factory.post(path, data or {}, format="json")
        force_authenticate(request, user=self.user)
        request.tenant = self.tenant
        self._patch("app_rbac.views.effective_permissions", return_value=frozenset({"debug.access"}))
        self._patch("app_demo.permissions.roles_for_user", return_value=["superadmin"])
        view = view_cls.as_view()
        return view(request, **kwargs)

    @override_settings(DEBUG=False)
    def test_post_blocked_when_not_debug(self):
        response = self._request(
            "POST",
            "/demo-artifacts/briefs/sunrise/provision",
            DemoProvisionStartView,
            {"reset": False},
            slug="sunrise",
        )
        self.assertEqual(response.status_code, 403)

    @override_settings(DEBUG=True)
    @patch("app_demo.views.start_demo_provision_job")
    @patch("app_auth.models.User.get_user_from_request")
    def test_post_starts_job(self, mock_actor, mock_start):
        mock_actor.return_value = MagicMock(id=1, email="admin@test")
        mock_start.return_value = DemoProvisionJob(
            id=1,
            brief_slug="sunrise",
            blueprint_id="tutoring-center",
            reset=False,
            status=DemoProvisionJob.Status.PENDING,
        )
        response = self._request(
            "POST",
            "/demo-artifacts/briefs/sunrise/provision",
            DemoProvisionStartView,
            {"reset": False},
            slug="sunrise",
        )
        self.assertEqual(response.status_code, 201)
        mock_start.assert_called_once()

    @override_settings(DEBUG=True)
    def test_job_detail_not_found(self):
        response = self._request(
            "GET",
            "/demo-artifacts/provision-jobs/999999",
            DemoProvisionJobDetailView,
            job_id=999999,
        )
        self.assertEqual(response.status_code, 404)

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class DemoProvisionWorkerIntegrationTests(TransactionTestCase):
    def test_worker_provisions_yangon_montessori(self):
        job = DemoProvisionJob.objects.create(
            brief_slug="yangon-montessori",
            blueprint_id="montessori",
            brief_relative_path="briefs/yangon-montessori.yaml",
            reset=True,
            status=DemoProvisionJob.Status.PENDING,
        )
        run_demo_provision_job(job.id)

        job.refresh_from_db()
        self.assertEqual(job.status, DemoProvisionJob.Status.SUCCEEDED)
        self.assertIsNotNone(job.result)
        self.assertEqual(
            job.result["schema_name"],
            "xdemo_yangon_montessori",
        )
        org = Organization.objects.get(schema_name="xdemo_yangon_montessori")
        self.assertTrue(org.is_demo)

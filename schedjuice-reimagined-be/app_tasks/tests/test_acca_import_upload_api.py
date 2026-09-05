"""Tests for ACCA CSV multipart debug endpoint."""

from unittest.mock import MagicMock, patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from app_tasks.acca_import_upload_view import ImportAccaStudentsUploadView

class ImportAccaStudentsUploadApiTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.view = ImportAccaStudentsUploadView.as_view()
        self.user = MagicMock(is_authenticated=True, roles=["teacher"])

    def _post(self, path, data):
        request = self.factory.post(path, data, format="multipart")
        force_authenticate(request, user=self.user)
        return request

    @override_settings(RBAC_ENFORCE="enforce")
    def test_returns_403_without_debug_access(self):
        csv_file = SimpleUploadedFile(
            "rows.csv",
            b"Email,h\nx@test.invalid,h\n",
            content_type="text/csv",
        )
        request = self._post(
            "/management/import-acca-students",
            {
                "schema_name": "x_schema",
                "dry_run": "true",
                "file": csv_file,
            },
        )

        with patch(
            "app_rbac.views.effective_permissions",
            return_value=frozenset(),
        ):
            response = self.view(request)

        self.assertEqual(response.status_code, 403)
        self.assertTrue(response.data["isError"])

    def test_returns_400_when_missing_schema(self):
        csv_file = SimpleUploadedFile(
            "rows.csv", b"h\n", content_type="text/csv"
        )
        request = self._post(
            "/management/import-acca-students",
            {"dry_run": "true", "file": csv_file},
        )

        with patch(
            "app_rbac.views.effective_permissions",
            return_value=frozenset({"debug.access"}),
        ):
            response = self.view(request)

        self.assertEqual(response.status_code, 400)
        details = response.data.get("details", "")
        self.assertIn("schema_name", details.lower())

    def test_returns_400_when_missing_file(self):
        request = self._post(
            "/management/import-acca-students",
            {"schema_name": "demo", "dry_run": "true"},
        )

        with patch(
            "app_rbac.views.effective_permissions",
            return_value=frozenset({"debug.access"}),
        ):
            response = self.view(request)

        self.assertEqual(response.status_code, 400)

    def test_returns_400_when_commit_without_confirm_write(self):
        csv_file = SimpleUploadedFile(
            "rows.csv", b"h\n", content_type="text/csv"
        )
        request = self._post(
            "/management/import-acca-students",
            {
                "schema_name": "demo_schema",
                "dry_run": "false",
                "file": csv_file,
            },
        )

        with patch(
            "app_rbac.views.effective_permissions",
            return_value=frozenset({"debug.access"}),
        ):
            response = self.view(request)

        self.assertEqual(response.status_code, 400)
        self.assertIn("confirm_write", response.data.get("details", ""))

    @patch("app_tasks.acca_import_upload_view.Organization.objects.filter")
    def test_returns_400_unknown_tenant(self, mock_org_filter):
        mock_org_filter.return_value.exists.return_value = False

        csv_file = SimpleUploadedFile(
            "rows.csv",
            b"h\n",
            content_type="text/csv",
        )
        request = self._post(
            "/management/import-acca-students",
            {
                "schema_name": "no_such_tenant",
                "dry_run": "true",
                "file": csv_file,
            },
        )

        with patch(
            "app_rbac.views.effective_permissions",
            return_value=frozenset({"debug.access"}),
        ):
            response = self.view(request)

        self.assertEqual(response.status_code, 400)
        self.assertIn("schema_name", response.data.get("details", ""))

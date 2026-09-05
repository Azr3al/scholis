"""Multipart upload wrapper for ACCA spreadsheet management command."""

from __future__ import annotations

import io
import os
import tempfile

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.request import Request
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization
from app_rbac.views import RBACView


class ImportAccaStudentsUploadView(RBACView):
    """POST /management/import-acca-students — multipart ACCA CSV import."""

    http_method_names = ["post"]
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "debug.access"}
    parser_classes = [MultiPartParser, FormParser]

    MAX_BYTES = getattr(settings, "ACCA_IMPORT_UPLOAD_MAX_BYTES", 5 * 1024 * 1024)

    def post(self, request: Request):
        schema_name = (request.data.get("schema_name") or "").strip()
        if not schema_name:
            return self.send_response(
                True,
                "bad_request",
                {"details": "schema_name is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        upload = request.FILES.get("file")
        if not upload:
            return self.send_response(
                True,
                "bad_request",
                {"details": "CSV file is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if getattr(upload, "size", 0) > self.MAX_BYTES:
            return self.send_response(
                True,
                "bad_request",
                {
                    "details": (
                        f"File too large (max {self.MAX_BYTES // (1024 * 1024)} MiB)"
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_name = (getattr(upload, "name", "") or "").lower()
        if raw_name and not raw_name.endswith(".csv"):
            return self.send_response(
                True,
                "bad_request",
                {"details": "Upload must be a .csv file"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        dry_raw = str(request.data.get("dry_run", "true")).lower().strip()
        dry_run = dry_raw in ("1", "true", "yes", "on")

        if not dry_run:
            confirm = str(request.data.get("confirm_write", "")).lower().strip()
            if confirm not in ("1", "true", "yes", "on"):
                return self.send_response(
                    True,
                    "bad_request",
                    {
                        "details": (
                            "confirm_write must be true when dry_run is false "
                            "(check confirmation in UI)."
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        category_raw = (request.data.get("category_name") or "").strip()

        with schema_context(get_public_schema_name()):
            if not Organization.objects.filter(schema_name=schema_name).exists():
                return self.send_response(
                    True,
                    "bad_request",
                    {"details": f"No organization for schema_name={schema_name!r}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        tmp_path = None
        try:
            fd, tmp_path = tempfile.mkstemp(suffix=".csv", prefix="acca-import-")
            os.close(fd)

            with open(tmp_path, "wb") as dest:
                for chunk in upload.chunks():
                    dest.write(chunk)

            out = io.StringIO()
            err = io.StringIO()
            kwargs: dict = {
                "schema_name": schema_name,
                "csv": tmp_path,
                "stdout": out,
                "stderr": err,
            }
            if dry_run:
                kwargs["dry_run"] = True
            if category_raw:
                kwargs["category_name"] = category_raw

            try:
                call_command("import_acca_students", **kwargs)
            except CommandError as exc:
                return self.send_response(
                    True,
                    "bad_request",
                    {
                        "details": str(exc),
                        "output": out.getvalue(),
                        "stderr": err.getvalue(),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            return self.send_response(
                False,
                "success",
                {
                    "output": out.getvalue(),
                    "stderr": err.getvalue(),
                },
                status=status.HTTP_200_OK,
            )
        except Exception as exc:  # noqa: BLE001 — mirror ManagementCommandView
            return self.send_response(
                True,
                "command_failed",
                {"details": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        finally:
            if tmp_path and os.path.isfile(tmp_path):
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.db import connection
from rest_framework import status
from rest_framework.request import Request
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication

from app_auth.models import User
from app_demo import catalog
from app_demo.artifacts import (
    load_blueprint,
    load_brief,
    load_scenario_pack,
    load_use_case,
)
from app_demo.config import resolve_demo_config
from app_demo.models import DemoProvisionJob
from app_demo.paths import ARTIFACTS_ROOT
from app_demo.permissions import DemoGuidePermission, RequiresDemoProvisionAccess
from app_demo.provision_jobs import (
    build_provision_status,
    serialize_provision_job,
    start_demo_provision_job,
)
from app_demo.serializers import resolved_config_to_dict
from app_demo.tenant_access import brief_slug_from_schema
from app_rbac.views import RBACPermission, RBACView


class _DemoArtifactBaseView(RBACView):
    http_method_names = ["get"]
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "debug.access"}


def _load_or_error(relative: str) -> tuple[dict[str, str] | None, str | None]:
    try:
        return catalog.read_source(relative, root=ARTIFACTS_ROOT), None
    except (ValueError, OSError) as exc:
        return None, str(exc)


def _validation_error_payload(
    *,
    artifact_type: str,
    artifact_id: str,
    relative_path: str,
    exc: Exception,
    source: dict[str, str],
) -> dict[str, Any]:
    return {
        "artifact_type": artifact_type,
        "id": artifact_id,
        "relative_path": relative_path,
        "valid": False,
        "validation_error": str(exc),
        "summary": {},
        "source": source,
    }


class DemoArtifactHubView(_DemoArtifactBaseView):
    def get(self, request: Request):
        return self.ok(catalog.hub_index(root=ARTIFACTS_ROOT))


class DemoArtifactBlueprintListView(_DemoArtifactBaseView):
    def get(self, request: Request):
        items = []
        for blueprint_id in catalog.list_blueprint_ids(root=ARTIFACTS_ROOT):
            try:
                data = load_blueprint(blueprint_id)
                items.append(
                    {
                        "id": blueprint_id,
                        "label": blueprint_id.replace("-", " ").title(),
                        "use_case_count": len(data.get("use_case_order", [])),
                        "default_pack_count": len(data.get("default_scenario_packs", [])),
                        "valid": True,
                        "validation_error": None,
                    }
                )
            except Exception as exc:  # noqa: BLE001
                items.append(
                    {
                        "id": blueprint_id,
                        "label": blueprint_id,
                        "valid": False,
                        "validation_error": str(exc),
                    }
                )
        return self.ok(items)


class DemoArtifactBlueprintDetailView(_DemoArtifactBaseView):
    def get(self, request: Request, blueprint_id: str):
        relative = f"blueprints/{blueprint_id}.yaml"
        source, source_err = _load_or_error(relative)
        if source is None:
            return self.send_response(
                True,
                "not_found",
                {"details": source_err or "Blueprint not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            data = load_blueprint(blueprint_id)
            summary = {
                "id": data["id"],
                "terminology": data.get("terminology", {}),
                "org_toggles": data.get("org_toggles", {}),
                "use_case_order": data.get("use_case_order", []),
                "default_scenario_packs": data.get("default_scenario_packs", []),
                "academic_structure": data.get("academic_structure", {}),
            }
            return self.ok(
                {
                    "artifact_type": "blueprint",
                    "id": blueprint_id,
                    "relative_path": relative,
                    "valid": True,
                    "validation_error": None,
                    "summary": summary,
                    "source": source,
                }
            )
        except Exception as exc:  # noqa: BLE001
            return self.send_response(
                True,
                "validation_error",
                {
                    "data": _validation_error_payload(
                        artifact_type="blueprint",
                        artifact_id=blueprint_id,
                        relative_path=relative,
                        exc=exc,
                        source=source,
                    )
                },
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )


class DemoArtifactBriefListView(_DemoArtifactBaseView):
    def get(self, request: Request):
        items = []
        for entry in catalog.list_brief_entries(root=ARTIFACTS_ROOT):
            slug = entry["id"]
            items.append(
                {
                    **entry,
                    "has_generated_script": catalog.read_generated_script(
                        slug, root=ARTIFACTS_ROOT
                    ).get("available", False),
                }
            )
        return self.ok(items)


def _build_brief_detail(slug: str) -> tuple[dict[str, Any] | None, int, dict[str, Any] | None]:
    path = catalog.find_brief_path_by_slug(slug, root=ARTIFACTS_ROOT)
    if path is None:
        return None, status.HTTP_404_NOT_FOUND, {"details": f"Brief not found: {slug}"}

    relative = f"briefs/{path.name}"
    source = catalog.read_source(relative, root=ARTIFACTS_ROOT)
    try:
        brief = load_brief(path)
        blueprint = load_blueprint(brief["niche"])
        resolved = resolve_demo_config(blueprint, brief)
        return (
            {
                "artifact_type": "brief",
                "id": slug,
                "relative_path": relative,
                "valid": True,
                "validation_error": None,
                "summary": {
                    "school_name": brief["school_name"],
                    "slug": brief["slug"],
                    "niche": brief["niche"],
                    "demo_date": brief["demo_date"],
                    "timezone": brief.get("timezone"),
                    "pain_points": brief.get("pain_points", []),
                    "import": brief.get("import"),
                },
                "resolved": resolved_config_to_dict(resolved),
                "generated_script": catalog.read_generated_script(
                    slug, root=ARTIFACTS_ROOT
                ),
                "source": source,
            },
            status.HTTP_200_OK,
            None,
        )
    except Exception as exc:  # noqa: BLE001
        return (
            {
                "data": _validation_error_payload(
                    artifact_type="brief",
                    artifact_id=slug,
                    relative_path=relative,
                    exc=exc,
                    source=source,
                )
            },
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            None,
        )


class DemoArtifactBriefDetailView(_DemoArtifactBaseView):
    def get(self, request: Request, slug: str):
        payload, code, error = _build_brief_detail(slug)
        if payload is None:
            return self.send_response(True, "not_found", error, status=code)
        if code == status.HTTP_422_UNPROCESSABLE_ENTITY:
            return self.send_response(True, "validation_error", payload, status=code)
        return self.ok(payload)


class DemoGuideView(RBACView):
    http_method_names = ["get"]
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [DemoGuidePermission]
    rbac_decision = "authenticated_only"

    def get(self, request: Request):
        slug = brief_slug_from_schema(connection.schema_name)
        if not slug:
            return self.send_response(
                True,
                "not_found",
                {"details": "No demo guide for this tenant"},
                status=status.HTTP_404_NOT_FOUND,
            )

        payload, code, error = _build_brief_detail(slug)
        if payload is None:
            return self.send_response(True, "not_found", error, status=code)
        if code == status.HTTP_422_UNPROCESSABLE_ENTITY:
            return self.send_response(True, "validation_error", payload, status=code)
        return self.ok(payload)


class DemoArtifactScenarioPackListView(_DemoArtifactBaseView):
    def get(self, request: Request):
        items = []
        for pack_id in catalog.list_scenario_pack_ids(root=ARTIFACTS_ROOT):
            try:
                data = load_scenario_pack(pack_id)
                desc = (data.get("description") or "")[:120]
                items.append(
                    {
                        "id": pack_id,
                        "label": data.get("label") or pack_id,
                        "description": desc,
                        "valid": True,
                        "validation_error": None,
                    }
                )
            except Exception as exc:  # noqa: BLE001
                items.append(
                    {
                        "id": pack_id,
                        "label": pack_id,
                        "valid": False,
                        "validation_error": str(exc),
                    }
                )
        return self.ok(items)


class DemoArtifactScenarioPackDetailView(_DemoArtifactBaseView):
    def get(self, request: Request, pack_id: str):
        relative = f"scenario-packs/{pack_id}.yaml"
        source, source_err = _load_or_error(relative)
        if source is None:
            return self.send_response(
                True,
                "not_found",
                {"details": source_err or "Scenario pack not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            data = load_scenario_pack(pack_id)
            return self.ok(
                {
                    "artifact_type": "scenario_pack",
                    "id": pack_id,
                    "relative_path": relative,
                    "valid": True,
                    "validation_error": None,
                    "summary": data,
                    "source": source,
                }
            )
        except Exception as exc:  # noqa: BLE001
            return self.send_response(
                True,
                "validation_error",
                {
                    "data": _validation_error_payload(
                        artifact_type="scenario_pack",
                        artifact_id=pack_id,
                        relative_path=relative,
                        exc=exc,
                        source=source,
                    )
                },
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )


class DemoArtifactUseCaseListView(_DemoArtifactBaseView):
    def get(self, request: Request):
        items = []
        for use_case_id in catalog.list_use_case_ids(root=ARTIFACTS_ROOT):
            try:
                data = load_use_case(use_case_id)
                items.append(
                    {
                        "id": use_case_id,
                        "label": data.get("label") or use_case_id,
                        "demo_stop_count": len(data.get("demo_stops", [])),
                        "valid": True,
                        "validation_error": None,
                    }
                )
            except Exception as exc:  # noqa: BLE001
                items.append(
                    {
                        "id": use_case_id,
                        "label": use_case_id,
                        "valid": False,
                        "validation_error": str(exc),
                    }
                )
        return self.ok(items)


class DemoArtifactUseCaseDetailView(_DemoArtifactBaseView):
    def get(self, request: Request, use_case_id: str):
        relative = f"use-cases/{use_case_id}.yaml"
        source, source_err = _load_or_error(relative)
        if source is None:
            return self.send_response(
                True,
                "not_found",
                {"details": source_err or "Use-case not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            data = load_use_case(use_case_id)
            return self.ok(
                {
                    "artifact_type": "use_case",
                    "id": use_case_id,
                    "relative_path": relative,
                    "valid": True,
                    "validation_error": None,
                    "summary": data,
                    "source": source,
                }
            )
        except Exception as exc:  # noqa: BLE001
            return self.send_response(
                True,
                "validation_error",
                {
                    "data": _validation_error_payload(
                        artifact_type="use_case",
                        artifact_id=use_case_id,
                        relative_path=relative,
                        exc=exc,
                        source=source,
                    )
                },
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )


class DemoArtifactImportListView(_DemoArtifactBaseView):
    def get(self, request: Request):
        items = []
        for filename in catalog.list_import_filenames(root=ARTIFACTS_ROOT):
            items.append(
                {
                    "id": filename,
                    "filename": filename,
                    "linked_briefs": catalog.linked_briefs_for_import(
                        filename, root=ARTIFACTS_ROOT
                    ),
                    "valid": catalog.safe_artifact_path(
                        f"imports/{filename}", root=ARTIFACTS_ROOT
                    ).is_file(),
                }
            )
        return self.ok(items)


class DemoArtifactImportDetailView(_DemoArtifactBaseView):
    def get(self, request: Request, filename: str):
        try:
            catalog.safe_artifact_path(f"imports/{filename}", root=ARTIFACTS_ROOT)
        except ValueError as exc:
            return self.send_response(
                True,
                "bad_request",
                {"details": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        relative = f"imports/{filename}"
        path = ARTIFACTS_ROOT / relative
        if not path.is_file():
            return self.send_response(
                True,
                "not_found",
                {"details": f"Import not found: {filename}"},
                status=status.HTTP_404_NOT_FOUND,
            )
        mapping_path = path.with_suffix(".mapping.yaml")
        mapping_source = None
        if mapping_path.is_file():
            mapping_source = catalog.read_source(
                f"imports/{mapping_path.name}", root=ARTIFACTS_ROOT
            )
        preview = None
        if filename.lower().endswith(".csv"):
            preview = catalog.csv_preview(filename, root=ARTIFACTS_ROOT)
        return self.ok(
            {
                "artifact_type": "import",
                "id": filename,
                "relative_path": relative,
                "valid": True,
                "summary": {
                    "filename": filename,
                    "linked_briefs": catalog.linked_briefs_for_import(
                        filename, root=ARTIFACTS_ROOT
                    ),
                    "has_mapping": mapping_source is not None,
                    "mapping_path": f"imports/{mapping_path.name}"
                    if mapping_source
                    else None,
                },
                "csv_preview": preview,
                "mapping_source": mapping_source,
                "source": catalog.read_source(relative, root=ARTIFACTS_ROOT)
                if filename.lower().endswith(".csv")
                else None,
            }
        )


class _DemoProvisionBaseView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresDemoProvisionAccess]


class DemoProvisionStatusView(_DemoProvisionBaseView):
    http_method_names = ["get"]
    required_permissions = {"GET": "debug.access"}

    def get(self, request: Request, slug: str):
        try:
            payload = build_provision_status(slug=slug, debug=settings.DEBUG)
        except LookupError:
            return self.send_response(
                True,
                "not_found",
                {"details": f"Brief not found: {slug}"},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as exc:  # noqa: BLE001
            return self.send_response(
                True,
                "validation_error",
                {"details": str(exc)},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        return self.ok(payload)


class DemoProvisionStartView(_DemoProvisionBaseView):
    http_method_names = ["post"]
    required_permissions = {"POST": "debug.access"}

    def post(self, request: Request, slug: str):
        reset = bool((request.data or {}).get("reset", False))
        actor = User.get_user_from_request(request)
        try:
            job = start_demo_provision_job(slug=slug, reset=reset, created_by=actor)
        except LookupError:
            return self.send_response(
                True,
                "not_found",
                {"details": f"Brief not found: {slug}"},
                status=status.HTTP_404_NOT_FOUND,
            )
        except RuntimeError as exc:
            code = str(exc)
            if code == "already_running":
                return self.send_response(
                    True,
                    "already_running",
                    {"details": "A provision job is already running for this brief."},
                    status=status.HTTP_409_CONFLICT,
                )
            if code == "tenant_exists":
                return self.send_response(
                    True,
                    "tenant_exists",
                    {"details": "Demo tenant already exists. Use reset to rebuild."},
                    status=status.HTTP_409_CONFLICT,
                )
            raise
        except Exception as exc:  # noqa: BLE001
            return self.send_response(
                True,
                "validation_error",
                {"details": str(exc)},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        return self.created(serialize_provision_job(job, include_result=False))


class DemoProvisionJobDetailView(_DemoProvisionBaseView):
    http_method_names = ["get"]
    required_permissions = {"GET": "debug.access"}

    def get(self, request: Request, job_id: int):
        job = DemoProvisionJob.objects.filter(id=job_id).first()
        if job is None:
            return self.send_response(
                True,
                "not_found",
                {"details": f"Job not found: {job_id}"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return self.ok(serialize_provision_job(job))

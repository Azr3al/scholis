from __future__ import annotations

import logging
from typing import Any

from django.db import connection
from django.utils import timezone
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_demo import catalog
from app_demo.artifacts import load_blueprint, load_brief
from app_demo.config import resolve_demo_config
from app_demo.demo_accounts import expected_demo_accounts
from app_demo.models import DemoProvisionJob
from app_demo.paths import ARTIFACTS_ROOT
from app_demo.provision import provision_demo
from app_organization.models import Organization
from utilitas.async_tasks import django_q_task

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = {
    DemoProvisionJob.Status.PENDING,
    DemoProvisionJob.Status.RUNNING,
}


def provision_result_to_dict(raw: dict[str, Any]) -> dict[str, Any]:
    accounts_payload = raw.get("accounts") or {}
    return {
        "school_name": raw["school_name"],
        "domain_url": raw["domain_url"],
        "schema_name": raw["schema_name"],
        "dev_tenant_domain_hint": f"DEV_TENANT_DOMAIN={raw['domain_url']}",
        "password": accounts_payload.get("password"),
        "accounts": list(accounts_payload.get("accounts") or []),
        "scripts": dict(raw.get("scripts") or {}),
    }


def _active_job_for_slug(brief_slug: str) -> DemoProvisionJob | None:
    return (
        DemoProvisionJob.objects.filter(
            brief_slug=brief_slug,
            status__in=ACTIVE_STATUSES,
        )
        .order_by("-id")
        .first()
    )


def build_provision_status(*, slug: str, debug: bool) -> dict[str, Any]:
    path = catalog.find_brief_path_by_slug(slug, root=ARTIFACTS_ROOT)
    if path is None:
        raise LookupError(f"Brief not found: {slug}")

    brief = load_brief(path)
    blueprint = load_blueprint(brief["niche"])
    resolved = resolve_demo_config(blueprint, brief)

    with schema_context(get_public_schema_name()):
        org = Organization.objects.filter(schema_name=resolved.schema_name).first()

    active = _active_job_for_slug(slug)
    script = catalog.read_generated_script(slug, root=ARTIFACTS_ROOT)

    tenant_exists = org is not None
    return {
        "provision_ui_enabled": debug,
        "tenant_exists": tenant_exists,
        "is_demo": bool(org and org.is_demo),
        "domain_url": resolved.domain_url,
        "schema_name": resolved.schema_name,
        "has_generated_script": script.get("available", False),
        "credentials": expected_demo_accounts(resolved.domain_url)
        if tenant_exists
        else None,
        "active_job": serialize_provision_job(active, include_result=False)
        if active
        else None,
    }


def serialize_provision_job(
    job: DemoProvisionJob,
    *,
    include_result: bool = True,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": job.id,
        "brief_slug": job.brief_slug,
        "blueprint_id": job.blueprint_id,
        "reset": job.reset,
        "status": job.status,
        "created_at": job.created_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "error_message": job.error_message,
    }
    if include_result:
        data["result"] = job.result
    return data


def start_demo_provision_job(
    *,
    slug: str,
    reset: bool,
    created_by,
) -> DemoProvisionJob:
    if _active_job_for_slug(slug):
        raise RuntimeError("already_running")

    path = catalog.find_brief_path_by_slug(slug, root=ARTIFACTS_ROOT)
    if path is None:
        raise LookupError(f"Brief not found: {slug}")

    brief = load_brief(path)
    blueprint_id = brief["niche"]
    resolved = resolve_demo_config(load_blueprint(blueprint_id), brief)

    with schema_context(get_public_schema_name()):
        exists = Organization.objects.filter(schema_name=resolved.schema_name).exists()
    if exists and not reset:
        raise RuntimeError("tenant_exists")

    job = DemoProvisionJob.objects.create(
        brief_slug=slug,
        blueprint_id=blueprint_id,
        brief_relative_path=f"briefs/{path.name}",
        reset=reset,
        created_by_id=getattr(created_by, "id", None),
        created_by_email=getattr(created_by, "email", "") or "",
        status=DemoProvisionJob.Status.PENDING,
    )
    run_demo_provision_job.delay(job.id)
    return job


@django_q_task
def run_demo_provision_job(job_id: int) -> None:
    connection.set_schema_to_public()
    job = DemoProvisionJob.objects.filter(id=job_id).first()
    if job is None:
        logger.warning("DemoProvisionJob %s not found", job_id)
        return

    job.status = DemoProvisionJob.Status.RUNNING
    job.started_at = timezone.now()
    job.save(update_fields=["status", "started_at", "updated_at"])

    try:
        raw = provision_demo(
            blueprint_id=job.blueprint_id,
            brief_path=ARTIFACTS_ROOT / job.brief_relative_path,
            reset=job.reset,
        )
        job.result = provision_result_to_dict(raw)
        job.status = DemoProvisionJob.Status.SUCCEEDED
    except Exception as exc:  # noqa: BLE001
        logger.exception("Demo provision job %s failed", job_id)
        job.status = DemoProvisionJob.Status.FAILED
        job.error_message = str(exc)[:1000]
    finally:
        job.finished_at = timezone.now()
        job.save(
            update_fields=[
                "status",
                "result",
                "error_message",
                "finished_at",
                "updated_at",
            ]
        )

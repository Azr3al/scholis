import io
import traceback
from types import SimpleNamespace

from django.core.management import call_command
from django.utils import timezone

from app_utils.ops_discord import notify_discord_ops_embed

ENSURE_PAYMENT_ASSIGNMENTS_COMMAND = "ensure-payment-assignments"


def _tenant_display_name(org) -> str:
    return str(getattr(org, "name", None) or getattr(org, "schema_name", None) or "unknown")


def _format_failure_description(failures: list[tuple[object, str]]) -> str:
    if len(failures) == 1:
        _org, excerpt = failures[0]
        return excerpt

    lines: list[str] = []
    for org, excerpt in sorted(failures, key=lambda item: _tenant_display_name(item[0])):
        lines.append(f"**{_tenant_display_name(org)}** (`{getattr(org, 'schema_name', '')}`):\n{excerpt}")
    return "\n\n".join(lines)


def _notify_cron_command_failed(
    command_name: str,
    failures: list[tuple[object, str]],
) -> None:
    if not failures:
        return
    affected_orgs = [org for org, _excerpt in failures]
    tenant_names = ", ".join(
        _tenant_display_name(org)
        for org in sorted(affected_orgs, key=_tenant_display_name)
    )
    notify_discord_ops_embed(
        "[Schedjuice] Cron command FAILED",
        [
            {
                "name": "Command",
                "value": f"`{command_name}`",
                "inline": True,
            },
            {
                "name": "Affected tenants",
                "value": tenant_names,
                "inline": False,
            },
        ],
        severity="failed",
        tenants=affected_orgs,
        description=_format_failure_description(failures),
    )


def schedule_ensure_payment_assignments():
    """
    Fan-out: enqueue one sync ensure task per Microsoft-enabled tenant.
    Called by django-q Schedule at 00:05 UTC.
    """
    from django_q.tasks import async_task

    from app_organization.models import Organization
    from tenant_schemas.utils import get_public_schema_name, schema_context

    with schema_context(get_public_schema_name()):
        orgs = list(Organization.objects.filter(is_microsoft_on=True))

    for org in orgs:
        schema_name = getattr(org, "schema_name", None)
        if not schema_name:
            continue
        async_task(
            "app_tasks.cron_runner.run_ensure_payment_assignments_sync",
            schema_name,
            task_name=f"ensure-payment-assignments:{schema_name}",
        )


def run_ensure_payment_assignments_sync(schema_name: str):
    """Run ensure-payment-assignments synchronously for one tenant (django-q worker)."""
    from app_tasks.models import CronCommandLog
    from app_organization.models import Organization
    from tenant_schemas.utils import get_public_schema_name, schema_context

    with schema_context(get_public_schema_name()):
        org = Organization.objects.filter(schema_name=schema_name).first()

    with schema_context(schema_name):
        log = CronCommandLog.objects.create(command_name=ENSURE_PAYMENT_ASSIGNMENTS_COMMAND)
        out, err = io.StringIO(), io.StringIO()
        try:
            if org is None:
                raise ValueError(f"Tenant {schema_name!r} not found in public registry")
            if not org.is_microsoft_on:
                raise ValueError(
                    f"Tenant {schema_name!r} has is_microsoft_on=False; skipping"
                )
            call_command(
                ENSURE_PAYMENT_ASSIGNMENTS_COMMAND,
                sync=True,
                stdout=out,
                stderr=err,
            )
            log.status = CronCommandLog.Status.SUCCESS
        except Exception:
            log.status = CronCommandLog.Status.FAILED
            log.error_message = traceback.format_exc()
        finally:
            log.stdout = out.getvalue()
            log.stderr = err.getvalue()
            log.completed_at = timezone.now()
            log.save()
            if log.status == CronCommandLog.Status.FAILED:
                excerpt = (log.error_message or log.stderr or log.stdout or "").strip()
                if len(excerpt) > 1600:
                    excerpt = excerpt[:1600] + "…"
                _notify_cron_command_failed(
                    ENSURE_PAYMENT_ASSIGNMENTS_COMMAND,
                    [(org or SimpleNamespace(name=schema_name, schema_name=schema_name), excerpt)],
                )


def run_cron_command(command_name, *args, **kwargs):
    from app_tasks.models import CronCommandLog
    from app_organization.models import Organization
    from tenant_schemas.utils import get_public_schema_name, schema_context

    with schema_context(get_public_schema_name()):
        orgs = list(Organization.objects.all())

    failures: list[tuple[object, str]] = []

    for org in orgs:
        with schema_context(org.schema_name):
            log = CronCommandLog.objects.create(command_name=command_name)
            out, err = io.StringIO(), io.StringIO()
            try:
                call_command(command_name, *args, stdout=out, stderr=err, **kwargs)
                log.status = CronCommandLog.Status.SUCCESS
            except Exception:
                log.status = CronCommandLog.Status.FAILED
                log.error_message = traceback.format_exc()
            finally:
                log.stdout = out.getvalue()
                log.stderr = err.getvalue()
                log.completed_at = timezone.now()
                log.save()
                if log.status == CronCommandLog.Status.FAILED:
                    excerpt = (log.error_message or log.stderr or log.stdout or "").strip()
                    if len(excerpt) > 1600:
                        excerpt = excerpt[:1600] + "…"
                    failures.append((org, excerpt))

    _notify_cron_command_failed(command_name, failures)

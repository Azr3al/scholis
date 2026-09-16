"""Cron job health evaluation for scheduled django-q tasks."""
from __future__ import annotations

import traceback
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

from croniter import croniter
from django.utils import timezone
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_tasks.cron_registry import CRON_JOBS, CronJobDef, get_job_by_log_command_name
from app_utils.ops_discord import notify_discord_ops_embed

JOB_STATUS_HEALTHY = "healthy"
JOB_STATUS_FAILED = "failed"
JOB_STATUS_MISSED = "missed"
JOB_STATUS_STUCK = "stuck"
JOB_STATUS_UNKNOWN = "unknown"

META_CRON_COMMAND = "cron-health-check"
QCLUSTER_ALIVE_WINDOW = timedelta(minutes=15)
DEDUP_SECONDS = 4 * 3600
GLOBAL_SCHEMA_KEY = "__global__"


def log_global_cron_run(command_name: str, fn: Callable[[], None]) -> None:
    """Run a global-only cron and write SUCCESS/FAILED logs to every tenant schema."""
    from app_organization.models import Organization
    from app_tasks.models import CronCommandLog

    err: str | None = None
    try:
        fn()
        status = CronCommandLog.Status.SUCCESS
    except Exception:
        status = CronCommandLog.Status.FAILED
        err = traceback.format_exc()

    completed_at = timezone.now()
    with schema_context(get_public_schema_name()):
        orgs = list(Organization.objects.all())
    for org in orgs:
        schema_name = getattr(org, "schema_name", None)
        if not schema_name:
            continue
        with schema_context(schema_name):
            CronCommandLog.objects.create(
                command_name=command_name,
                status=status,
                stdout="",
                error_message=err,
                completed_at=completed_at,
            )


def should_send_alert(
    schema_name: str,
    log_command_name: str,
    alert_type: str,
    now: datetime,
) -> bool:
    from app_organization.models import CronHealthAlert

    now = _ensure_aware(now)
    with schema_context(get_public_schema_name()):
        row = CronHealthAlert.objects.filter(
            schema_name=schema_name,
            log_command_name=log_command_name,
            alert_type=alert_type,
        ).first()
        if not row:
            return True
        return (now - _ensure_aware(row.last_alerted_at)).total_seconds() >= DEDUP_SECONDS


def record_alert_sent(
    schema_name: str,
    log_command_name: str,
    alert_type: str,
    now: datetime,
) -> None:
    from app_organization.models import CronHealthAlert

    now = _ensure_aware(now)
    with schema_context(get_public_schema_name()):
        CronHealthAlert.objects.update_or_create(
            schema_name=schema_name,
            log_command_name=log_command_name,
            alert_type=alert_type,
            defaults={"last_alerted_at": now},
        )


def clear_alert_if_healthy(
    schema_name: str,
    log_command_name: str,
    alert_type: str,
) -> None:
    from app_organization.models import CronHealthAlert

    with schema_context(get_public_schema_name()):
        CronHealthAlert.objects.filter(
            schema_name=schema_name,
            log_command_name=log_command_name,
            alert_type=alert_type,
        ).delete()


def _iso_z(dt: datetime | None) -> str:
    if dt is None:
        return "never"
    dt = _ensure_aware(dt)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _expected_by_iso(job_row: dict[str, Any], now: datetime) -> str:
    job = get_job_by_log_command_name(job_row["log_command_name"])
    if not job:
        return "unknown"
    last_expected = _last_expected_at(job, now, job_row.get("last_run_at"))
    expected_by = last_expected + timedelta(seconds=job.grace_seconds)
    return _iso_z(expected_by)


def _job_metadata_signature(job_row: dict[str, Any], now: datetime) -> tuple[str, str]:
    return (_iso_z(job_row.get("last_run_at")), _expected_by_iso(job_row, now))


def _format_tenant_job_details(
    entries: list[tuple[Any, dict[str, Any]]],
    now: datetime,
) -> str | None:
    """Return per-tenant detail lines when job metadata differs across tenants."""
    if len(entries) <= 1:
        return None
    signatures = {
        org.schema_name: _job_metadata_signature(job_row, now)
        for org, job_row in entries
    }
    if len(set(signatures.values())) <= 1:
        return None
    lines: list[str] = []
    for org, job_row in sorted(entries, key=lambda item: _tenant_display_name(item[0])):
        last_run, expected_by = signatures[org.schema_name]
        lines.append(
            f"**{_tenant_display_name(org)}** (`{org.schema_name}`): "
            f"last_run={last_run}, expected_by={expected_by}"
        )
    return "\n".join(lines)


def _tenant_display_name(org: Any) -> str:
    return str(getattr(org, "name", None) or org.schema_name)


def _build_job_health_embed_fields(
    job_row: dict[str, Any],
    affected_orgs: list[Any],
    now: datetime,
) -> list[dict[str, str | bool]]:
    tenant_names = ", ".join(_tenant_display_name(org) for org in sorted(
        affected_orgs, key=_tenant_display_name
    ))
    fields: list[dict[str, str | bool]] = [
        {
            "name": "Command",
            "value": f"`{job_row['log_command_name']}`",
            "inline": True,
        },
        {
            "name": "Affected tenants",
            "value": tenant_names or "(none)",
            "inline": False,
        },
        {
            "name": "Last run",
            "value": f"`{_iso_z(job_row.get('last_run_at'))}`",
            "inline": True,
        },
        {
            "name": "Expected by",
            "value": f"`{_expected_by_iso(job_row, now)}`",
            "inline": True,
        },
    ]
    return fields


def _run_cron_health_check_body() -> None:
    from app_organization.models import Organization

    now = timezone.now()
    scheduler = evaluate_scheduler_health(now=now)

    if not scheduler["qcluster_alive"]:
        if should_send_alert(GLOBAL_SCHEMA_KEY, META_CRON_COMMAND, "scheduler_down", now):
            notify_discord_ops_embed(
                "[Schedjuice] Cron health: SCHEDULER_DOWN",
                [
                    {
                        "name": "Issue",
                        "value": "qcluster has not completed a task in the **last 15 minutes**",
                        "inline": False,
                    }
                ],
                severity="scheduler_down",
            )
            record_alert_sent(GLOBAL_SCHEMA_KEY, META_CRON_COMMAND, "scheduler_down", now)
    else:
        clear_alert_if_healthy(GLOBAL_SCHEMA_KEY, META_CRON_COMMAND, "scheduler_down")

    with schema_context(get_public_schema_name()):
        orgs = list(
            Organization.objects.exclude(schema_name__isnull=True).exclude(schema_name="")
        )

    issue_groups: dict[tuple[str, str], list[tuple[Any, dict[str, Any]]]] = {}
    healthy_clears: list[tuple[str, str, str]] = []

    for org in orgs:
        report = evaluate_cron_health(org.schema_name, now=now)
        for job_row in report["jobs"]:
            status = job_row["status"]
            log_command_name = job_row["log_command_name"]

            if status in (JOB_STATUS_MISSED, JOB_STATUS_STUCK):
                key = (log_command_name, status)
                issue_groups.setdefault(key, []).append((org, job_row))
            elif status in (JOB_STATUS_HEALTHY, JOB_STATUS_FAILED):
                healthy_clears.append((org.schema_name, log_command_name, JOB_STATUS_MISSED))
                healthy_clears.append((org.schema_name, log_command_name, JOB_STATUS_STUCK))

    for schema_name, log_command_name, alert_type in healthy_clears:
        clear_alert_if_healthy(schema_name, log_command_name, alert_type)

    for (log_command_name, status), entries in issue_groups.items():
        affected_orgs = [org for org, _job_row in entries]
        trigger_orgs = [
            org
            for org in affected_orgs
            if should_send_alert(org.schema_name, log_command_name, status, now)
        ]
        if not trigger_orgs:
            continue

        representative_job = entries[0][1]
        description = _format_tenant_job_details(entries, now)
        notify_discord_ops_embed(
            f"[Schedjuice] Cron health: {status.upper()}",
            _build_job_health_embed_fields(representative_job, affected_orgs, now),
            severity=status,
            tenants=affected_orgs,
            description=description,
        )
        for org in trigger_orgs:
            record_alert_sent(org.schema_name, log_command_name, status, now)


def run_cron_health_check() -> None:
    log_global_cron_run(META_CRON_COMMAND, _run_cron_health_check_body)


def _ensure_aware(dt: datetime) -> datetime:
    if timezone.is_naive(dt):
        return timezone.make_aware(dt, timezone.utc)
    return dt


def _midnight_utc(dt: datetime) -> datetime:
    dt = _ensure_aware(dt)
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def _last_expected_at(job: CronJobDef, now: datetime, last_run_at: datetime | None) -> datetime:
    now = _ensure_aware(now)
    if job.schedule_type == "daily":
        if last_run_at:
            expected = _ensure_aware(last_run_at) + timedelta(hours=24)
            while expected + timedelta(hours=24) <= now:
                expected += timedelta(hours=24)
            return expected
        midnight = _midnight_utc(now)
        if now >= midnight:
            return midnight
        return midnight - timedelta(days=1)

    base = _ensure_aware(last_run_at) if last_run_at else now
    return croniter(job.cron, base).get_prev(datetime)


def compute_next_expected_at(
    job: CronJobDef,
    now: datetime,
    last_run_at: datetime | None,
) -> datetime | None:
    now = _ensure_aware(now)
    if job.schedule_type == "daily":
        if last_run_at:
            expected = _ensure_aware(last_run_at) + timedelta(hours=24)
            while expected <= now:
                expected += timedelta(hours=24)
            return expected
        midnight = _midnight_utc(now)
        if now < midnight:
            return midnight
        return midnight + timedelta(days=1)

    if not job.cron:
        return None
    base = _ensure_aware(last_run_at) if last_run_at else now
    return croniter(job.cron, base).get_next(datetime)


def cleanup_stuck_running_logs(
    schema_name: str,
    job: CronJobDef,
    now: datetime,
):
    from app_tasks.models import CronCommandLog

    now = _ensure_aware(now)
    cutoff = now - timedelta(seconds=job.max_duration_seconds)
    with schema_context(schema_name):
        stuck = (
            CronCommandLog.objects.filter(
                command_name=job.log_command_name,
                status=CronCommandLog.Status.RUNNING,
                created_at__lt=cutoff,
            )
            .order_by("-created_at")
            .first()
        )
        if not stuck:
            return None
        stuck.status = CronCommandLog.Status.FAILED
        stuck.error_message = "Timed out (health check)"
        stuck.completed_at = now
        stuck.save(
            update_fields=["status", "error_message", "completed_at", "updated_at"]
        )
        return stuck


def _latest_terminal_log(schema_name: str, job: CronJobDef):
    from app_tasks.models import CronCommandLog

    with schema_context(schema_name):
        return (
            CronCommandLog.objects.filter(
                command_name=job.log_command_name,
                status__in=[
                    CronCommandLog.Status.SUCCESS,
                    CronCommandLog.Status.FAILED,
                ],
            )
            .order_by("-completed_at", "-created_at")
            .first()
        )


def _latest_running_log(schema_name: str, job: CronJobDef, now: datetime):
    from app_tasks.models import CronCommandLog

    now = _ensure_aware(now)
    with schema_context(schema_name):
        running = (
            CronCommandLog.objects.filter(
                command_name=job.log_command_name,
                status=CronCommandLog.Status.RUNNING,
            )
            .order_by("-created_at")
            .first()
        )
        if not running:
            return None
        cutoff = now - timedelta(seconds=job.max_duration_seconds)
        if running.created_at < cutoff:
            return running
        return None


def _duration_seconds(log) -> float | None:
    if not log or not log.completed_at:
        return None
    return (log.completed_at - log.created_at).total_seconds()


def evaluate_job_health(schema_name: str, job: CronJobDef, now: datetime | None = None) -> dict[str, Any]:
    from app_tasks.models import CronCommandLog

    now = _ensure_aware(now or timezone.now())

    stuck_before_cleanup = _latest_running_log(schema_name, job, now)
    cleanup_stuck_running_logs(schema_name, job, now)

    terminal = _latest_terminal_log(schema_name, job)
    last_run_at = terminal.completed_at if terminal and terminal.completed_at else None

    last_expected = _last_expected_at(job, now, last_run_at)
    next_expected = compute_next_expected_at(job, now, last_run_at)
    grace = timedelta(seconds=job.grace_seconds)
    missed_deadline = last_expected + grace

    if stuck_before_cleanup:
        status = JOB_STATUS_STUCK
    elif terminal is None:
        current_slot = _last_expected_at(job, now, None)
        if job.schedule_type == "daily":
            missed = now > current_slot + grace
        else:
            previous_slot = croniter(job.cron, current_slot).get_prev(datetime)
            missed = now > previous_slot + grace
        status = JOB_STATUS_MISSED if missed else JOB_STATUS_UNKNOWN
    else:
        log_time = terminal.completed_at or terminal.created_at
        if log_time < last_expected and now > missed_deadline:
            status = JOB_STATUS_MISSED
        elif terminal.status == CronCommandLog.Status.FAILED:
            if terminal.error_message == "Timed out (health check)":
                status = JOB_STATUS_STUCK
            else:
                status = JOB_STATUS_FAILED
        else:
            status = JOB_STATUS_HEALTHY

    last_log = terminal or stuck_before_cleanup
    return {
        "schedule_name": job.schedule_name,
        "log_command_name": job.log_command_name,
        "description": job.description,
        "triggerable": job.triggerable,
        "scope": job.scope,
        "status": status,
        "last_run_at": last_run_at,
        "last_duration_seconds": _duration_seconds(terminal),
        "next_expected_at": next_expected,
        "last_log_id": last_log.id if last_log else None,
    }


def _tenant_jobs() -> tuple[CronJobDef, ...]:
    return tuple(j for j in CRON_JOBS if j.log_command_name != META_CRON_COMMAND)


def evaluate_cron_health(schema_name: str, now: datetime | None = None) -> dict[str, Any]:
    now = _ensure_aware(now or timezone.now())
    jobs = [evaluate_job_health(schema_name, job, now) for job in _tenant_jobs()]
    summary = {
        JOB_STATUS_HEALTHY: 0,
        JOB_STATUS_FAILED: 0,
        JOB_STATUS_MISSED: 0,
        JOB_STATUS_STUCK: 0,
        JOB_STATUS_UNKNOWN: 0,
    }
    for row in jobs:
        summary[row["status"]] = summary.get(row["status"], 0) + 1
    return {"jobs": jobs, "summary": summary}


def _meta_check_ran_at() -> datetime | None:
    from app_organization.models import Organization
    from app_tasks.models import CronCommandLog

    max_at: datetime | None = None
    with schema_context(get_public_schema_name()):
        orgs = list(
            Organization.objects.exclude(schema_name__isnull=True).exclude(schema_name="")
        )
    for org in orgs:
        with schema_context(org.schema_name):
            log = (
                CronCommandLog.objects.filter(
                    command_name=META_CRON_COMMAND,
                    completed_at__isnull=False,
                )
                .order_by("-completed_at")
                .first()
            )
            if log and log.completed_at and (max_at is None or log.completed_at > max_at):
                max_at = log.completed_at
    return max_at


def evaluate_scheduler_health(now: datetime | None = None) -> dict[str, Any]:
    from django_q.models import Schedule, Success

    now = _ensure_aware(now or timezone.now())
    alive_cutoff = now - QCLUSTER_ALIVE_WINDOW

    with schema_context(get_public_schema_name()):
        qcluster_alive = Success.objects.filter(stopped__gte=alive_cutoff).exists()
        schedules_registered = Schedule.objects.count()

    schedules_expected = len(CRON_JOBS)
    meta_check_ran_at = _meta_check_ran_at()

    if not qcluster_alive:
        overall = "down"
    elif schedules_registered != schedules_expected:
        overall = "degraded"
    else:
        overall = "healthy"

    return {
        "qcluster_alive": qcluster_alive,
        "schedules_registered": schedules_registered,
        "schedules_expected": schedules_expected,
        "meta_check_ran_at": meta_check_ran_at,
        "overall": overall,
    }

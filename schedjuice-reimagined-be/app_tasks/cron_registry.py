"""Canonical django-q cron job definitions for schedules, health, and triggers."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


def _grace_for_cron(cron: str | None, schedule_type: str) -> int:
    if schedule_type == "daily":
        return 26 * 3600
    if not cron:
        return 26 * 3600
    if cron.startswith("*/5 "):
        return 10 * 60
    if cron.startswith("*/10 "):
        return 15 * 60
    if cron.startswith("*/15 "):
        return 20 * 60
    if cron.startswith("0 *"):
        return 75 * 60
    return 26 * 3600


@dataclass(frozen=True)
class CronJobDef:
    schedule_name: str
    log_command_name: str
    schedule_type: str  # "cron" | "daily"
    cron: str | None
    scope: str  # "tenant" | "global"
    triggerable: bool
    description: str
    func: str | None = None
    args: str = "()"
    kwargs: dict[str, Any] = field(default_factory=dict)
    max_duration_seconds: int = 900
    grace_seconds: int = 0

    def __post_init__(self) -> None:
        if not self.grace_seconds:
            object.__setattr__(
                self,
                "grace_seconds",
                _grace_for_cron(self.cron, self.schedule_type),
            )


def _job(
    schedule_name: str,
    log_command_name: str,
    *,
    schedule_type: str = "cron",
    cron: str | None = None,
    scope: str = "tenant",
    triggerable: bool = True,
    description: str = "",
    func: str | None = None,
    args: str | None = None,
    kwargs: dict[str, Any] | None = None,
    max_duration_seconds: int = 900,
) -> CronJobDef:
    if args is None:
        args = f"'{log_command_name}'" if func is None else "()"
    return CronJobDef(
        schedule_name=schedule_name,
        log_command_name=log_command_name,
        schedule_type=schedule_type,
        cron=cron,
        scope=scope,
        triggerable=triggerable,
        description=description or log_command_name.replace("-", " ").replace("_", " "),
        func=func,
        args=args,
        kwargs=kwargs or {},
        max_duration_seconds=max_duration_seconds,
    )


CRON_JOBS: tuple[CronJobDef, ...] = (
    _job("course-processor", "process-courses", cron="*/15 * * * *", description="Process courses"),
    _job("payment-processor", "process-payments", schedule_type="daily"),
    _job("task-runner", "run-tasks", cron="*/15 * * * *"),
    _job("attendance-code-assigner", "generate-attendance-codes", cron="*/15 * * * *"),
    _job("check-alumni-statuses", "check-alumni-statuses", cron="30 17 * * *"),
    _job("re-enable-alumni", "re-enable-alumni", cron="0 * * * *"),
    _job(
        "remove-expired-substitutes",
        "remove-expired-substitutes",
        cron="0 3 * * *",
        description="Remove substitute teachers past their last covered session",
    ),
    _job("record-daily-billing", "record_daily_billing", cron="30 18 * * *"),
    _job("generate-invoices", "generate_invoices", schedule_type="daily"),
    _job("cleanup-expo-notifications", "cleanup_expo_notifications", schedule_type="daily"),
    _job(
        "sweep-custom-field-attachments",
        "sweep_custom_field_attachments",
        schedule_type="daily",
        description="Soft-delete orphan custom-field attachment uploads older than 24h",
    ),
    _job(
        "sync-meeting-attendance",
        "sync-meeting-attendance",
        cron="30 19 * * *",
        kwargs={"sync": False},
    ),
    _job(
        "ensure-payment-assignments",
        "ensure-payment-assignments",
        cron="5 0 * * *",
        func="app_tasks.cron_runner.schedule_ensure_payment_assignments",
    ),
    _job(
        "alert-payment-assignment-gaps",
        "alert-payment-assignment-gaps",
        cron="0 2 * * *",
        scope="global",
        triggerable=False,
        func="app_tasks.payment_assignment_gap_digest.run_payment_assignment_gap_digest_wrapped",
    ),
    _job(
        "sync-payment-submissions",
        "sync-payment-submissions",
        cron="0 1 * * *",
        kwargs={"sync": False},
    ),
    _job("send-daily-schedule-digest", "send-daily-schedule-digest", cron="0 * * * *", triggerable=False),
    _job("send-class-starting-reminders", "send-class-starting-reminders", cron="*/10 * * * *", triggerable=False),
    _job("send-assignment-due-reminders", "send-assignment-due-reminders", cron="0 * * * *", triggerable=False),
    _job("send-payment-due-reminders", "send-payment-due-reminders", cron="0 * * * *", triggerable=False),
    _job("send-admin-finance-digest", "send-admin-finance-digest", cron="0 * * * *", triggerable=False),
    _job(
        "cron-health-check",
        "cron-health-check",
        cron="*/10 * * * *",
        scope="global",
        triggerable=False,
        func="app_tasks.cron_health.run_cron_health_check",
        description="Meta-cron: evaluate cron health and alert Discord",
    ),
)


def get_job_by_schedule_name(name: str) -> CronJobDef | None:
    return next((j for j in CRON_JOBS if j.schedule_name == name), None)


def get_job_by_log_command_name(name: str) -> CronJobDef | None:
    return next((j for j in CRON_JOBS if j.log_command_name == name), None)


def get_triggerable_command_names() -> frozenset[str]:
    return frozenset(j.log_command_name for j in CRON_JOBS if j.triggerable)


def schedule_dicts_for_django_q() -> list[dict[str, Any]]:
    """Build django-q Schedule kwargs dicts (Schedule.CRON / Schedule.DAILY added in apps.py)."""
    from django_q.models import Schedule

    out: list[dict[str, Any]] = []
    for job in CRON_JOBS:
        row: dict[str, Any] = {
            "name": job.schedule_name,
            "args": job.args,
            "kwargs": job.kwargs,
        }
        if job.schedule_type == "daily":
            row["schedule_type"] = Schedule.DAILY
        else:
            row["schedule_type"] = Schedule.CRON
            row["cron"] = job.cron
        if job.func:
            row["func"] = job.func
        out.append(row)
    return out

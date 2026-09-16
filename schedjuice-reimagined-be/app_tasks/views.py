"""
REST endpoints for platform management commands, cron health/logs, and triggers.
Requires ``debug.access`` (platform-internal; superadmin by default).
"""

import io
import traceback

from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.request import Request
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from app_rbac.views import RBACView
from app_tasks.cron_health import evaluate_cron_health, evaluate_scheduler_health
from app_tasks.cron_registry import get_triggerable_command_names
from app_tasks.models import CronCommandLog
from app_utils.ops_discord_helpers import discord_webhook_status

# Allowlisted management commands for POST /management/<command_name>.
# Body params are passed as kwargs to call_command (e.g. schema, course_id).
# Commands with positional course_id must receive it as a positional arg to call_command,
# not as a kwarg (Django's call_command raises min() on empty sequence otherwise).
MS_TEAMS_COMMANDS = frozenset({
    "sync-meeting-attendance",
    "sync-video-attendance",
    "sync-teams-attendance",
    "backfill-course-teams-organizers",
    "provision-missing-course-teams",
    "send-meeting-link-to-channel",
    "update-meeting-policies",
    "fetch-meeting-info",
    "create-payment-assignments",
    "ensure-payment-assignments",
    "update-payment-assignments",
    "delete-payment-assignments",
    "cleanup-ineligible-payment-assignments",
    "cleanup-duplicate-payment-assignments",
    "sync-payment-submissions",
    "backfill-user-attendance-hourly-rates",
    "backfill-daily-billing",
    "send-expo-test-notification",
    "backfill-id-photo-thumbs",
    "backfill-user-codes",
    "reset-payment-receipt-numbering",
    "backfill-multi-course-payment-coverage",
    "backfill-late-joiner-billing",
    "backfill_teams_announcements",
})

# Commands that have positional course_id (required or optional). Pass as *args, not **kwargs.
COMMANDS_WITH_POSITIONAL_COURSE_ID = frozenset({
    "send-meeting-link-to-channel",
    "update-meeting-policies",
    "fetch-meeting-info",
})


class ManagementCommandView(RBACView):
    """
    POST /management/<command-name>
    Invokes an allowlisted management command with body params as command args.
    """

    http_method_names = ["post"]
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "debug.access"}

    def post(self, request: Request, command_name: str):
        if command_name not in MS_TEAMS_COMMANDS:
            return self.send_response(
                True,
                "not_found",
                {"details": f"Unknown management command: {command_name}"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Build kwargs from request body (omit None values)
        body = request.data or {}
        kwargs = {k: v for k, v in body.items() if v is not None}

        # For commands with positional course_id, pass course_id as positional arg
        # (Django's call_command raises "min() arg is an empty sequence" if passed as kwarg)
        positional_args = []
        if command_name in COMMANDS_WITH_POSITIONAL_COURSE_ID:
            course_id = kwargs.pop("course_id", None)
            if command_name == "send-meeting-link-to-channel":
                if course_id is None:
                    return self.send_response(
                        True,
                        "bad_request",
                        {"details": "course_id is required for send-meeting-link-to-channel"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            if course_id is not None:
                positional_args.append(course_id)

        try:
            out = io.StringIO()
            err = io.StringIO()
            call_command(
                command_name,
                *positional_args,
                stdout=out,
                stderr=err,
                **kwargs,
            )
            output = out.getvalue()
            err_output = err.getvalue()
            return self.send_response(
                False,
                "success",
                {
                    "output": output,
                    "stderr": err_output,
                },
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            return self.send_response(
                True,
                "command_failed",
                {"details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class TriggerCronView(RBACView):
    """
    POST /management/cron-trigger/<command-name>
    Manually triggers a scheduled cron command for the current tenant (X-Tenant schema).
    Idempotent: returns 409 if the same command is already RUNNING in this tenant.
    """
    http_method_names = ["post"]
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "debug.access"}

    def post(self, request: Request, command_name: str):
        if command_name not in get_triggerable_command_names():
            return self.send_response(
                True, "not_found",
                {"details": f"Unknown cron command: {command_name}"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Idempotency: reject if same command is already RUNNING in this tenant schema
        running = CronCommandLog.objects.filter(
            command_name=command_name,
            status=CronCommandLog.Status.RUNNING,
        ).first()
        if running:
            return self.send_response(
                True, "already_running",
                {"details": f"Command is already running (log id={running.id}, started={running.created_at})"},
                status=status.HTTP_409_CONFLICT,
            )

        log = CronCommandLog.objects.create(command_name=command_name)
        out, err = io.StringIO(), io.StringIO()
        try:
            kwargs = {}
            # Force sync execution for async-by-default commands so we get immediate output
            if command_name in {
                "sync-meeting-attendance",
                "sync-video-attendance",
                "sync-teams-attendance",
                "ensure-payment-assignments",
                "sync-payment-submissions",
            }:
                kwargs["sync"] = True
            call_command(command_name, stdout=out, stderr=err, **kwargs)
            log.status = CronCommandLog.Status.SUCCESS
        except Exception:
            log.status = CronCommandLog.Status.FAILED
            log.error_message = traceback.format_exc()
        finally:
            log.stdout = out.getvalue()
            log.stderr = err.getvalue()
            log.completed_at = timezone.now()
            log.save()

        return self.send_response(False, "success", {
            "log": {
                "id": log.id,
                "command_name": log.command_name,
                "status": log.status,
                "stdout": log.stdout,
                "stderr": log.stderr,
                "error_message": log.error_message,
                "created_at": log.created_at,
                "completed_at": log.completed_at,
            }
        }, status=status.HTTP_200_OK)


class CronHealthView(RBACView):
    """
    GET /management/cron-health
    Returns cron job health for the current tenant plus scheduler and Discord status.
    """

    http_method_names = ["get"]
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "debug.access"}

    def get(self, request: Request):
        checked_at = timezone.now()
        tenant_health = evaluate_cron_health(request.tenant.schema_name, now=checked_at)
        return self.send_response(
            False,
            "success",
            {
                "scheduler": evaluate_scheduler_health(now=checked_at),
                "discord": discord_webhook_status(),
                "checked_at": checked_at,
                "jobs": tenant_health["jobs"],
                "summary": tenant_health["summary"],
            },
            status=status.HTTP_200_OK,
        )


class CronCommandLogView(RBACView):
    """
    GET /management/cron-logs?command_name=<name>&limit=<n>
    Returns cron job execution logs. Optional command_name filter; limit max 50, default 10.
    """

    http_method_names = ["get"]
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "debug.access"}

    def get(self, request: Request):
        command_name = request.query_params.get("command_name")
        limit = min(int(request.query_params.get("limit", 10)), 50)

        qs = CronCommandLog.objects.order_by("-created_at")
        if command_name:
            qs = qs.filter(command_name=command_name)

        logs = list(
            qs[:limit].values(
                "id",
                "command_name",
                "status",
                "stdout",
                "stderr",
                "error_message",
                "created_at",
                "completed_at",
            )
        )

        return self.send_response(
            False,
            "success",
            {"logs": logs},
            status=status.HTTP_200_OK,
        )

from __future__ import annotations

import logging
import time

from django.utils import timezone

from app_auth.models import User
from app_microsoft.flows import _MS_GRAPH_MUTATION_GAP_SEC
from app_microsoft.graph_wrapper.user import MSUser
from app_microsoft.models import MicrosoftRepairJob
from app_organization.acca_spreadsheet_import import IMPORT_PASSWORD, normalize_email
from utilitas.async_tasks import django_q_task, tenant_async

logger = logging.getLogger(__name__)

MAX_EMAILS = 50
# Sync commit runs inside one HTTP request; keep it under the Railway proxy
# timeout ceiling. Bulk runs must use the async job endpoint instead.
MAX_SYNC_COMMIT_EMAILS = 20
MAX_JOB_EMAILS = 2000
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 256
# qcluster default task timeout is 900s; queued (202) Graph operations can
# each take ~20s of polling under throttling, so large runs need headroom.
PASSWORD_RESET_JOB_TIMEOUT_SECONDS = 7200


class BulkPasswordResetError(Exception):
    def __init__(self, message: str, code: str):
        super().__init__(message)
        self.code = code


def _require_microsoft_tenant(tenant) -> None:
    if not getattr(tenant, "is_microsoft_on", False):
        raise BulkPasswordResetError(
            "Microsoft integration is not enabled for this organization.",
            "not_supported",
        )


def _parse_email_list(raw_emails, max_emails: int = MAX_EMAILS) -> list[str]:
    if not isinstance(raw_emails, list):
        raise BulkPasswordResetError("emails must be an array.", "missing_emails")
    seen: set[str] = set()
    parsed: list[str] = []
    for item in raw_emails:
        if not isinstance(item, str):
            continue
        display = item.strip()
        normalized = normalize_email(display)
        if not normalized:
            continue
        if normalized in seen:
            continue
        seen.add(normalized)
        parsed.append(normalized)
    if not parsed:
        raise BulkPasswordResetError("emails must be a non-empty array.", "missing_emails")
    if len(parsed) > max_emails:
        raise BulkPasswordResetError(
            f"At most {max_emails} emails per request.",
            "too_many_emails",
        )
    return parsed


def _resolve_preview_row(email: str) -> dict:
    user = User.objects.filter(email=email).first()
    if user is None:
        return {"email": email, "status": "not_found"}
    if not (user.microsoft_id or "").strip():
        return {
            "email": email,
            "status": "no_microsoft_account",
            "user_id": user.id,
        }
    return {
        "email": email,
        "status": "eligible",
        "user_id": user.id,
        "microsoft_id": user.microsoft_id,
    }


def preview_emails(tenant, raw_emails: list, max_emails: int = MAX_EMAILS) -> dict:
    _require_microsoft_tenant(tenant)
    emails = _parse_email_list(raw_emails, max_emails=max_emails)
    results = [_resolve_preview_row(email) for email in emails]
    summary = {
        "total": len(results),
        "eligible": sum(1 for r in results if r["status"] == "eligible"),
        "not_found": sum(1 for r in results if r["status"] == "not_found"),
        "no_microsoft_account": sum(
            1 for r in results if r["status"] == "no_microsoft_account"
        ),
    }
    return {"results": results, "summary": summary}


def _graph_failure_reason(status_code: int, response=None) -> str:
    body = ""
    if response is not None:
        body = (getattr(response, "text", None) or "")[:200]
    if body:
        return f"Graph {status_code}: {body}"
    return f"Graph {status_code}"


def _parse_password(raw_password) -> str:
    """Custom password for the reset; falls back to the onboarding default."""
    if raw_password is None:
        return IMPORT_PASSWORD
    if not isinstance(raw_password, str):
        raise BulkPasswordResetError("password must be a string.", "invalid_password")
    password = raw_password.strip()
    if len(password) < MIN_PASSWORD_LENGTH:
        raise BulkPasswordResetError(
            f"password must be at least {MIN_PASSWORD_LENGTH} characters.",
            "invalid_password",
        )
    if len(password) > MAX_PASSWORD_LENGTH:
        raise BulkPasswordResetError(
            f"password must be at most {MAX_PASSWORD_LENGTH} characters.",
            "invalid_password",
        )
    return password


def commit_emails(tenant, raw_emails: list, raw_password: str | None = None) -> dict:
    preview = preview_emails(tenant, raw_emails, max_emails=MAX_SYNC_COMMIT_EMAILS)
    password = _parse_password(raw_password)
    ms_user = MSUser(tenant)
    results = []

    for row in preview["results"]:
        email = row["email"]
        if row["status"] == "not_found":
            results.append({"email": email, "status": "skipped", "reason": "not_found"})
            continue
        if row["status"] == "no_microsoft_account":
            results.append(
                {
                    "email": email,
                    "status": "skipped",
                    "reason": "no_microsoft_account",
                }
            )
            continue

        graph_result = ms_user.reset_password(
            row["microsoft_id"],
            tenant,
            password=password,
        )
        status_code = graph_result.get("status", 0)
        if 200 <= status_code < 300:
            results.append({"email": email, "status": "succeeded"})
        else:
            results.append(
                {
                    "email": email,
                    "status": "failed",
                    "reason": graph_result.get("reason")
                    or _graph_failure_reason(status_code),
                }
            )

    summary = {
        "total": len(results),
        "succeeded": sum(1 for r in results if r["status"] == "succeeded"),
        "skipped": sum(1 for r in results if r["status"] == "skipped"),
        "failed": sum(1 for r in results if r["status"] == "failed"),
    }
    return {"results": results, "summary": summary}


def start_password_reset_job(
    tenant, raw_emails: list, raw_password: str | None = None
) -> MicrosoftRepairJob:
    """Create and dispatch an async bulk password-reset job.

    Must run inside the target tenant's schema_context. The password travels
    via django-q task args (Redis) only; it is not persisted on the job row.
    """
    _require_microsoft_tenant(tenant)
    password = _parse_password(raw_password)
    preview = preview_emails(tenant, raw_emails, max_emails=MAX_JOB_EMAILS)

    eligible_ids = [
        row["user_id"] for row in preview["results"] if row["status"] == "eligible"
    ]
    skipped_results = [
        {"email": row["email"], "status": "skipped", "reason": row["status"]}
        for row in preview["results"]
        if row["status"] != "eligible"
    ]

    job = MicrosoftRepairJob.objects.create(
        target_type=MicrosoftRepairJob.TargetType.PASSWORD_RESET,
        candidate_ids=eligible_ids,
        status=MicrosoftRepairJob.Status.PENDING,
        results=skipped_results,
        skipped=len(skipped_results),
    )
    run_password_reset_job.delay(
        job.id,
        tenant.schema_name,
        password,
        timeout=PASSWORD_RESET_JOB_TIMEOUT_SECONDS,
    )
    return job


@django_q_task
@tenant_async(entity=MicrosoftRepairJob)
def run_password_reset_job(job, tenant, password=None):
    if job is None:
        return
    if job.status in (
        MicrosoftRepairJob.Status.SUCCEEDED,
        MicrosoftRepairJob.Status.PARTIAL,
        MicrosoftRepairJob.Status.FAILED,
    ):
        # Terminal jobs never re-run (also neutralizes django-q retry
        # re-delivery after a broker restart).
        return
    job.status = MicrosoftRepairJob.Status.RUNNING
    job.started_at = timezone.now()
    job.save(update_fields=["status", "started_at", "updated_at"])
    try:
        _run_password_reset_loop(job, tenant, password)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Password reset job %s crashed", job.id)
        job.status = MicrosoftRepairJob.Status.FAILED
        job.error_message = str(exc)[:1000]
        job.finished_at = timezone.now()
        job.save()


def cancel_password_reset_job(job_id) -> tuple[MicrosoftRepairJob | None, str | None]:
    """Mark a pending/running password-reset job cancelled.

    Must run inside the target tenant's schema_context. The runner checks the
    row before every record and stops; a still-queued django-q task is
    neutralized by the terminal-status guard in ``run_password_reset_job``.
    """
    job = MicrosoftRepairJob.objects.filter(
        id=job_id, target_type=MicrosoftRepairJob.TargetType.PASSWORD_RESET
    ).first()
    if job is None:
        return None, "No such password reset job."
    if job.status in (
        MicrosoftRepairJob.Status.SUCCEEDED,
        MicrosoftRepairJob.Status.PARTIAL,
        MicrosoftRepairJob.Status.FAILED,
    ):
        return job, None
    job.status = MicrosoftRepairJob.Status.FAILED
    job.error_message = "Cancelled by operator"
    job.finished_at = timezone.now()
    job.save()
    return job, None


def _reverify_pending_operations(ms_user, results: list[dict]) -> None:
    """Second pass over timed-out reset operations Graph queued.

    The operation-status URL stays queryable long after our per-user polling
    window; by the end of the batch most pending ops have settled, turning
    false-negative "did not complete in time" rows into honest outcomes.
    Rows still pending keep their verify-before-retry reason.
    """
    for row in results:
        operation_url = row.get("operation_url")
        if not operation_url:
            continue
        status_code, reason = ms_user.check_reset_operation(operation_url)
        if 200 <= status_code < 300:
            row["status"] = "succeeded"
            row.pop("reason", None)
            row.pop("operation_url", None)
        elif status_code == 400:
            row["status"] = "failed"
            row["reason"] = reason or "Operation failed."
            row.pop("operation_url", None)
        time.sleep(_MS_GRAPH_MUTATION_GAP_SEC)


def _run_password_reset_loop(job, tenant, raw_password) -> None:
    from app_microsoft.repair import _finalize, _persist_progress

    password = _parse_password(raw_password)

    results = list(job.results or [])
    skipped = sum(1 for r in results if r.get("status") == "skipped")
    succeeded = failed = 0

    users = list(
        User.objects.filter(id__in=job.candidate_ids or []).only(
            "id", "email", "microsoft_id"
        )
    )
    ms_user = MSUser(tenant) if users else None

    for user in users:
        job.refresh_from_db(fields=["status"])
        if job.status != MicrosoftRepairJob.Status.RUNNING:
            logger.info(
                "Password reset job %s cancelled after %s records",
                job.id,
                succeeded + failed + skipped,
            )
            return
        microsoft_id = (user.microsoft_id or "").strip()
        if not microsoft_id:
            skipped += 1
            results.append(
                {"email": user.email, "status": "skipped", "reason": "no_microsoft_account"}
            )
            _persist_progress(job, succeeded, failed, skipped, results)
            continue
        try:
            graph_result = ms_user.reset_password(
                microsoft_id, tenant, password=password
            )
            status_code = graph_result.get("status", 0)
            if 200 <= status_code < 300:
                succeeded += 1
                results.append({"email": user.email, "status": "succeeded"})
            else:
                failed += 1
                failed_row = {
                    "email": user.email,
                    "status": "failed",
                    "reason": graph_result.get("reason") or f"Graph {status_code}",
                }
                operation_url = graph_result.get("operation_url")
                if operation_url:
                    failed_row["operation_url"] = operation_url
                results.append(failed_row)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            results.append(
                {"email": user.email, "status": "failed", "reason": str(exc)[:500]}
            )
            logger.exception("Password reset failed for %s", user.email)
        time.sleep(_MS_GRAPH_MUTATION_GAP_SEC)
        _persist_progress(job, succeeded, failed, skipped, results)

    if ms_user is not None:
        _reverify_pending_operations(ms_user, results)
        succeeded = sum(1 for r in results if r["status"] == "succeeded")
        failed = sum(1 for r in results if r["status"] == "failed")
        skipped = sum(1 for r in results if r["status"] == "skipped")
        _persist_progress(job, succeeded, failed, skipped, results)

    _finalize(job, succeeded, failed, skipped, results)

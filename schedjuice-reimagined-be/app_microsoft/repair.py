"""Bulk Microsoft provisioning repair: dry-run scanning + async repair jobs."""

from __future__ import annotations

import logging
import time

from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from app_auth.models import User
from app_course.models import Course
from app_microsoft.flows import MicrosoftAlreadyExistsError, _MS_GRAPH_MUTATION_GAP_SEC
from app_microsoft.models import MicrosoftRepairJob
from app_microsoft.provisioning import (
    REPAIRABLE_LICENSE_STATUSES,
    REPAIRABLE_STATUSES,
    assign_license_to_user,
    evaluate_course_candidate,
    evaluate_unlicensed_user_candidate,
    evaluate_user_candidate,
    provision_course_team_for,
    provision_user_account,
)
from app_course.course_status import apply_effective_status_filter
from app_microsoft.graph_wrapper.group import MSGroup
from app_microsoft.scope_team_sync import (
    reconcile_scope_owner_for_user_course,
    teaching_owner_user_ids,
    users_with_scope_for_course,
)
from app_microsoft.team_provisioning_helpers import tenant_syncs_course_team_roster
from app_organization.domain_utils import get_organization_approved_domains
from utilitas.async_tasks import django_q_task, tenant_async

logger = logging.getLogger(__name__)

SCOPE_OWNER_REPAIRABLE = frozenset({"missing_owner"})


def is_import_provisioning_job(job: MicrosoftRepairJob) -> bool:
    """True when the job was started from user import commit (tenant-pollable)."""
    return (
        job.target_type == MicrosoftRepairJob.TargetType.USERS
        and job.created_by_id is not None
        and bool(job.candidate_ids)
    )


def serialize_import_provisioning_job(job: MicrosoftRepairJob) -> dict:
    """Slim job payload for the import wizard (no per-record results)."""
    return {
        "id": job.id,
        "status": job.status,
        "succeeded": job.succeeded,
        "failed": job.failed,
        "skipped": job.skipped,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "error_message": job.error_message,
    }


def scope_owner_candidate_key(course_id: int, user_id: int) -> str:
    return f"{course_id}:{user_id}"


def _missing_microsoft_id_users():
    return User.objects.filter(
        Q(microsoft_id__isnull=True) | Q(microsoft_id="")
    ).order_by("id")


def _missing_group_courses():
    return Course.objects.filter(
        Q(microsoft_group_id__isnull=True) | Q(microsoft_group_id="")
    ).order_by("id")


def _unlicensed_microsoft_users():
    return (
        User.objects.filter(microsoft_id__isnull=False)
        .exclude(microsoft_id="")
        .filter(microsoft_license_assigned=False)
        .order_by("id")
    )


def scan_user_candidates(tenant) -> list[dict]:
    approved = get_organization_approved_domains(tenant)
    return [
        evaluate_user_candidate(u, tenant, approved_domains=approved)
        for u in _missing_microsoft_id_users()
    ]


def scan_course_candidates(tenant) -> list[dict]:
    return [
        evaluate_course_candidate(c, tenant)
        for c in _missing_group_courses().select_related("category")
    ]


def scan_unlicensed_user_candidates(tenant) -> list[dict]:
    return [
        evaluate_unlicensed_user_candidate(u, tenant)
        for u in _unlicensed_microsoft_users()
    ]


def scan_scope_team_owner_candidates(tenant) -> list[dict]:
    if not tenant_syncs_course_team_roster(tenant):
        return []

    qs = Course.objects.exclude(microsoft_group_id__isnull=True).exclude(
        microsoft_group_id=""
    )
    qs = apply_effective_status_filter(
        qs,
        [Course.CourseStatus.PLANNED, Course.CourseStatus.ACTIVE],
    )
    group = MSGroup(tenant)
    candidates: list[dict] = []
    for course in qs.iterator():
        try:
            actual_owner_ids = group.list_owner_ids(course.microsoft_group_id)
        except Exception:
            logger.exception("list owners failed course_id=%s", course.id)
            continue

        teaching_ids = teaching_owner_user_ids(course)
        for user in users_with_scope_for_course(course):
            if user.id in teaching_ids:
                continue
            mid = (user.microsoft_id or "").strip()
            if not mid or mid in actual_owner_ids:
                continue
            candidates.append(
                {
                    "id": user.id,
                    "course_id": course.id,
                    "course_title": course.title,
                    "name": user.name,
                    "email": user.email,
                    "status": "missing_owner",
                    "detail": f"Expected scope owner on team for {course.title!r}",
                    "candidate_key": scope_owner_candidate_key(course.id, user.id),
                }
            )
    return candidates


def summarize_candidates(
    candidates: list[dict],
    *,
    repairable_statuses: frozenset[str] | None = None,
) -> dict:
    if repairable_statuses is None:
        repairable_statuses = REPAIRABLE_STATUSES
    counts: dict[str, int] = {}
    for c in candidates:
        counts[c["status"]] = counts.get(c["status"], 0) + 1
    return {
        "total": len(candidates),
        "repairable": sum(
            1 for c in candidates if c["status"] in repairable_statuses
        ),
        "by_status": counts,
    }


def dry_run(tenant, target_type: str) -> dict:
    """Synchronous scan of repairable/blocked records for the Superadmin UI."""
    if target_type == MicrosoftRepairJob.TargetType.USERS:
        candidates = scan_user_candidates(tenant)
    elif target_type == MicrosoftRepairJob.TargetType.COURSES:
        candidates = scan_course_candidates(tenant)
    elif target_type == MicrosoftRepairJob.TargetType.UNLICENSED_USERS:
        candidates = scan_unlicensed_user_candidates(tenant)
        return {
            "target_type": target_type,
            "summary": summarize_candidates(
                candidates, repairable_statuses=REPAIRABLE_LICENSE_STATUSES
            ),
            "candidates": candidates,
        }
    elif target_type == MicrosoftRepairJob.TargetType.SCOPE_TEAM_OWNERS:
        candidates = scan_scope_team_owner_candidates(tenant)
        return {
            "target_type": target_type,
            "summary": summarize_candidates(
                candidates, repairable_statuses=SCOPE_OWNER_REPAIRABLE
            ),
            "candidates": candidates,
        }
    else:
        raise ValueError(f"Unknown target_type: {target_type}")
    return {
        "target_type": target_type,
        "summary": summarize_candidates(candidates),
        "candidates": candidates,
    }


def start_repair_job(
    tenant,
    target_type: str,
    candidate_ids,
    created_by,
    *,
    send_welcome_emails: bool = False,
) -> MicrosoftRepairJob:
    job = MicrosoftRepairJob.objects.create(
        target_type=target_type,
        candidate_ids=list(candidate_ids or []),
        created_by=created_by,
        status=MicrosoftRepairJob.Status.PENDING,
    )
    run_repair_job.delay(job.id, tenant.schema_name, send_welcome_emails)
    return job


def _repair_users(job: MicrosoftRepairJob, tenant) -> None:
    approved = get_organization_approved_domains(tenant)
    qs = _missing_microsoft_id_users()
    if job.candidate_ids:
        qs = qs.filter(id__in=job.candidate_ids)
    results = []
    succeeded = failed = skipped = 0
    for user in qs:
        evaluation = evaluate_user_candidate(user, tenant, approved_domains=approved)
        if evaluation["status"] not in REPAIRABLE_STATUSES:
            skipped += 1
            results.append(
                {"id": user.id, "status": "skipped", "detail": evaluation["detail"]}
            )
            continue
        try:
            outcome = provision_user_account(user, tenant)
            succeeded += 1
            results.append(
                {"id": user.id, "status": outcome["status"],
                 "detail": f"microsoft_id={outcome.get('microsoft_id')}"}
            )
        except MicrosoftAlreadyExistsError as exc:
            skipped += 1
            results.append(
                {"id": user.id, "status": "conflict",
                 "detail": "Account already exists in Microsoft; link it instead."}
            )
        except (ValidationError, Exception) as exc:  # noqa: BLE001
            failed += 1
            results.append({"id": user.id, "status": "failed", "detail": str(exc)[:500]})
            logger.exception("Repair failed for user %s", user.id)
        time.sleep(_MS_GRAPH_MUTATION_GAP_SEC)
        _persist_progress(job, succeeded, failed, skipped, results)
    _finalize(job, succeeded, failed, skipped, results)


def _repair_unlicensed_users(job: MicrosoftRepairJob, tenant) -> None:
    qs = _unlicensed_microsoft_users()
    if job.candidate_ids:
        qs = qs.filter(id__in=job.candidate_ids)
    results = []
    succeeded = failed = skipped = 0
    for user in qs:
        evaluation = evaluate_unlicensed_user_candidate(user, tenant)
        if evaluation["status"] not in REPAIRABLE_LICENSE_STATUSES:
            skipped += 1
            results.append(
                {"id": user.id, "status": "skipped", "detail": evaluation["detail"]}
            )
            continue
        try:
            outcome = assign_license_to_user(user, tenant)
            succeeded += 1
            results.append(
                {
                    "id": user.id,
                    "status": outcome["status"],
                    "detail": f"microsoft_id={outcome.get('microsoft_id')}",
                }
            )
        except (ValidationError, Exception) as exc:  # noqa: BLE001
            failed += 1
            results.append({"id": user.id, "status": "failed", "detail": str(exc)[:500]})
            logger.exception("License assignment failed for user %s", user.id)
        time.sleep(_MS_GRAPH_MUTATION_GAP_SEC)
        _persist_progress(job, succeeded, failed, skipped, results)
    _finalize(job, succeeded, failed, skipped, results)


def _repair_courses(job: MicrosoftRepairJob, tenant) -> None:
    qs = _missing_group_courses().select_related("category")
    if job.candidate_ids:
        qs = qs.filter(id__in=job.candidate_ids)
    results = []
    succeeded = failed = skipped = 0
    for course in qs:
        evaluation = evaluate_course_candidate(course, tenant)
        if evaluation["status"] not in REPAIRABLE_STATUSES:
            skipped += 1
            results.append(
                {"id": course.id, "status": "skipped", "detail": evaluation["detail"]}
            )
            continue
        try:
            outcome = provision_course_team_for(course, tenant)
            succeeded += 1
            results.append(
                {"id": course.id, "status": outcome["status"],
                 "detail": f"microsoft_group_id={outcome.get('microsoft_group_id')}"}
            )
        except (ValidationError, Exception) as exc:  # noqa: BLE001
            failed += 1
            results.append({"id": course.id, "status": "failed", "detail": str(exc)[:500]})
            logger.exception("Repair failed for course %s", course.id)
        time.sleep(_MS_GRAPH_MUTATION_GAP_SEC)
        _persist_progress(job, succeeded, failed, skipped, results)
    _finalize(job, succeeded, failed, skipped, results)


def _repair_scope_team_owners(job: MicrosoftRepairJob, tenant) -> None:
    candidates = scan_scope_team_owner_candidates(tenant)
    if job.candidate_ids:
        allowed = {str(x) for x in job.candidate_ids}
        candidates = [c for c in candidates if c["candidate_key"] in allowed]

    results = []
    succeeded = failed = skipped = 0
    for candidate in candidates:
        if candidate["status"] not in SCOPE_OWNER_REPAIRABLE:
            skipped += 1
            results.append(
                {
                    "id": candidate["candidate_key"],
                    "status": "skipped",
                    "detail": candidate["detail"],
                }
            )
            continue

        course = Course.objects.filter(id=candidate["course_id"]).first()
        user = User.objects.filter(id=candidate["id"]).first()
        if course is None or user is None:
            skipped += 1
            results.append(
                {
                    "id": candidate["candidate_key"],
                    "status": "skipped",
                    "detail": "Course or user no longer exists.",
                }
            )
            continue

        try:
            reconcile_scope_owner_for_user_course(user, course, tenant)
            succeeded += 1
            results.append(
                {
                    "id": candidate["candidate_key"],
                    "status": "succeeded",
                    "detail": f"Added scope owner user_id={user.id} course_id={course.id}",
                }
            )
        except (ValidationError, Exception) as exc:  # noqa: BLE001
            failed += 1
            results.append(
                {
                    "id": candidate["candidate_key"],
                    "status": "failed",
                    "detail": str(exc)[:500],
                }
            )
            logger.exception(
                "Scope team owner repair failed user_id=%s course_id=%s",
                user.id,
                course.id,
            )
        time.sleep(_MS_GRAPH_MUTATION_GAP_SEC)
        _persist_progress(job, succeeded, failed, skipped, results)
    _finalize(job, succeeded, failed, skipped, results)


def _persist_progress(job, succeeded, failed, skipped, results) -> None:
    job.succeeded = succeeded
    job.failed = failed
    job.skipped = skipped
    job.results = results
    job.total = succeeded + failed + skipped
    job.save(update_fields=["succeeded", "failed", "skipped", "results", "total", "updated_at"])


def _finalize(job, succeeded, failed, skipped, results) -> None:
    job.succeeded = succeeded
    job.failed = failed
    job.skipped = skipped
    job.results = results
    job.total = succeeded + failed + skipped
    job.finished_at = timezone.now()
    if failed and succeeded:
        job.status = MicrosoftRepairJob.Status.PARTIAL
    elif failed and not succeeded:
        job.status = MicrosoftRepairJob.Status.FAILED
    else:
        job.status = MicrosoftRepairJob.Status.SUCCEEDED
    job.save()


@django_q_task
@tenant_async(entity=MicrosoftRepairJob)
def run_repair_job(job, tenant, send_welcome_emails=False):
    if job is None:
        return
    job.status = MicrosoftRepairJob.Status.RUNNING
    job.started_at = timezone.now()
    job.save(update_fields=["status", "started_at", "updated_at"])
    try:
        if job.target_type == MicrosoftRepairJob.TargetType.USERS:
            _repair_users(job, tenant)
        elif job.target_type == MicrosoftRepairJob.TargetType.UNLICENSED_USERS:
            _repair_unlicensed_users(job, tenant)
        elif job.target_type == MicrosoftRepairJob.TargetType.SCOPE_TEAM_OWNERS:
            _repair_scope_team_owners(job, tenant)
        else:
            _repair_courses(job, tenant)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Repair job %s crashed", job.id)
        job.status = MicrosoftRepairJob.Status.FAILED
        job.error_message = str(exc)[:1000]
        job.finished_at = timezone.now()
        job.save()
        return

    if (
        send_welcome_emails
        and job.target_type == MicrosoftRepairJob.TargetType.USERS
        and job.candidate_ids
    ):
        from app_auth.import_welcome import send_import_welcome_emails

        send_import_welcome_emails(tenant, list(job.candidate_ids))

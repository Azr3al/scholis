"""Superadmin Tools endpoints: Microsoft bulk repair (dry-run + async) and health."""

from rest_framework.request import Request
from tenant_schemas.utils import schema_context

from app_microsoft.models import MicrosoftRepairJob
from app_microsoft.provisioning import (
    REPAIRABLE_LICENSE_STATUSES,
    tenant_microsoft_config_blockers,
)
from app_microsoft.password_reset_bulk import (
    BulkPasswordResetError,
    cancel_password_reset_job,
    commit_emails,
    preview_emails,
    start_password_reset_job,
)
from app_microsoft.repair import (
    dry_run,
    scan_course_candidates,
    scan_scope_team_owner_candidates,
    scan_unlicensed_user_candidates,
    scan_user_candidates,
    start_repair_job,
    summarize_candidates,
    SCOPE_OWNER_REPAIRABLE,
)
from app_organization.permissions import RequiresPlatformAdminTenant
from app_organization.target_tenant import resolve_target_organization
from app_rbac.views import RBACPermission, RBACView
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication

VALID_TARGET_TYPES = {
    MicrosoftRepairJob.TargetType.USERS,
    MicrosoftRepairJob.TargetType.COURSES,
    MicrosoftRepairJob.TargetType.SCOPE_TEAM_OWNERS,
}


def serialize_repair_job(job: MicrosoftRepairJob, *, include_results: bool = True) -> dict:
    data = {
        "id": job.id,
        "target_type": job.target_type,
        "status": job.status,
        "total": job.total,
        "succeeded": job.succeeded,
        "failed": job.failed,
        "skipped": job.skipped,
        "candidate_ids": job.candidate_ids,
        "created_by": job.created_by_id,
        "created_at": job.created_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "error_message": job.error_message,
    }
    if include_results:
        data["results"] = job.results
    return data


class _MicrosoftToolsBaseView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresPlatformAdminTenant]

    def _require_microsoft_on(self, tenant):
        if not getattr(tenant, "is_microsoft_on", False):
            return self.bad_request(
                "Microsoft integration is not enabled for this organization."
            )
        return None


class MicrosoftRepairDryRunView(_MicrosoftToolsBaseView):
    """POST microsoft/repair/dry-run {target_type, organization_id} — scan repairable/blocked records."""

    required_permissions = {"POST": "microsoft.repair"}

    def post(self, request: Request):
        target = resolve_target_organization(request)
        blocked = self._require_microsoft_on(target)
        if blocked is not None:
            return blocked
        target_type = (request.data or {}).get("target_type")
        if target_type not in VALID_TARGET_TYPES:
            return self.bad_request(
                f"target_type must be one of: {', '.join(sorted(VALID_TARGET_TYPES))}."
            )
        with schema_context(target.schema_name):
            result = dry_run(target, target_type)
        return self.ok(result)


class MicrosoftRepairJobListCreateView(_MicrosoftToolsBaseView):
    """GET list recent jobs; POST {target_type, candidate_ids?, organization_id} to start an async repair."""

    required_permissions = {"GET": "microsoft.repair", "POST": "microsoft.repair"}

    def get(self, request: Request):
        target = resolve_target_organization(request)
        limit = min(int(request.query_params.get("limit", 20)), 100)
        with schema_context(target.schema_name):
            jobs = list(MicrosoftRepairJob.objects.all()[:limit])
        return self.ok([serialize_repair_job(j, include_results=False) for j in jobs])

    def post(self, request: Request):
        target = resolve_target_organization(request)
        blocked = self._require_microsoft_on(target)
        if blocked is not None:
            return blocked
        body = request.data or {}
        target_type = body.get("target_type")
        if target_type not in VALID_TARGET_TYPES:
            return self.bad_request(
                f"target_type must be one of: {', '.join(sorted(VALID_TARGET_TYPES))}."
            )
        candidate_ids = body.get("candidate_ids") or []
        if candidate_ids and not isinstance(candidate_ids, list):
            return self.bad_request("candidate_ids must be a list of ids.")
        # Platform-admin actor lives on the admin tenant; avoid a cross-schema
        # User FK into the customer tenant's microsoft_repairjob table.
        with schema_context(target.schema_name):
            job = start_repair_job(target, target_type, candidate_ids, None)
            payload = serialize_repair_job(job)
        return self.created(payload)


class MicrosoftRepairJobDetailView(_MicrosoftToolsBaseView):
    """GET microsoft/repair/jobs/<id>?organization_id= — job progress + per-record results."""

    required_permissions = {"GET": "microsoft.repair"}

    def get(self, request: Request, job_id: int):
        target = resolve_target_organization(request)
        with schema_context(target.schema_name):
            job = MicrosoftRepairJob.objects.filter(id=job_id).first()
            if job is None:
                return self.not_found("No such repair job.")
            payload = serialize_repair_job(job)
        return self.ok(payload)


class MicrosoftPasswordResetPreviewView(_MicrosoftToolsBaseView):
    """POST microsoft/password-reset/preview — resolve emails, no Graph calls."""

    required_permissions = {"POST": "microsoft.repair"}

    def post(self, request: Request):
        target = resolve_target_organization(request)
        blocked = self._require_microsoft_on(target)
        if blocked is not None:
            return blocked
        emails = (request.data or {}).get("emails")
        try:
            with schema_context(target.schema_name):
                result = preview_emails(target, emails)
        except BulkPasswordResetError as exc:
            return self.bad_request(exc.args[0], message=exc.code)
        return self.ok(result)


class MicrosoftPasswordResetCommitView(_MicrosoftToolsBaseView):
    """POST microsoft/password-reset/commit — reset eligible Entra passwords."""

    required_permissions = {"POST": "microsoft.repair"}

    def post(self, request: Request):
        target = resolve_target_organization(request)
        blocked = self._require_microsoft_on(target)
        if blocked is not None:
            return blocked
        emails = (request.data or {}).get("emails")
        password = (request.data or {}).get("password")
        try:
            with schema_context(target.schema_name):
                result = commit_emails(target, emails, password)
        except BulkPasswordResetError as exc:
            return self.bad_request(exc.args[0], message=exc.code)
        return self.ok(result)


class MicrosoftPasswordResetJobCreateView(_MicrosoftToolsBaseView):
    """POST microsoft/password-reset/jobs — start an async bulk password reset."""

    required_permissions = {"POST": "microsoft.repair"}

    def post(self, request: Request):
        target = resolve_target_organization(request)
        blocked = self._require_microsoft_on(target)
        if blocked is not None:
            return blocked
        emails = (request.data or {}).get("emails")
        password = (request.data or {}).get("password")
        try:
            with schema_context(target.schema_name):
                # Platform-admin actor lives on the admin tenant; avoid a
                # cross-schema User FK into the customer tenant's job table.
                job = start_password_reset_job(target, emails, password)
                payload = serialize_repair_job(job)
        except BulkPasswordResetError as exc:
            return self.bad_request(exc.args[0], message=exc.code)
        return self.created(payload)


class MicrosoftPasswordResetJobDetailView(_MicrosoftToolsBaseView):
    """GET microsoft/password-reset/jobs/<id>?organization_id= — progress + results."""

    required_permissions = {"GET": "microsoft.repair"}

    def get(self, request: Request, job_id: int):
        target = resolve_target_organization(request)
        with schema_context(target.schema_name):
            job = MicrosoftRepairJob.objects.filter(
                id=job_id,
                target_type=MicrosoftRepairJob.TargetType.PASSWORD_RESET,
            ).first()
            if job is None:
                return self.not_found("No such password reset job.")
            payload = serialize_repair_job(job)
        return self.ok(payload)


class MicrosoftPasswordResetJobCancelView(_MicrosoftToolsBaseView):
    """POST microsoft/password-reset/jobs/<id>/cancel — stop a pending/running reset."""

    required_permissions = {"POST": "microsoft.repair"}

    def post(self, request: Request, job_id: int):
        target = resolve_target_organization(request)
        with schema_context(target.schema_name):
            job, err = cancel_password_reset_job(job_id)
            if err is not None:
                return self.not_found(err)
            payload = serialize_repair_job(job)
        return self.ok(payload)


class MicrosoftHealthView(_MicrosoftToolsBaseView):
    """GET microsoft/health?organization_id= — aggregate provisioning health for Superadmin Tools."""

    required_permissions = {"GET": "microsoft.configure"}

    def get(self, request: Request):
        target = resolve_target_organization(request)
        with schema_context(target.schema_name):
            user_candidates = scan_user_candidates(target)
            course_candidates = scan_course_candidates(target)
            unlicensed_candidates = scan_unlicensed_user_candidates(target)
            recent_jobs = list(MicrosoftRepairJob.objects.all()[:10])
            payload = {
                "is_microsoft_on": getattr(target, "is_microsoft_on", False),
                "is_teams_creation_enabled": getattr(
                    target, "is_teams_creation_enabled", True
                ),
                "is_teams_attendance_sync_enabled": getattr(
                    target, "is_teams_attendance_sync_enabled", False
                ),
                "config_blockers": tenant_microsoft_config_blockers(target),
                "users": summarize_candidates(user_candidates),
                "courses": summarize_candidates(course_candidates),
                "unlicensed_users": summarize_candidates(
                    unlicensed_candidates,
                    repairable_statuses=REPAIRABLE_LICENSE_STATUSES,
                ),
                "scope_team_owners": summarize_candidates(
                    scan_scope_team_owner_candidates(target),
                    repairable_statuses=SCOPE_OWNER_REPAIRABLE,
                ),
                "recent_jobs": [
                    serialize_repair_job(j, include_results=False) for j in recent_jobs
                ],
            }
        return self.ok(payload)

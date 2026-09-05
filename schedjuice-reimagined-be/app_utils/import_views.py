from django.conf import settings

from app_auth.import_commit import (
    commit_import_rows,
    dedupe_prepared_rows,
    validate_import_rows,
)
from app_auth.import_welcome import send_import_welcome_emails
from app_auth.import_fields import build_import_fields
from app_auth.models import User
from app_microsoft.models import MicrosoftRepairJob
from app_microsoft.repair import (
    is_import_provisioning_job,
    serialize_import_provisioning_job,
    start_repair_job,
)
from app_rbac.views import RBACView
from app_utils.import_parse import parse_import_file
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication


class ImportParseView(RBACView):
    name = "Import parse view"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "user.import"}

    def post(self, request):
        upload = request.FILES.get("file")
        if upload is None:
            return self.bad_request(message="No file uploaded.")
        if upload.size and upload.size > settings.IMPORT_PARSE_MAX_BYTES:
            return self.bad_request(message="File is too large.")
        sheet = request.data.get("sheet") or None
        try:
            result = parse_import_file(
                upload.file,
                filename=upload.name,
                sheet=sheet,
                max_rows=settings.IMPORT_PARSE_MAX_ROWS,
            )
        except ValueError as exc:
            return self.bad_request(message=str(exc))
        except Exception:
            return self.bad_request(
                message="Could not read the file. Make sure it is a valid .xlsx or .csv file."
            )
        return self.ok(result)


class ImportFieldsView(RBACView):
    name = "Import fields view"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "user.import"}

    def get(self, request):
        entity = request.query_params.get("entity", "users")
        if entity != "users":
            return self.bad_request(message="Only the users entity is supported.")
        role = request.query_params.get("role", "student")
        fields = build_import_fields(role=role)
        return self.ok(fields)


class ImportCommitView(RBACView):
    name = "Import commit view"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "user.import"}

    def post(self, request):
        role = request.data.get("role") or "student"
        rows = request.data.get("rows")
        if not isinstance(rows, list) or not rows:
            return self.bad_request(message="No rows to import.")
        errors, prepared = validate_import_rows(rows=rows, role=role)
        if errors:
            return self.bad_request(
                details={"errors": errors},
                message="Some rows are invalid. Nothing was imported.",
            )
        strategy = request.data.get("duplicate_strategy") or "keep_first"
        prepared = dedupe_prepared_rows(prepared, strategy=strategy)
        send_welcome_emails = bool(request.data.get("send_welcome_emails"))
        result = commit_import_rows(prepared=prepared, role=role)

        created_user_ids = result.pop("created_user_ids", [])
        microsoft_job_id = None
        if (
            request.tenant.is_microsoft_on
            and created_user_ids
        ):
            actor = User.get_user_from_request(request)
            job = start_repair_job(
                request.tenant,
                MicrosoftRepairJob.TargetType.USERS,
                created_user_ids,
                actor,
                send_welcome_emails=send_welcome_emails,
            )
            microsoft_job_id = job.id
        elif send_welcome_emails and created_user_ids:
            send_import_welcome_emails(request.tenant, created_user_ids)
        result["microsoft_job_id"] = microsoft_job_id

        return self.ok(result)


class ImportMicrosoftJobStatusView(RBACView):
    name = "Import Microsoft job status view"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "user.import"}

    def get(self, request, job_id: int):
        job = MicrosoftRepairJob.objects.filter(id=job_id).first()
        if job is None or not is_import_provisioning_job(job):
            return self.not_found("No such import provisioning job.")
        return self.ok(serialize_import_provisioning_job(job))

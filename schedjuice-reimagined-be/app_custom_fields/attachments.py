"""Upload and download-url endpoints for custom-field attachment values."""

from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import Request

from app_attachment.models import Attachment
from app_attachment.validation import validate_custom_field_attachment_upload
from app_attachment.views import get_presigned_url
from app_auth.models import User
from app_course.course_scoping import acting_user
from app_custom_fields.attachment_rules import (
    CUSTOM_FIELD_ATTACHMENT_TABLE,
    MIME_TO_EXTENSIONS,
    max_file_size_bytes,
    resolve_allowed_mimes_and_extensions,
)
from app_custom_fields.constants import (
    ALLOWED_DEFINITION_ENTITY_TYPES,
    ENTITY_TYPE_COURSE,
    ENTITY_TYPE_USER,
    FILLED_BY_ADMIN,
    FILLED_BY_USER,
)
from app_custom_fields.models import CustomFieldAttachment, FieldDefinition
from app_rbac.resolution import effective_permissions
from app_rbac.views import RBACView
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication


def _load_attachment_definition(entity_type: str, field_key: str) -> FieldDefinition:
    if entity_type not in ALLOWED_DEFINITION_ENTITY_TYPES:
        raise DRFValidationError({"entity_type": "Unsupported entity type."})
    defn = FieldDefinition.objects.filter(
        entity_type=entity_type,
        field_key=field_key,
        is_active=True,
    ).first()
    if defn is None:
        raise DRFValidationError({"field_key": "Unknown custom field."})
    if defn.field_type != FieldDefinition.FieldType.ATTACHMENT:
        raise DRFValidationError({"field_key": "Field is not an attachment type."})
    return defn


def _actor_may_upload(defn: FieldDefinition, actor_user: User | None, actor: str) -> None:
    if actor == FILLED_BY_USER and defn.filled_by == FILLED_BY_ADMIN:
        raise DRFValidationError(
            {"field_key": "This field can only be set by staff."}
        )
    if actor_user is None:
        raise DRFValidationError("Authentication required.")


def _attachment_ids_in_user_custom_data(user: User) -> set[int]:
    data = user.custom_data or {}
    ids: set[int] = set()
    for defn in FieldDefinition.objects.filter(
        entity_type=ENTITY_TYPE_USER,
        field_type=FieldDefinition.FieldType.ATTACHMENT,
        is_active=True,
    ):
        for item in data.get(defn.field_key) or []:
            if isinstance(item, dict) and item.get("id") is not None:
                try:
                    ids.add(int(item["id"]))
                except (TypeError, ValueError):
                    continue
    return ids


def _user_may_download_attachment(
    *,
    attachment_id: int,
    actor_user: User,
    link: CustomFieldAttachment,
) -> bool:
    if link.uploaded_by_id == actor_user.id:
        return True
    if attachment_id in _attachment_ids_in_user_custom_data(actor_user):
        return True
    held = effective_permissions(actor_user)
    if link.entity_type == ENTITY_TYPE_USER and "user.view" in held:
        return True
    if link.entity_type == ENTITY_TYPE_COURSE and "course.view" in held:
        return True
    return False


def upload_custom_field_attachments(
    *,
    entity_type: str,
    field_key: str,
    files,
    actor_user: User,
    actor: str,
) -> list[dict]:
    defn = _load_attachment_definition(entity_type, field_key)
    _actor_may_upload(defn, actor_user, actor)

    file_list = list(files or [])
    max_files = int((defn.validation_rules or {}).get("max_files") or 1)
    if len(file_list) > max_files:
        raise DRFValidationError({"file": f"At most {max_files} file(s) per request."})
    if not file_list:
        raise DRFValidationError({"file": "At least one file is required."})

    allowed_mimes, allowed_extensions = resolve_allowed_mimes_and_extensions(
        defn.validation_rules
    )
    max_bytes = max_file_size_bytes(defn.validation_rules)
    saved: list[dict] = []

    with transaction.atomic():
        for uploaded in file_list:
            filename = getattr(uploaded, "name", "") or "upload"
            try:
                detected_mime = validate_custom_field_attachment_upload(
                    uploaded,
                    filename,
                    max_bytes=max_bytes,
                    allowed_mimes=allowed_mimes,
                    allowed_extensions=allowed_extensions,
                    mime_to_extensions=MIME_TO_EXTENSIONS,
                )
            except DjangoValidationError as exc:
                detail = exc.message_dict if hasattr(exc, "message_dict") else {"file": exc.messages}
                raise DRFValidationError(detail) from exc

            size = getattr(uploaded, "size", 0) or 0
            att = Attachment.objects.create(
                filename=filename,
                is_image=detected_mime.startswith("image/"),
                data=uploaded,
                file_type=detected_mime,
                size=size,
                table_name=CUSTOM_FIELD_ATTACHMENT_TABLE,
            )
            CustomFieldAttachment.objects.create(
                attachment=att,
                entity_type=entity_type,
                field_key=field_key,
                uploaded_by=actor_user,
            )
            saved.append(
                {
                    "id": att.id,
                    "filename": att.filename,
                    "file_type": att.file_type,
                    "size": att.size,
                }
            )
    return saved


class CustomFieldAttachmentUploadView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, *RBACView.permission_classes]

    def post(self, request: Request):
        entity_type = request.data.get("entity_type")
        field_key = request.data.get("field_key")
        if not entity_type or not field_key:
            return self.bad_request("entity_type and field_key are required.")

        files = request.FILES.getlist("file")
        if not files:
            files = request.FILES.getlist("files")

        actor_user = acting_user(request) if request is not None else None
        held = effective_permissions(request.user)
        actor = (
            "admin"
            if held & {"user.update", "form.manage"}
            else FILLED_BY_USER
        )

        try:
            saved = upload_custom_field_attachments(
                entity_type=entity_type,
                field_key=field_key,
                files=files,
                actor_user=actor_user,
                actor=actor,
            )
        except DRFValidationError as exc:
            return self.send_response(True, "error", {"errors": exc.detail}, status=400)

        for row in saved:
            att = Attachment.objects.filter(pk=row["id"]).first()
            if att and att.data:
                row["download_url"] = get_presigned_url(
                    att.data, att.filename, att.file_type or "application/octet-stream"
                )

        return self.send_response(False, "success", {"data": saved})


class CustomFieldAttachmentDownloadUrlView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, *RBACView.permission_classes]

    def get(self, request: Request, attachment_id: int):
        actor_user = acting_user(request)
        if actor_user is None:
            return self.send_response(True, "error", {"errors": "Authentication required."}, status=401)

        link = (
            CustomFieldAttachment.objects.select_related("attachment")
            .filter(attachment_id=attachment_id)
            .first()
        )
        if link is None or link.attachment.is_deleted:
            return self.send_not_found(attachment_id)

        if not _user_may_download_attachment(
            attachment_id=attachment_id,
            actor_user=actor_user,
            link=link,
        ):
            return self.send_not_found(attachment_id)

        att = link.attachment
        url = get_presigned_url(
            att.data,
            att.filename,
            att.file_type or "application/octet-stream",
        )
        if not url:
            return self.send_response(True, "error", {"errors": "File unavailable."}, status=404)
        return self.ok({"url": url})

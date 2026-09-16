import json

from rest_framework.exceptions import PermissionDenied
from rest_framework.request import Request

from app_announcement import models
from app_announcement.attachment_helpers import (
    claim_inline_attachments,
    delete_orphan_staging_attachments,
    parse_inline_attachment_ids,
)
from app_course.course_scoping import acting_user
from app_microsoft.announcement_helpers import schedule_announcement_teams_sync


def parse_multipart_announcement_data(data):
    """Parse form data (strings) into announcement-compatible dict."""

    def _bool(v):
        return str(v).lower() in ("true", "1", "yes")

    def _json(v):
        return json.loads(v) if isinstance(v, str) else v

    result = {
        k: data[k]
        for k in ("title", "data", "html_data", "post_type")
        if data.get(k) is not None and data.get(k) != ""
    }
    if "finished_unit" in data:
        raw_finished_unit = data.get("finished_unit")
        if raw_finished_unit in (None, ""):
            result["finished_unit"] = None
        else:
            try:
                result["finished_unit"] = int(raw_finished_unit)
            except (ValueError, TypeError):
                pass
    for k, parser in [
        ("course", lambda v: int(v) if v else None),
        ("course_filters", lambda v: _json(v) if v else None),
    ]:
        if k in data:
            try:
                val = parser(data[k])
                if val is not None:
                    result[k] = val
            except (json.JSONDecodeError, ValueError, TypeError):
                pass
    for k in ("is_pinned", "send_to_microsoft"):
        if k in data:
            result[k] = _bool(data[k])
    if data.get("microsoft_channel_id") not in (None, ""):
        result["microsoft_channel_id"] = str(data["microsoft_channel_id"]).strip()
    return result


def parse_deleted_attachment_ids(data) -> list[int]:
    raw_list = []
    if hasattr(data, "getlist"):
        raw_list = data.getlist("deleted_attachment_ids") or []
    if not raw_list and data.get("deleted_attachment_ids") not in (None, ""):
        raw = data.get("deleted_attachment_ids")
        if isinstance(raw, str):
            try:
                parsed = json.loads(raw)
                raw_list = parsed if isinstance(parsed, list) else [parsed]
            except json.JSONDecodeError:
                raw_list = [raw]
        else:
            raw_list = [raw]
    result: list[int] = []
    for item in raw_list:
        try:
            result.append(int(item))
        except (TypeError, ValueError):
            continue
    return result


def get_upload_files_from_request(request: Request) -> list:
    return (
        request.FILES.getlist("files")
        or request.FILES.getlist("attachments")
        or []
    )


def apply_upload_files_to_announcement(instance, files) -> None:
    for uploaded in files:
        if hasattr(uploaded, "seek"):
            uploaded.seek(0)
        models.AnnouncementAttachment.objects.create(
            announcement=instance,
            file=uploaded,
            filename=uploaded.name or "unnamed",
        )


def apply_announcement_attachment_mutations(request, instance) -> None:
    deleted_ids = parse_deleted_attachment_ids(request.data)
    if deleted_ids:
        models.AnnouncementAttachment.objects.filter(
            announcement_id=instance.id,
            id__in=deleted_ids,
        ).delete()
    apply_upload_files_to_announcement(instance, get_upload_files_from_request(request))


def claim_inline_attachments_for_instance(request, instance) -> None:
    if instance.course_id is None:
        return
    actor = acting_user(request)
    if actor is None:
        return
    try:
        claim_inline_attachments(
            announcement=instance,
            html_data=instance.html_data,
            user=actor,
            course_id=instance.course_id,
        )
        delete_orphan_staging_attachments(
            user=actor,
            course_id=instance.course_id,
            exclude_ids=set(parse_inline_attachment_ids(instance.html_data)),
        )
    except PermissionError as exc:
        raise PermissionDenied(str(exc)) from exc


def finalize_multipart_announcement_create(request, instance, serializer_class):
    """Apply attachments, inline claims, and Teams sync after serializer save."""
    apply_announcement_attachment_mutations(request, instance)
    claim_inline_attachments_for_instance(request, instance)
    tenant = getattr(request, "tenant", None)
    if tenant and instance.send_to_microsoft:
        schedule_announcement_teams_sync(instance, tenant)
    instance.refresh_from_db()
    return serializer_class(instance).data

from __future__ import annotations

from django.db import transaction
from rest_framework.exceptions import ValidationError

from app_auth.models import User
from app_course.models import Course
from app_userlog import models

ATTACHMENT_TABLE = "app_userlog_logentry"


def _is_staff_user(user: User) -> bool:
    return bool(set(user.roles or []) - {User.UserRole.STUDENT})


def _is_student_user(user: User) -> bool:
    return User.UserRole.STUDENT in (user.roles or [])


def check_applies_to(report_type: models.ReportType, subject: User) -> None:
    a = report_type.applies_to
    if a == models.ReportType.AppliesTo.BOTH:
        return
    if a == models.ReportType.AppliesTo.STUDENT and not _is_student_user(subject):
        raise ValidationError(
            {"report_type": "This report type only applies to students."}
        )
    if a == models.ReportType.AppliesTo.STAFF and not _is_staff_user(subject):
        raise ValidationError(
            {"report_type": "This report type only applies to staff."}
        )


def validate_field_values(report_type: models.ReportType, values: dict) -> dict:
    """Validate `values` against the report type's schema. Returns the cleaned dict."""
    values = values or {}
    cleaned: dict = {}
    errors: dict = {}
    for field in report_type.fields.all():
        key = field.field_key
        raw = values.get(key)
        present = raw not in (None, "", [])
        if field.is_required and not present:
            errors[key] = "This field is required."
            continue
        if not present:
            continue
        if field.field_type == models.ReportTypeField.FieldType.STAFF_USER_FK:
            target = User.objects.filter(pk=raw).first()
            if target is None:
                errors[key] = "User not found."
            elif not _is_staff_user(target):
                errors[key] = "Must reference a staff user."
            else:
                cleaned[key] = target.id
        elif field.field_type == models.ReportTypeField.FieldType.COURSE_FK:
            if not Course.objects.filter(pk=raw).exists():
                errors[key] = "Course not found."
            else:
                cleaned[key] = raw
        else:
            cleaned[key] = raw
    if errors:
        raise ValidationError({"field_values": errors})
    return cleaned


def _attachment_ids(entry: models.LogEntry) -> list[int]:
    from app_attachment.models import Attachment

    return list(
        Attachment.objects.filter(
            table_name=ATTACHMENT_TABLE, foreign_key=entry.id, is_deleted=False
        ).values_list("id", flat=True)
    )


def _snapshot(entry: models.LogEntry) -> dict:
    return {
        "title": entry.title,
        "body": entry.body,
        "report_type_id": entry.report_type_id,
        "field_values": entry.field_values,
        "attachment_ids": _attachment_ids(entry),
    }


def _record_version(entry: models.LogEntry, editor, change_summary: str) -> None:
    last = entry.versions.order_by("-version_no").first()
    next_no = (last.version_no + 1) if last else 1
    models.LogEntryVersion.objects.create(
        entry=entry,
        version_no=next_no,
        editor=editor,
        snapshot=_snapshot(entry),
        change_summary=change_summary,
    )


def _record_event(entry, actor, event_type, level, payload=None) -> None:
    models.LogEntryEvent.objects.create(
        entry=entry,
        actor=actor,
        event_type=event_type,
        level=level,
        payload=payload or {},
    )


@transaction.atomic
def create_entry(*, subject, report_type, title, body, field_values, author):
    check_applies_to(report_type, subject)
    cleaned = validate_field_values(report_type, field_values)
    entry = models.LogEntry.objects.create(
        subject=subject,
        report_type=report_type,
        title=title,
        body=body or "",
        field_values=cleaned,
        author=author,
    )
    _record_version(entry, author, "created")
    _record_event(
        entry,
        author,
        models.LogEntryEvent.EventType.CREATED,
        models.LogEntryEvent.Level.MAJOR,
    )
    return entry


@transaction.atomic
def update_entry(entry: models.LogEntry, *, actor, data: dict):
    changed = []
    level = models.LogEntryEvent.Level.DETAIL

    if "report_type" in data and data["report_type"].id != entry.report_type_id:
        check_applies_to(data["report_type"], entry.subject)
        entry.report_type = data["report_type"]
        changed.append("type")
        level = models.LogEntryEvent.Level.MAJOR
    if "title" in data and data["title"] != entry.title:
        entry.title = data["title"]
        changed.append("title")
    if "body" in data and data["body"] != entry.body:
        entry.body = data["body"]
        changed.append("body")
    if "field_values" in data:
        cleaned = validate_field_values(entry.report_type, data["field_values"])
        if cleaned != entry.field_values:
            entry.field_values = cleaned
            changed.append("fields")

    if not changed:
        return entry

    entry.save()
    summary = "edited " + ", ".join(changed)
    _record_version(entry, actor, summary)
    _record_event(
        entry,
        actor,
        models.LogEntryEvent.EventType.EDITED,
        level,
        {"changed": changed},
    )
    return entry


@transaction.atomic
def soft_delete_entry(entry: models.LogEntry, *, actor):
    entry.is_deleted = True
    entry.save(update_fields=["is_deleted", "updated_at"])
    _record_event(
        entry,
        actor,
        models.LogEntryEvent.EventType.DELETED,
        models.LogEntryEvent.Level.MAJOR,
    )
    return entry

from __future__ import annotations

from django.db import models
from django.db import transaction
from rest_framework.exceptions import PermissionDenied, ValidationError

from app_attendance.attendance_scoping import (
    check_course_attendance_access,
    require_teacher_checkin_cancellation_enabled,
)
from app_attendance.change_history import record_attendance_change_event
from app_attendance.models import AttendanceChangeEvent, UserEvent
from app_attendance.self_correction import MAX_REASON_LENGTH, _image_audit_value
from app_auth.models import User


class CancelReason(models.TextChoices):
    STUDENT_NO_SHOW = "student_no_show", "Student did not show up"
    CHECKED_IN_BY_MISTAKE = "checked_in_by_mistake", "Checked in by mistake"
    OTHER = "other", "Other"


PAYROLL_SNAPSHOT_FIELDS = (
    "hourly_rate_at_calculation",
    "student_bonus_rate_at_calculation",
    "student_count_in_course_at_calculation",
    "per_hour_price_at_calculation",
    "event_time_from_at_calculation",
    "event_time_to_at_calculation",
)


def _serialize_dt(value) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def _validate_cancel_reason(*, reason_code: str, note: str | None) -> tuple[str, str | None]:
    valid_codes = {choice.value for choice in CancelReason}
    if reason_code not in valid_codes:
        raise ValidationError({"reason_code": "Invalid cancellation reason."})

    normalized_note = None
    if note is not None:
        stripped = str(note).strip()
        normalized_note = stripped if stripped else None

    if reason_code == CancelReason.OTHER:
        if not normalized_note:
            raise ValidationError({"note": "A note is required when reason is Other."})
        if len(normalized_note) > MAX_REASON_LENGTH:
            raise ValidationError(
                {"note": f"Note must be at most {MAX_REASON_LENGTH} characters."}
            )
    elif normalized_note and len(normalized_note) > MAX_REASON_LENGTH:
        raise ValidationError(
            {"note": f"Note must be at most {MAX_REASON_LENGTH} characters."}
        )

    return reason_code, normalized_note


def resolve_cancel_checkin_source(request) -> str:
    client = (request.META.get("HTTP_X_SCHEDJUICE_CLIENT") or "").strip().lower()
    if client == "web":
        return AttendanceChangeEvent.Source.WEB_SESSION_CHECKIN
    return AttendanceChangeEvent.Source.MOBILE_SESSION_CHECKIN


def cancel_open_checkin(
    *,
    user_event: UserEvent,
    actor: User,
    tenant,
    reason_code: str,
    note: str | None = None,
    source: str = AttendanceChangeEvent.Source.MOBILE_SESSION_CHECKIN,
) -> UserEvent:
    require_teacher_checkin_cancellation_enabled(tenant)

    if not actor.is_teacher():
        raise PermissionDenied("Only teachers can cancel session check-in.")

    if user_event.user_id != actor.id:
        raise PermissionDenied("You can only cancel your own check-in records.")

    check_course_attendance_access(actor, user_event.event.course_id)

    reason_code, normalized_note = _validate_cancel_reason(
        reason_code=reason_code,
        note=note,
    )

    if user_event.checkin_time is None:
        raise ValidationError({"details": "No open check-in to cancel."})

    if user_event.checkout_time is not None:
        raise ValidationError({"details": "Cannot cancel a completed check-in session."})

    changes = [
        {
            "field": "checkin_time",
            "from": _serialize_dt(user_event.checkin_time),
            "to": None,
        },
        {
            "field": "checkin_image",
            "from": _image_audit_value(user_event.checkin_image),
            "to": None,
        },
    ]

    with transaction.atomic():
        locked = (
            UserEvent.objects.select_for_update(of=("self",))
            .select_related("event", "event__course", "user")
            .get(pk=user_event.pk)
        )

        if locked.checkin_time is None or locked.checkout_time is not None:
            raise ValidationError({"details": "No open check-in to cancel."})

        record_attendance_change_event(
            user_event_id=locked.id,
            actor_id=actor.id,
            event_type=AttendanceChangeEvent.EventType.CHECKIN_CANCELLED,
            source=source,
            payload={
                "reason_code": reason_code,
                "note": normalized_note,
                "changes": changes,
            },
        )

        locked.checkin_time = None
        locked.checkin_image = None
        locked.is_extra_class = False
        for field in PAYROLL_SNAPSHOT_FIELDS:
            setattr(locked, field, None)

        update_fields = [
            "checkin_time",
            "checkin_image",
            "is_extra_class",
            "updated_at",
            *PAYROLL_SNAPSHOT_FIELDS,
        ]
        locked.save(update_fields=update_fields)

    locked.refresh_from_db()
    return locked

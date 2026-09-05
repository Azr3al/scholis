from __future__ import annotations

import os

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from app_attendance.change_history import record_attendance_change_event
from app_attendance.checkin_policy import (
    resolve_checkout_time,
    self_correction_error_message,
    validate_self_correction_times,
)
from app_attendance.models import AttendanceChangeEvent, UserEvent
from app_attendance.payroll_snapshots import freeze_teacher_payroll_snapshots
from app_attendance.attendance_scoping import (
    check_course_attendance_access,
    require_teacher_checkin_history_correction_enabled,
)
from app_auth.models import User
from app_rbac.resolution import effective_permissions


MIN_REASON_LENGTH = 10
MAX_REASON_LENGTH = 500
MAX_TODAY_ACTIVITIES_LENGTH = 2000

_UNSET = object()


def _serialize_dt(value) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def _validate_reason(raw_reason) -> str:
    if raw_reason is None:
        raise ValidationError({"correction_reason": "Correction reason is required."})
    reason = str(raw_reason).strip()
    if len(reason) < MIN_REASON_LENGTH:
        raise ValidationError(
            {
                "correction_reason": (
                    f"Correction reason must be at least {MIN_REASON_LENGTH} characters."
                )
            }
        )
    if len(reason) > MAX_REASON_LENGTH:
        raise ValidationError(
            {
                "correction_reason": (
                    f"Correction reason must be at most {MAX_REASON_LENGTH} characters."
                )
            }
        )
    return reason


def can_view_attendance_corrections(user: User, user_event: UserEvent) -> bool:
    if user_event.user_id == user.id:
        return True
    held = set(effective_permissions(user))
    return "attendance.manage_all" in held or "checkin.view_all" in held


def _image_audit_value(image) -> str | None:
    if not image:
        return None
    name = getattr(image, "name", None)
    if not name:
        return None
    base = os.path.basename(str(name)).strip()
    return base or None


def _normalize_today_activities(raw_value) -> str | None:
    if raw_value is None:
        return None
    stripped = str(raw_value).strip()
    if not stripped:
        return None
    if len(stripped) > MAX_TODAY_ACTIVITIES_LENGTH:
        raise ValidationError(
            {
                "today_activities": (
                    f"Today's activities must be at most {MAX_TODAY_ACTIVITIES_LENGTH} characters."
                )
            }
        )
    return stripped


def _serialize_activities_audit(value: str | None) -> str | None:
    if not value:
        return None
    return value


def _assert_can_correct_checkin(actor: User, user_event: UserEvent) -> None:
    held = set(effective_permissions(actor))

    if "attendance.manage_all" in held:
        check_course_attendance_access(actor, user_event.event.course_id)
        if not user_event.user.is_teacher():
            raise PermissionDenied(
                "Check-in correction applies to teacher records only."
            )
        return

    if "attendance.correct_own_checkin" not in held:
        raise PermissionDenied("Not allowed to correct check-in history.")

    if not actor.is_teacher():
        raise PermissionDenied("Only teachers can use self check-in correction.")

    if user_event.user_id != actor.id:
        raise PermissionDenied("You can only correct your own check-in records.")

    check_course_attendance_access(actor, user_event.event.course_id)


def apply_self_checkin_correction(
    *,
    user_event: UserEvent,
    actor: User,
    tenant,
    checkin_time=None,
    checkout_time=None,
    checkin_image=None,
    today_activities=_UNSET,
    correction_reason: str,
    unset_checkin: bool = False,
    unset_checkout: bool = False,
) -> UserEvent:
    require_teacher_checkin_history_correction_enabled(tenant)

    reason = _validate_reason(correction_reason)

    _assert_can_correct_checkin(actor, user_event)

    new_checkin = None if unset_checkin else (
        checkin_time if checkin_time is not None else user_event.checkin_time
    )
    new_checkout = None if unset_checkout else (
        checkout_time if checkout_time is not None else user_event.checkout_time
    )

    if new_checkin is None and new_checkout is None:
        raise ValidationError(
            {"details": "At least one of check-in or check-out time is required."}
        )

    if new_checkout is not None:
        new_checkout = resolve_checkout_time(
            checkin_time=new_checkin,
            proposed_checkout=new_checkout,
            event=user_event.event,
            tenant=tenant,
        )

    grace = getattr(tenant, "checkin_grace_period_minute", 5) or 5
    ok, code = validate_self_correction_times(
        checkin_time=new_checkin,
        checkout_time=new_checkout,
        event=user_event.event,
        tenant=tenant,
        now=timezone.now(),
        grace_minutes=grace,
    )
    if not ok:
        raise ValidationError({"details": self_correction_error_message(code)})

    changes: list[dict] = []
    for field, old_val, new_val in (
        ("checkin_time", user_event.checkin_time, new_checkin),
        ("checkout_time", user_event.checkout_time, new_checkout),
    ):
        if old_val == new_val:
            continue
        changes.append(
            {
                "field": field,
                "from": _serialize_dt(old_val),
                "to": _serialize_dt(new_val),
            }
        )

    new_today_activities = user_event.today_activities
    if today_activities is not _UNSET:
        new_today_activities = _normalize_today_activities(today_activities)
        if user_event.today_activities != new_today_activities:
            changes.append(
                {
                    "field": "today_activities",
                    "from": _serialize_activities_audit(user_event.today_activities),
                    "to": _serialize_activities_audit(new_today_activities),
                }
            )

    if checkin_image is not None:
        changes.append(
            {
                "field": "checkin_image",
                "from": _image_audit_value(user_event.checkin_image),
                "to": _image_audit_value(checkin_image),
            }
        )

    if not changes:
        raise ValidationError({"details": "No changes to apply."})

    if user_event.checkin_time != new_checkin and checkin_image is None:
        raise ValidationError(
            {
                "checkin_image": (
                    "Check-in screenshot is required when correcting check-in time."
                )
            }
        )

    is_backfill = any(
        change["from"] is None
        for change in changes
        if change["field"] in ("checkin_time", "checkout_time")
    )
    event_type = (
        AttendanceChangeEvent.EventType.SELF_CHECKIN_BACKFILLED
        if is_backfill
        else AttendanceChangeEvent.EventType.SELF_CHECKIN_CORRECTED
    )

    first_backfill = user_event.checkin_time is None and new_checkin is not None

    with transaction.atomic():
        if first_backfill:
            snapshot_updates = freeze_teacher_payroll_snapshots(
                user_event,
                tenant,
                require_rate=True,
                message_user=actor,
            )
            for key, value in snapshot_updates.items():
                setattr(user_event, key, value)

        user_event.checkin_time = new_checkin
        user_event.checkout_time = new_checkout
        if checkin_image is not None:
            user_event.checkin_image = checkin_image
        if today_activities is not _UNSET:
            user_event.today_activities = new_today_activities
        update_fields = [
            "checkin_time",
            "checkout_time",
            "updated_at",
        ]
        if checkin_image is not None:
            update_fields.append("checkin_image")
        if today_activities is not _UNSET:
            update_fields.append("today_activities")
        if first_backfill:
            update_fields.extend(
                [
                    "hourly_rate_at_calculation",
                    "student_bonus_rate_at_calculation",
                    "student_count_in_course_at_calculation",
                    "per_hour_price_at_calculation",
                    "event_time_from_at_calculation",
                    "event_time_to_at_calculation",
                ]
            )
        user_event.save(update_fields=update_fields)

        record_attendance_change_event(
            user_event_id=user_event.id,
            actor_id=actor.id,
            event_type=event_type,
            payload={"reason": reason, "changes": changes},
        )

    user_event.refresh_from_db()
    return user_event

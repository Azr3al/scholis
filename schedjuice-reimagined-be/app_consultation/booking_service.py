from __future__ import annotations

from datetime import datetime

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from app_auth.models import User
from app_consultation.availability import (
    invalidate_freebusy_cache_for_booking,
    is_slot_available,
)
from app_consultation.consultant_helpers import (
    build_booking_manage_url,
    generate_cancel_token,
    get_organization_for_current_schema,
    hash_cancel_token,
    is_consultant_bookable,
    resolve_booking_manage_token,
    rotate_booking_cancel_token,
    sign_cancel_token,
    verify_cancel_token,
)
from app_consultation.booking_fields import format_calendar_description
from app_consultation.constants import SLOT_DURATION_MINUTES
from app_consultation.models import ConsultationBooking, ConsultationWeeklyWhitelist
from app_consultation.notifications import (
    notify_booking_approved,
    notify_booking_cancelled_by_consultant,
    notify_booking_cancelled_by_student,
    notify_booking_created,
    notify_booking_declined,
)
from app_google.calendar import (
    GoogleCalendarError,
    create_consultation_event,
    delete_calendar_event,
)


class BookingConflictError(Exception):
    pass


class BookingNotPendingError(Exception):
    pass


class BookingServiceError(Exception):
    pass


def parse_scheduled_at(raw: str) -> datetime:
    parsed = parse_datetime(raw)
    if parsed is None:
        raise ValueError("scheduled_at must be an ISO 8601 datetime.")
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.utc)
    return parsed.astimezone(timezone.utc)


def get_booking_by_token(cancel_token: str) -> ConsultationBooking | None:
    token_hash = hash_cancel_token(cancel_token)
    booking = ConsultationBooking.objects.filter(cancel_token_hash=token_hash).first()
    if booking is None or not verify_cancel_token(cancel_token, booking.cancel_token_hash):
        return None
    return booking


def cancel_booking(
    booking: ConsultationBooking,
    *,
    cancelled_by: str,
) -> ConsultationBooking:
    if booking.status == ConsultationBooking.Status.CANCELLED:
        return booking

    was_pending = booking.status == ConsultationBooking.Status.PENDING
    was_confirmed = booking.status == ConsultationBooking.Status.CONFIRMED

    if booking.google_calendar_event_id:
        try:
            delete_calendar_event(booking.consultant, booking.google_calendar_event_id)
        except GoogleCalendarError:
            pass

    booking.status = ConsultationBooking.Status.CANCELLED
    booking.cancelled_at = timezone.now()
    booking.cancelled_by = cancelled_by
    booking.save(
        update_fields=["status", "cancelled_at", "cancelled_by", "updated_at"]
    )
    invalidate_freebusy_cache_for_booking(booking.consultant, booking.scheduled_at)

    tenant = get_organization_for_current_schema()
    if cancelled_by == ConsultationBooking.CancelledBy.CONSULTANT and was_pending:
        notify_booking_declined(tenant, booking)
    elif cancelled_by == ConsultationBooking.CancelledBy.CONSULTANT and was_confirmed:
        notify_booking_cancelled_by_consultant(tenant, booking)
    elif cancelled_by == ConsultationBooking.CancelledBy.STUDENT:
        notify_booking_cancelled_by_student(tenant, booking)

    return booking


def ensure_booking_manage_link(booking: ConsultationBooking) -> str:
    token = resolve_booking_manage_token(booking)
    if not token:
        token = rotate_booking_cancel_token(booking)
    return build_booking_manage_url(token)


def cancel_booking_by_token(cancel_token: str) -> ConsultationBooking | None:
    booking = get_booking_by_token(cancel_token)
    if booking is None:
        return None
    return cancel_booking(
        booking,
        cancelled_by=ConsultationBooking.CancelledBy.STUDENT,
    )


@transaction.atomic
def create_booking(
    consultant: User,
    *,
    scheduled_at: datetime,
    student_name: str,
    student_email: str,
    details: dict | None = None,
) -> tuple[ConsultationBooking, str]:
    org = get_organization_for_current_schema()
    if not is_consultant_bookable(consultant, org=org):
        raise BookingServiceError("Consultant is not bookable.")

    ConsultationWeeklyWhitelist.objects.select_for_update().filter(
        consultant=consultant
    ).first()

    org_tz = getattr(org, "timezone", None) if org else None
    if not is_slot_available(consultant, scheduled_at, org_tz):
        raise BookingConflictError("Selected slot is no longer available.")

    cancel_token, cancel_token_hash = generate_cancel_token()
    cancel_token_signed = sign_cancel_token(cancel_token)

    try:
        booking = ConsultationBooking.objects.create(
            consultant=consultant,
            scheduled_at=scheduled_at,
            duration_minutes=SLOT_DURATION_MINUTES,
            student_name=student_name,
            student_email=student_email,
            details=details or {},
            cancel_token_hash=cancel_token_hash,
            cancel_token_signed=cancel_token_signed,
            status=ConsultationBooking.Status.PENDING,
        )
    except IntegrityError as exc:
        raise BookingConflictError("Selected slot is no longer available.") from exc

    invalidate_freebusy_cache_for_booking(consultant, scheduled_at)
    notify_booking_created(
        org,
        booking,
        cancel_token=cancel_token,
    )
    return booking, cancel_token


@transaction.atomic
def approve_booking(booking: ConsultationBooking) -> ConsultationBooking:
    if booking.status != ConsultationBooking.Status.PENDING:
        raise BookingNotPendingError("Only pending bookings can be approved.")

    try:
        booking_manage_url = ensure_booking_manage_link(booking)
        event = create_consultation_event(
            booking.consultant,
            scheduled_at=booking.scheduled_at,
            duration_minutes=booking.duration_minutes,
            student_name=booking.student_name,
            student_email=booking.student_email,
            description=format_calendar_description(
                booking,
                booking_manage_url=booking_manage_url,
            ),
            booking_id=booking.id,
        )
    except GoogleCalendarError as exc:
        raise BookingServiceError(str(exc)) from exc

    booking.meeting_link = event["meeting_link"]
    booking.google_calendar_event_id = event["event_id"]
    booking.status = ConsultationBooking.Status.CONFIRMED
    booking.save(
        update_fields=[
            "meeting_link",
            "google_calendar_event_id",
            "status",
            "updated_at",
        ]
    )
    invalidate_freebusy_cache_for_booking(booking.consultant, booking.scheduled_at)

    from app_google.calendar_sync import ensure_calendar_watch_for_current_consultant

    ensure_calendar_watch_for_current_consultant(booking.consultant)

    tenant = get_organization_for_current_schema()
    notify_booking_approved(tenant, booking)
    return booking

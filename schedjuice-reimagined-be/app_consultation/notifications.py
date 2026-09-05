from __future__ import annotations

import logging

from django.utils import timezone as dj_timezone

from app_auth.models import User
from app_consultation.booking_fields import booking_detail_rows
from app_consultation.consultant_helpers import (
    build_booking_manage_url,
    build_consultant_consultation_url,
)
from app_consultation.models import ConsultationBooking
from app_microsoft.email_templates import build_subject, render_email, tenant_label
from app_microsoft.mail import send_mail

logger = logging.getLogger(__name__)


def _format_scheduled_at(booking: ConsultationBooking, tenant) -> str:
    scheduled_at = booking.scheduled_at
    if dj_timezone.is_naive(scheduled_at):
        scheduled_at = dj_timezone.make_aware(scheduled_at, dj_timezone.utc)
    tz_name = getattr(tenant, "timezone", None) or "UTC"
    try:
        from zoneinfo import ZoneInfo

        local = scheduled_at.astimezone(ZoneInfo(tz_name))
    except Exception:
        local = scheduled_at
    return local.strftime("%A, %B %d, %Y at %I:%M %p").lstrip("0")


def _lookup_user_ids_by_email(email: str) -> list[int]:
    normalized = (email or "").strip()
    if not normalized:
        return []
    user = User.objects.filter(email__iexact=normalized, is_active=True).first()
    if user is None:
        return []
    return [user.id]


def _enqueue_student_push(*, user_ids: list[int], title: str, body: str, data: dict) -> None:
    if not user_ids:
        return
    try:
        from app_utils.push_helpers import enqueue_push_for_user_ids

        enqueue_push_for_user_ids(user_ids, title=title, body=body, data=data)
    except Exception:
        logger.exception("Failed to enqueue student consultation push")


def _enqueue_consultant_push(booking: ConsultationBooking, *, title: str, body: str) -> None:
    try:
        from app_utils.push_helpers import enqueue_push_for_user_ids

        enqueue_push_for_user_ids(
            [booking.consultant_id],
            title=title,
            body=body,
            data={
                "type": "consultation_booking",
                "bookingId": booking.id,
                "url": build_consultant_consultation_url(booking.consultant),
            },
        )
    except Exception:
        logger.exception(
            "Failed to enqueue consultant consultation push booking=%s",
            booking.id,
        )


def _send_student_email(
    tenant,
    booking: ConsultationBooking,
    *,
    subject_label: str,
    heading: str,
    intro_html: str,
    detail_rows: list[tuple[str, str]] | None = None,
    cta_label: str | None = None,
    cta_url: str | None = None,
) -> None:
    try:
        subject = build_subject(tenant, subject_label)
        body = render_email(
            tenant=tenant,
            recipient_name=booking.student_name,
            heading=heading,
            intro_html=intro_html,
            detail_rows=detail_rows,
            cta_label=cta_label,
            cta_url=cta_url,
        )
        send_mail(tenant, subject, body, booking.student_email)
    except Exception:
        logger.exception(
            "Failed consultation email to student booking=%s label=%s",
            booking.id,
            subject_label,
        )


def notify_booking_created(
    tenant,
    booking: ConsultationBooking,
    *,
    cancel_token: str,
) -> None:
    org_name = tenant_label(tenant) or "your school"
    when = _format_scheduled_at(booking, tenant)
    booking_url = build_booking_manage_url(cancel_token)

    detail_rows = [("When", when), *booking_detail_rows(booking)]

    _send_student_email(
        tenant,
        booking,
        subject_label="Consultation request received",
        heading="We received your consultation request",
        intro_html=(
            f"<p>Your request with {org_name} is waiting for confirmation. "
            "You will receive another email once it is confirmed.</p>"
        ),
        detail_rows=detail_rows,
        cta_label="View booking",
        cta_url=booking_url,
    )

    _enqueue_consultant_push(
        booking,
        title="New consultation request",
        body=f"{booking.student_name} requested a consultation on {when}.",
    )


def notify_booking_approved(
    tenant,
    booking: ConsultationBooking,
) -> None:
    org_name = tenant_label(tenant) or "your school"
    when = _format_scheduled_at(booking, tenant)
    detail_rows = [("When", when), *booking_detail_rows(booking)]
    if booking.meeting_link:
        detail_rows.append(("Meeting link", booking.meeting_link))

    _send_student_email(
        tenant,
        booking,
        subject_label="Consultation confirmed",
        heading="Your consultation is confirmed",
        intro_html=(
            f"<p>{org_name} confirmed your consultation. "
            "Use the meeting link below to join.</p>"
        ),
        detail_rows=detail_rows,
        cta_label="Join meeting" if booking.meeting_link else None,
        cta_url=booking.meeting_link or None,
    )

    student_ids = _lookup_user_ids_by_email(booking.student_email)
    _enqueue_student_push(
        user_ids=student_ids,
        title="Consultation confirmed",
        body=f"Your consultation on {when} is confirmed.",
        data={
            "type": "consultation_booking",
            "bookingId": booking.id,
            "status": booking.status,
            "meetingLink": booking.meeting_link,
            "url": booking.meeting_link,
        },
    )


def notify_booking_declined(tenant, booking: ConsultationBooking) -> None:
    org_name = tenant_label(tenant) or "your school"
    when = _format_scheduled_at(booking, tenant)

    _send_student_email(
        tenant,
        booking,
        subject_label="Consultation not available",
        heading="Your consultation request was not confirmed",
        intro_html=(
            f"<p>{org_name} could not confirm your consultation at the time you requested. "
            "You can book another open slot from the consultant's booking page.</p>"
        ),
        detail_rows=[("Requested time", when)],
    )

    student_ids = _lookup_user_ids_by_email(booking.student_email)
    _enqueue_student_push(
        user_ids=student_ids,
        title="Consultation not available",
        body=f"Your consultation request for {when} was not confirmed.",
        data={
            "type": "consultation_booking",
            "bookingId": booking.id,
            "status": booking.status,
        },
    )


def notify_booking_cancelled_by_student(tenant, booking: ConsultationBooking) -> None:
    when = _format_scheduled_at(booking, tenant)
    _send_student_email(
        tenant,
        booking,
        subject_label="Consultation cancelled",
        heading="Your consultation was cancelled",
        intro_html="<p>Your consultation booking has been cancelled as requested.</p>",
        detail_rows=[("When", when)],
    )


def notify_booking_cancelled_by_consultant(tenant, booking: ConsultationBooking) -> None:
    org_name = tenant_label(tenant) or "your school"
    when = _format_scheduled_at(booking, tenant)

    _send_student_email(
        tenant,
        booking,
        subject_label="Consultation cancelled",
        heading="Your consultation was cancelled",
        intro_html=(
            f"<p>{org_name} cancelled your consultation. "
            "You can book another open slot from the consultant's booking page.</p>"
        ),
        detail_rows=[("When", when)],
    )

    student_ids = _lookup_user_ids_by_email(booking.student_email)
    _enqueue_student_push(
        user_ids=student_ids,
        title="Consultation cancelled",
        body=f"Your consultation on {when} was cancelled.",
        data={
            "type": "consultation_booking",
            "bookingId": booking.id,
            "status": booking.status,
        },
    )

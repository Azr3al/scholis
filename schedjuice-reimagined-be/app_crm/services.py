from __future__ import annotations

import secrets

from django.db import transaction

from app_auth.models import User, Visibility
from app_crm import models


class AppointmentRequired(Exception):
    """Raised when moving into an APPOINTMENT column without appointment data."""


class StudentDataRequired(Exception):
    """Raised when converting without the required student fields."""


def record_event(
    lead: models.Lead, actor, event_type: str, payload: dict | None = None
):
    return models.LeadEvent.objects.create(
        lead=lead,
        actor=actor,
        event_type=event_type,
        payload=payload or {},
    )


def create_appointment(
    lead: models.Lead, actor, appointment: dict
) -> models.LeadAppointment:
    appt = models.LeadAppointment.objects.create(
        lead=lead,
        scheduled_at=appointment["scheduled_at"],
        platform=appointment["platform"],
        meeting_link=appointment.get("meeting_link", ""),
        consultant_id=appointment.get("consultant"),
        notes=appointment.get("notes", ""),
    )
    record_event(
        lead,
        actor,
        models.LeadEvent.EventType.APPOINTMENT_BOOKED,
        {
            "appointment_id": appt.id,
            "scheduled_at": str(appt.scheduled_at),
            "platform": appt.platform,
        },
    )
    return appt


@transaction.atomic
def move_lead(
    lead: models.Lead,
    target_status: models.LeadStatus,
    *,
    actor,
    appointment: dict | None = None,
    student_data: dict | None = None,
):
    if target_status.behavior == models.LeadStatus.Behavior.CONVERTED:
        if not student_data:
            raise StudentDataRequired("student_data is required to convert.")
        return convert_lead_to_student(
            lead,
            actor=actor,
            student_data=student_data,
            target_status=target_status,
        )

    if (
        target_status.behavior == models.LeadStatus.Behavior.APPOINTMENT
        and not appointment
    ):
        raise AppointmentRequired("appointment data is required for this column.")

    from_status = lead.status
    lead.status = target_status
    lead.save(update_fields=["status", "updated_at"])
    record_event(
        lead,
        actor,
        models.LeadEvent.EventType.STATUS_CHANGED,
        {
            "from": from_status.name if from_status else None,
            "to": target_status.name,
        },
    )
    if target_status.behavior == models.LeadStatus.Behavior.APPOINTMENT:
        create_appointment(lead, actor, appointment)
    return lead


@transaction.atomic
def convert_lead_to_student(
    lead: models.Lead,
    *,
    actor,
    student_data: dict,
    target_status: models.LeadStatus | None = None,
) -> User:
    name = (student_data.get("name") or lead.name or "").strip()
    email = (student_data.get("email") or lead.email or "").strip()
    if not name or not email:
        raise StudentDataRequired("name and email are required to convert a lead.")

    phone = (student_data.get("phone") or lead.phone or "-").strip() or "-"
    student = User(
        email=email,
        name=name,
        phone_number=phone,
        communication_email=email,
        roles=[User.UserRole.STUDENT],
        is_active=True,
        is_password_change_required=True,
    )
    student.set_password(secrets.token_urlsafe(12))
    visibility = Visibility.objects.filter(role=User.UserRole.STUDENT).first()
    if visibility:
        student.visibility = visibility
    student.save()

    if target_status is None:
        target_status = (
            models.LeadStatus.objects.filter(
                behavior=models.LeadStatus.Behavior.CONVERTED
            )
            .order_by("order")
            .first()
        )

    from_status = lead.status
    lead.converted_user = student
    if target_status:
        lead.status = target_status
    lead.save(update_fields=["converted_user", "status", "updated_at"])
    record_event(
        lead,
        actor,
        models.LeadEvent.EventType.CONVERTED,
        {
            "from": from_status.name if from_status else None,
            "user_id": student.id,
        },
    )
    return student


def record_issue_event(
    issue: models.Issue, actor, event_type: str, payload: dict | None = None
):
    return models.IssueEvent.objects.create(
        issue=issue,
        actor=actor,
        event_type=event_type,
        payload=payload or {},
    )


def _user_display_name(user):
    if user is None:
        return None
    return user.name or user.email


@transaction.atomic
def move_issue(
    issue: models.Issue,
    target_status: models.IssueStatus,
    *,
    actor,
):
    from_status = issue.status
    issue.status = target_status
    issue.save(update_fields=["status", "updated_at"])
    record_issue_event(
        issue,
        actor,
        models.IssueEvent.EventType.STATUS_CHANGED,
        {
            "from": from_status.name if from_status else None,
            "to": target_status.name,
        },
    )
    return issue


def record_issue_assignee_change_if_needed(
    issue: models.Issue,
    *,
    actor,
    previous_assignee,
):
    if issue.assignee_id == (previous_assignee.id if previous_assignee else None):
        return
    record_issue_event(
        issue,
        actor,
        models.IssueEvent.EventType.ASSIGNEE_CHANGED,
        {
            "from": _user_display_name(previous_assignee),
            "to": _user_display_name(issue.assignee),
        },
    )

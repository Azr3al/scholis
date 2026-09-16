from __future__ import annotations

import importlib.util
from datetime import date, datetime, time
from typing import Any

from django.db import connection
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_demo.config import ResolvedDemoConfig

_DEFAULT_PASSWORD = "demo-password"


def _has_crm_app() -> bool:
    return importlib.util.find_spec("app_crm.models") is not None


def _crm_tables_ready() -> bool:
    required = {"app_crm_lead", "app_crm_leadstatus", "app_crm_leadsource"}
    existing = set(connection.introspection.table_names())
    return required.issubset(existing)


def _upsert_admin(*, domain_url: str) -> User:
    email = f"demo-admin@{domain_url}"
    defaults = {
        "name": "Demo Admin",
        "phone_number": "-",
        "communication_email": email,
        "date_of_birth": date(1990, 1, 1),
        "code": "demo-admin",
        "roles": [User.UserRole.ADMIN],
        "is_active": True,
        "is_password_change_required": False,
    }
    user = User.objects.filter(email=email).first()
    if user is None:
        return User.objects.create_user(
            email=email,
            password=_DEFAULT_PASSWORD,
            **defaults,
        )

    update_fields: list[str] = []
    for field, value in defaults.items():
        if getattr(user, field) != value:
            setattr(user, field, value)
            update_fields.append(field)
    if update_fields:
        update_fields.append("updated_at")
        user.save(update_fields=update_fields)
    return user


def run_enrollment_pipeline_pack(
    *,
    schema_name: str,
    config: ResolvedDemoConfig,
    pack_ctx: dict[str, Any] | None = None,
) -> dict[str, Any]:
    del pack_ctx

    if not _has_crm_app():
        return {
            "id": "enrollment-pipeline",
            "status": "skipped",
            "message": "Skipped: app_crm is not installed in this backend.",
        }

    with schema_context(schema_name):
        if not _crm_tables_ready():
            return {
                "id": "enrollment-pipeline",
                "status": "skipped",
                "message": "Skipped: app_crm tables are not migrated in this tenant.",
            }

        from app_crm.models import Lead, LeadAppointment, LeadSource, LeadStatus

        admin_user = _upsert_admin(domain_url=config.domain_url)

        lead_source, _ = LeadSource.objects.get_or_create(name="Demo campaign")
        default_status = (
            LeadStatus.objects.filter(is_default=True).order_by("id").first()
            or LeadStatus.objects.order_by("id").first()
        )
        if default_status is None:
            default_status = LeadStatus.objects.create(
                name="New inquiry",
                order=1,
                behavior=LeadStatus.Behavior.NORMAL,
                is_default=True,
            )
        appointment_status = (
            LeadStatus.objects.filter(behavior=LeadStatus.Behavior.APPOINTMENT)
            .order_by("id")
            .first()
        )

        lead_names = [
            "DEMO Lead Aye Aye",
            "DEMO Lead Ko Min",
            "DEMO Lead Thu Thu",
            "DEMO Lead Zin Mar",
            "DEMO Lead Nandar",
            "DEMO Lead Kyaw",
        ]
        lead_ids: list[int] = []
        for index, lead_name in enumerate(lead_names):
            status = appointment_status if appointment_status and index == 2 else default_status
            lead = Lead.objects.filter(name=lead_name).order_by("id").first()
            if lead is None:
                lead = Lead.objects.create(
                    name=lead_name,
                    phone=f"09-7000-00{index}",
                    email=f"lead-{index + 1}@example.com",
                    interested_in="Demo enrollment",
                    source=lead_source,
                    status=status,
                    assignee=admin_user,
                    created_by=admin_user,
                )
            else:
                lead.source = lead_source
                lead.status = status
                lead.assignee = admin_user
                lead.created_by = admin_user
                lead.save(
                    update_fields=[
                        "source",
                        "status",
                        "assignee",
                        "created_by",
                        "updated_at",
                    ]
                )
            lead_ids.append(lead.id)

        if appointment_status is not None:
            appointment_lead = Lead.objects.filter(status=appointment_status).order_by("id").first()
            if appointment_lead is not None:
                scheduled_at = timezone.make_aware(
                    datetime.combine(config.demo_date, time(10, 30))
                )
                LeadAppointment.objects.get_or_create(
                    lead=appointment_lead,
                    scheduled_at=scheduled_at,
                    defaults={
                        "platform": LeadAppointment.Platform.ZOOM,
                        "meeting_link": "https://meet.example.com/demo-enrollment",
                        "consultant": admin_user,
                    },
                )

    return {
        "id": "enrollment-pipeline",
        "status": "applied",
        "message": "Seeded CRM lead pipeline with demo leads and one appointment slot.",
        "lead_ids": lead_ids,
    }

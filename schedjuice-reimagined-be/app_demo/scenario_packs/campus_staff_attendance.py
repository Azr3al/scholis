from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any

from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Campus
from app_demo.config import ResolvedDemoConfig
from app_hr.models import BuildingCheckin

_DEFAULT_PASSWORD = "Demo12345!"

_STAFF_SPECS: list[dict[str, Any]] = [
    {
        "local_part": "demo-principal",
        "name": "Principal",
        "code": "demo-principal",
        "access_log_name": "YMEC-P001",
        "pattern": "on_time",
    },
    {
        "local_part": "demo-teacher",
        "name": "Class Advisory",
        "code": "demo-teacher",
        "access_log_name": "YMEC-T001",
        "pattern": "on_time",
    },
    {
        "local_part": "demo-asst-tr-1",
        "name": "Asst Tr",
        "code": "demo-asst-tr-1",
        "access_log_name": "YMEC-T002",
        "pattern": "late",
    },
    {
        "local_part": "demo-asst-tr-2",
        "name": "Asst Tr",
        "code": "demo-asst-tr-2",
        "access_log_name": "YMEC-T003",
        "pattern": "missing_checkout",
    },
    {
        "local_part": "demo-admin-staff",
        "name": "Admin",
        "code": "demo-admin-staff",
        "access_log_name": "YMEC-A001",
        "pattern": "on_time",
    },
    {
        "local_part": "demo-instructor",
        "name": "Instructor",
        "code": "demo-instructor",
        "access_log_name": "YMEC-I001",
        "pattern": "on_time",
    },
]


def _preferred_checkin_dt() -> datetime:
    tz = timezone.get_current_timezone()
    return timezone.make_aware(datetime(2000, 1, 1, 8, 0, 0), tz)


def _preferred_checkout_dt() -> datetime:
    tz = timezone.get_current_timezone()
    return timezone.make_aware(datetime(2000, 1, 1, 15, 0, 0), tz)


def _upsert_staff(
    *,
    email: str,
    name: str,
    code: str,
    access_log_name: str,
) -> User:
    defaults = {
        "name": name,
        "phone_number": "-",
        "communication_email": email,
        "date_of_birth": date(1990, 1, 1),
        "code": code,
        "roles": [User.UserRole.TEACHER],
        "is_active": True,
        "is_password_change_required": False,
        "access_log_name": access_log_name,
        "preferred_checkin_time": _preferred_checkin_dt(),
        "preferred_checkout_time": _preferred_checkout_dt(),
    }
    user = User.objects.filter(email=email).first()
    if user is None:
        user = User.objects.filter(code=code).first()
    if user is None:
        return User.objects.create_user(email=email, password=_DEFAULT_PASSWORD, **defaults)

    update_fields: list[str] = []
    if user.email != email:
        user.email = email
        user.communication_email = email
        update_fields.extend(["email", "communication_email"])
    for field, value in defaults.items():
        if field in {"email", "communication_email"}:
            continue
        if getattr(user, field) != value:
            setattr(user, field, value)
            update_fields.append(field)
    if update_fields:
        update_fields.append("updated_at")
        user.save(update_fields=update_fields)
    return user


def _ensure_campus(config: ResolvedDemoConfig) -> Campus:
    spec = (config.physical_campuses or [{}])[0]
    name = str(spec.get("name") or "Yangon Montessori Main Campus")
    defaults: dict[str, Any] = {
        "is_online": False,
        "latitude": spec.get("latitude"),
        "longitude": spec.get("longitude"),
        "geofence_radius_meters": spec.get("geofence_radius_meters") or 150,
    }
    campus, created = Campus.objects.get_or_create(name=name, defaults=defaults)
    if not created:
        update_fields: list[str] = []
        for field, value in defaults.items():
            if getattr(campus, field) != value:
                setattr(campus, field, value)
                update_fields.append(field)
        if update_fields:
            update_fields.append("updated_at")
            campus.save(update_fields=update_fields)
    return campus


def _aware_on(day: date, hour: int, minute: int) -> datetime:
    tz = timezone.get_current_timezone()
    return timezone.make_aware(datetime.combine(day, time(hour, minute)), tz)


def _june_weekdays(demo_date: date) -> list[date]:
    days: list[date] = []
    cursor = date(demo_date.year, demo_date.month, 1)
    while cursor.month == demo_date.month:
        if cursor.weekday() < 5:
            days.append(cursor)
        cursor += timedelta(days=1)
    return days


def _seed_checkin_row(
    *,
    user: User,
    campus: Campus,
    day: date,
    pattern: str,
) -> None:
    checkin = _aware_on(day, 8, 0)
    checkout = _aware_on(day, 15, 0)
    if pattern == "late":
        checkin = _aware_on(day, 8, 25)
    elif pattern == "missing_checkout":
        checkout = None

    row, created = BuildingCheckin.objects.get_or_create(
        user=user,
        date=day,
        defaults={
            "campus": campus,
            "actual_checkin_time": checkin,
            "actual_checkout_time": checkout,
            "checkin_verification_method": BuildingCheckin.VerificationMethod.SELFIE,
            "checkout_verification_method": (
                BuildingCheckin.VerificationMethod.SELFIE if checkout else None
            ),
        },
    )
    if created:
        return

    row.campus = campus
    row.actual_checkin_time = checkin
    row.actual_checkout_time = checkout
    row.checkin_verification_method = BuildingCheckin.VerificationMethod.SELFIE
    row.checkout_verification_method = (
        BuildingCheckin.VerificationMethod.SELFIE if checkout else None
    )
    row.save(
        update_fields=[
            "campus",
            "actual_checkin_time",
            "actual_checkout_time",
            "checkin_verification_method",
            "checkout_verification_method",
            "updated_at",
        ]
    )


def apply_staff_account_labels(*, schema_name: str, config: ResolvedDemoConfig) -> None:
    """Re-apply staff display names after seed_demo_accounts runs."""
    with schema_context(schema_name):
        for spec in _STAFF_SPECS:
            email = f"{spec['local_part']}@{config.domain_url}"
            user = User.objects.filter(email=email).first()
            if user is None:
                continue
            update_fields: list[str] = []
            if user.name != spec["name"]:
                user.name = spec["name"]
                update_fields.append("name")
            if user.access_log_name != spec["access_log_name"]:
                user.access_log_name = spec["access_log_name"]
                update_fields.append("access_log_name")
            if user.preferred_checkin_time != _preferred_checkin_dt():
                user.preferred_checkin_time = _preferred_checkin_dt()
                update_fields.append("preferred_checkin_time")
            if user.preferred_checkout_time != _preferred_checkout_dt():
                user.preferred_checkout_time = _preferred_checkout_dt()
                update_fields.append("preferred_checkout_time")
            if User.UserRole.TEACHER not in (user.roles or []):
                user.roles = list(dict.fromkeys([*(user.roles or []), User.UserRole.TEACHER]))
                update_fields.append("roles")
            if update_fields:
                update_fields.append("updated_at")
                user.save(update_fields=update_fields)


def run_campus_staff_attendance_pack(
    *,
    schema_name: str,
    config: ResolvedDemoConfig,
    pack_ctx: dict[str, Any] | None = None,
) -> dict[str, Any]:
    del pack_ctx

    with schema_context(schema_name):
        campus = _ensure_campus(config)
        staff_users: list[User] = []
        for spec in _STAFF_SPECS:
            email = f"{spec['local_part']}@{config.domain_url}"
            staff_users.append(
                _upsert_staff(
                    email=email,
                    name=spec["name"],
                    code=spec["code"],
                    access_log_name=spec["access_log_name"],
                )
            )

        weekdays = _june_weekdays(config.demo_date)
        checkin_count = 0
        for staff, spec in zip(staff_users, _STAFF_SPECS, strict=True):
            for day in weekdays:
                if day > config.demo_date:
                    continue
                _seed_checkin_row(
                    user=staff,
                    campus=campus,
                    day=day,
                    pattern=str(spec["pattern"]),
                )
                checkin_count += 1

    return {
        "id": "campus-staff-attendance",
        "status": "applied",
        "message": "Seeded YMEC campus, staff, and June weekday BuildingCheckin rows.",
        "campus_id": campus.id,
        "campus_name": campus.name,
        "staff_count": len(staff_users),
        "checkin_row_count": checkin_count,
    }

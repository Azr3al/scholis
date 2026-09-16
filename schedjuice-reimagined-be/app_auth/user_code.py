from __future__ import annotations

import re
from datetime import datetime
from zoneinfo import ZoneInfo

from django.core.exceptions import ValidationError
from django.db import connection, transaction
from django.utils import timezone
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User, UserCodeCounter
from app_organization.models import Organization

AUTO_GENERATED_CODE_RE = re.compile(r"^[12]\d{8}$")
MAX_SEQUENCE = 9999


def type_digit_for_roles(roles: list[str]) -> str:
    if len(roles) == 1 and User.UserRole.STUDENT in roles:
        return "2"
    return "1"


def _tenant_timezone_name() -> str:
    schema = getattr(connection, "schema_name", None) or ""
    if not schema or schema == get_public_schema_name():
        return "UTC"
    cache = getattr(connection, "_user_code_org_tz_cache", None)
    if isinstance(cache, dict) and schema in cache:
        return cache[schema]
    with schema_context(get_public_schema_name()):
        org = Organization.objects.filter(schema_name=schema).only("timezone").first()
    tz_name = (org.timezone if org else None) or "UTC"
    tz_name = tz_name.strip() or "UTC"
    if cache is None:
        cache = {}
        connection._user_code_org_tz_cache = cache
    cache[schema] = tz_name
    return tz_name


def _tenant_zoneinfo() -> ZoneInfo:
    try:
        return ZoneInfo(_tenant_timezone_name())
    except Exception:
        return ZoneInfo("UTC")


def calendar_year_in_tenant_tz(*, dt: datetime | None = None) -> int:
    moment = dt or timezone.now()
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(_tenant_zoneinfo()).year


def year_for_user(user: User) -> int:
    created = user.created_at or timezone.now()
    return calendar_year_in_tenant_tz(dt=created)


def format_user_code(*, type_digit: str, year: int, sequence: int) -> str:
    return f"{type_digit}{year}{sequence:04d}"


@transaction.atomic
def allocate_user_code(*, roles: list[str], year: int) -> str:
    type_digit = type_digit_for_roles(roles)
    UserCodeCounter.objects.get_or_create(
        type_digit=type_digit,
        year=year,
        defaults={"next_sequence": 1},
    )
    counter = UserCodeCounter.objects.select_for_update().get(
        type_digit=type_digit,
        year=year,
    )
    seq = counter.next_sequence
    if seq > MAX_SEQUENCE:
        raise ValidationError(
            f"No user IDs remaining for type {type_digit} in {year}."
        )
    counter.next_sequence = seq + 1
    counter.save(update_fields=["next_sequence", "updated_at"])
    return format_user_code(type_digit=type_digit, year=year, sequence=seq)


def assign_code_if_blank(user: User, *, year: int | None = None) -> None:
    if user.code not in (None, ""):
        return
    roles = list(user.roles or [])
    assign_year = year if year is not None else calendar_year_in_tenant_tz()
    user.code = allocate_user_code(roles=roles, year=assign_year)


def validate_code_unique(
    code: str,
    *,
    exclude_user_id: int | None = None,
) -> None:
    qs = User.objects.filter(code=code)
    if exclude_user_id is not None:
        qs = qs.exclude(pk=exclude_user_id)
    if qs.exists():
        raise ValidationError("This User ID is already in use.")


def reconcile_counters_from_existing_codes() -> None:
    max_by_key: dict[tuple[str, int], int] = {}
    for code in User.objects.exclude(code__isnull=True).values_list("code", flat=True):
        if not code or not AUTO_GENERATED_CODE_RE.fullmatch(code):
            continue
        type_digit = code[0]
        year = int(code[1:5])
        sequence = int(code[5:])
        key = (type_digit, year)
        max_by_key[key] = max(max_by_key.get(key, 0), sequence)

    for (type_digit, year), max_seq in max_by_key.items():
        counter, _ = UserCodeCounter.objects.get_or_create(
            type_digit=type_digit,
            year=year,
            defaults={"next_sequence": max_seq + 1},
        )
        if counter.next_sequence <= max_seq:
            counter.next_sequence = max_seq + 1
            counter.save(update_fields=["next_sequence", "updated_at"])

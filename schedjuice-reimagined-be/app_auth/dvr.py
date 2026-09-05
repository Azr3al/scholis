from __future__ import annotations

from datetime import date
from typing import Any, Iterable

from django.db.models import Q, QuerySet
from rest_framework.exceptions import ValidationError

from app_auth.models import User
from app_custom_fields.constants import ENTITY_TYPE_USER, SOURCE_CUSTOM
from app_custom_fields.validation import _is_empty_value, active_definitions_qs

DVR_FIELD_CATALOG = frozenset(
    {
        "communication_email",
        "alternative_name",
        "date_of_birth",
        "phone_number",
        "house_number",
        "street",
        "township",
        "city",
        "region",
        "country",
    }
)


def normalize_dvr_fields(raw: Any) -> list[dict]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValidationError({"fields": "Must be a list."})
    out: list[dict] = []
    for item in raw:
        if isinstance(item, str):
            out.append({"name": item, "required": False})
        elif isinstance(item, dict) and "name" in item:
            out.append(
                {
                    "name": str(item["name"]),
                    "required": bool(item.get("required", False)),
                }
            )
        else:
            raise ValidationError(
                {"fields": "Each field must be a string or {name, required}."}
            )
    return out


def active_custom_user_field_keys() -> set[str]:
    keys = set(
        active_definitions_qs(ENTITY_TYPE_USER)
        .filter(source=SOURCE_CUSTOM)
        .values_list("field_key", flat=True)
    )
    return keys - DVR_FIELD_CATALOG


def validate_dvr_fields(
    raw: Any, *, custom_keys: Iterable[str] | None = None
) -> list[dict]:
    fields = normalize_dvr_fields(raw)
    if not fields:
        raise ValidationError({"fields": "Select at least one field."})
    names = [f["name"] for f in fields]
    if len(names) != len(set(names)):
        raise ValidationError({"fields": "Duplicate field names are not allowed."})
    allowed = set(DVR_FIELD_CATALOG)
    if custom_keys is None:
        allowed |= active_custom_user_field_keys()
    else:
        allowed |= set(custom_keys) - DVR_FIELD_CATALOG
    unknown = [n for n in names if n not in allowed]
    if unknown:
        raise ValidationError({"fields": f"Unknown fields: {', '.join(unknown)}"})
    return fields


def required_field_names(fields: Iterable[dict]) -> list[str]:
    return [f["name"] for f in fields if f.get("required")]


def user_missing_required_fields(
    user: Any,
    fields: Iterable[dict],
    *,
    active_custom_keys: set[str] | None = None,
) -> list[str]:
    if active_custom_keys is None:
        active_custom_keys = active_custom_user_field_keys()
    missing: list[str] = []
    for name in required_field_names(fields):
        if name in DVR_FIELD_CATALOG:
            value = getattr(user, name, None)
        elif name in active_custom_keys:
            data = getattr(user, "custom_data", None) or {}
            value = data.get(name)
        else:
            continue
        if _is_empty_value(value):
            missing.append(name)
    return missing


def users_matching_roles(role_types: list[str]) -> QuerySet[User]:
    """Users whose roles array overlaps any selected role (OR)."""
    if not role_types:
        return User.objects.none()
    q = Q()
    for role in role_types:
        q |= Q(roles__contains=[role])
    return User.objects.filter(q).distinct()


def dvr_verify_allow_user_admin_keys(*, user: Any, dvr_id: int) -> set[str] | None:
    """Custom field keys the verifying user may write for a pending DVR.

    Returns None when there is no pending owned UDVR for ``dvr_id`` (invalid /
    unauthorized verify context). Returns a (possibly empty) set when the DVR
    verify write is authorized.
    """
    from app_auth.models import UserDataVerificationRequest

    udvr = (
        UserDataVerificationRequest.objects.select_related(
            "data_verification_request"
        )
        .filter(
            user_id=user.id,
            data_verification_request_id=dvr_id,
            status=UserDataVerificationRequest.Status.PENDING,
        )
        .first()
    )
    if udvr is None:
        return None
    fields = normalize_dvr_fields(udvr.data_verification_request.fields)
    # Custom keys only — avoid a second FieldDefinition query here; write validation
    # rejects unknown/inactive keys via active definitions.
    return {f["name"] for f in fields} - DVR_FIELD_CATALOG


def pick_banner_user_dvr(user_dvrs: Iterable[Any], today: date) -> Any | None:
    eligible = []
    for row in user_dvrs:
        if getattr(row, "status", None) != "pending":
            continue
        dvr = getattr(row, "data_verification_request", None)
        expires_on = getattr(dvr, "expires_on", None) if dvr is not None else None
        if expires_on is None or expires_on < today:
            continue
        eligible.append(row)
    if not eligible:
        return None
    eligible.sort(
        key=lambda r: (
            r.data_verification_request.expires_on,
            getattr(r, "id", 0) or 0,
        )
    )
    return eligible[0]

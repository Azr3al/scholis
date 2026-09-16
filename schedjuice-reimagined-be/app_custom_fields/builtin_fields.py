"""Registry of policy-controllable built-in fields per entity type.

Built-in rows carry only policy (required_at, roles, filled_by, group, show_on_*);
this registry is the authoritative source for their type, label, and choices.

IMPORTANT: do not import app_auth at module top-level (app_auth imports
CustomDataMixin from app_custom_fields.models -> circular). Import User lazily.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

from app_custom_fields.constants import ENTITY_TYPE_USER


@dataclass(frozen=True)
class BuiltinField:
    field_type: str
    default_label: str
    # Optional callable returning a TextChoices class; resolved lazily to avoid
    # importing app_auth at import time.
    choices_enum: Optional[Callable[[], object]] = None

    def resolve_choices(self):
        if self.choices_enum is None:
            return None
        enum = self.choices_enum()
        return [{"value": value, "label": label} for value, label in enum.choices]


def _user_gender_enum():
    from app_auth.models import User

    return User.Gender


# Conservative starting set. Adding a column here later is a one-line change
# picked up by the next `sync_builtin_fields` run.
_USER_BUILTIN_FIELDS: dict[str, BuiltinField] = {
    "alternative_name": BuiltinField("text", "Alternative name"),
    "date_of_birth": BuiltinField("date", "Date of birth"),
    "gender": BuiltinField("choice", "Gender", choices_enum=_user_gender_enum),
    "nrc_passport": BuiltinField("text", "NRC / Passport"),
    "facebook_account_link": BuiltinField("url", "Facebook profile"),
    "house_number": BuiltinField("text", "House number"),
    "street": BuiltinField("text", "Street"),
    "township": BuiltinField("text", "Township"),
    "city": BuiltinField("text", "City"),
    "region": BuiltinField("text", "Region"),
    "country": BuiltinField("text", "Country"),
    "delivery_address": BuiltinField("textarea", "Delivery address"),
    "emergency_contact_name": BuiltinField("text", "Emergency contact name"),
    "emergency_contact_phone_number": BuiltinField("text", "Emergency contact phone"),
    "emergency_contact_relationship": BuiltinField(
        "text", "Emergency contact relationship"
    ),
}

# Identity / operational columns that are never policy-controllable. These stay
# hardcoded in the User flow. Used to build the reserved-key namespace so a custom
# field_key cannot collide with a real model attribute.
_USER_RESERVED_NON_REGISTRY: frozenset[str] = frozenset(
    {
        "email",
        "name",
        "communication_email",
        "phone_number",
        "password",
        "roles",
        "code",
        "is_active",
        "is_staff",
        "salary",
        "per_hour_rate",
        "student_bonus_hourly_rate",
        "working_hour_per_month",
        "microsoft_id",
        "custom_data",
        "search_text",
        "search_vector",
    }
)

_REGISTRY: dict[str, dict[str, BuiltinField]] = {
    ENTITY_TYPE_USER: _USER_BUILTIN_FIELDS,
}

_RESERVED_NON_REGISTRY: dict[str, frozenset[str]] = {
    ENTITY_TYPE_USER: _USER_RESERVED_NON_REGISTRY,
}


def builtin_fields_for_entity(entity_type: str) -> dict[str, BuiltinField]:
    return _REGISTRY.get(entity_type, {})


def get_builtin_field(entity_type: str, field_key: str) -> Optional[BuiltinField]:
    return builtin_fields_for_entity(entity_type).get(field_key)


def reserved_keys_for_entity(entity_type: str) -> frozenset[str]:
    registry_keys = frozenset(builtin_fields_for_entity(entity_type).keys())
    extra = _RESERVED_NON_REGISTRY.get(entity_type, frozenset())
    if not registry_keys and not extra:
        return frozenset()
    return registry_keys | extra

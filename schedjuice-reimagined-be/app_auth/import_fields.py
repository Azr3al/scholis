"""Assemble the mappable field schema for the user import wizard."""

from __future__ import annotations

from app_custom_fields.builtin_fields import builtin_fields_for_entity
from app_custom_fields.constants import (
    ENTITY_TYPE_USER,
    REQUIRED_AT_REGISTRATION,
    SOURCE_BUILTIN,
    SOURCE_CUSTOM,
)
from app_custom_fields.validation import active_definitions_qs

IDENTITY_FLOOR = [
    {
        "field_key": "email",
        "field_label": "Email",
        "field_type": "email",
        "special": "user",
        "always_required": True,
    },
    {
        "field_key": "name",
        "field_label": "Name",
        "field_type": "text",
        "special": None,
        "always_required": False,
    },
    {
        "field_key": "phone_number",
        "field_label": "Phone number",
        "field_type": "text",
        "special": None,
        "always_required": False,
    },
    {
        "field_key": "communication_email",
        "field_label": "Communication email",
        "field_type": "email",
        "special": None,
        "always_required": False,
    },
]

COURSES_FIELD = {
    "field_key": "courses",
    "field_label": "Courses",
    "field_type": "text",
    "special": "course",
    "always_required": False,
}


def _required_for_role(defn, role: str) -> bool:
    if defn.required_at != REQUIRED_AT_REGISTRATION:
        return False
    defn_roles = set(defn.roles or [])
    return (not defn_roles) or (role in defn_roles)


def build_import_fields(*, role: str, entity_type: str = ENTITY_TYPE_USER) -> list[dict]:
    fields: list[dict] = []

    for spec in IDENTITY_FLOOR:
        fields.append(
            {
                "field_key": spec["field_key"],
                "field_label": spec["field_label"],
                "field_type": spec["field_type"],
                "choices": None,
                "source": "identity",
                "special": spec["special"],
                "required_for_role": spec["always_required"],
            }
        )

    registry = builtin_fields_for_entity(entity_type)
    defs = list(active_definitions_qs(entity_type))

    for defn in defs:
        if defn.source == SOURCE_BUILTIN:
            spec = registry.get(defn.field_key)
            if spec is None:
                continue
            fields.append(
                {
                    "field_key": defn.field_key,
                    "field_label": defn.field_label or spec.default_label,
                    "field_type": spec.field_type,
                    "choices": spec.resolve_choices(),
                    "source": "builtin",
                    "special": None,
                    "required_for_role": _required_for_role(defn, role),
                }
            )
        elif defn.source == SOURCE_CUSTOM:
            fields.append(
                {
                    "field_key": defn.field_key,
                    "field_label": defn.field_label,
                    "field_type": defn.field_type,
                    "choices": defn.choices,
                    "validation_rules": defn.validation_rules,
                    "source": "custom",
                    "special": None,
                    # Custom fields are always optional on import; Form Designer
                    # required_at still applies on create/edit forms.
                    "required_for_role": False,
                }
            )

    fields.append(
        {
            "field_key": COURSES_FIELD["field_key"],
            "field_label": COURSES_FIELD["field_label"],
            "field_type": COURSES_FIELD["field_type"],
            "choices": None,
            "source": "special",
            "special": COURSES_FIELD["special"],
            "required_for_role": False,
        }
    )

    return fields

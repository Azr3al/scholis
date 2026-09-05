"""Idempotent creation of built-in policy rows from the registry (current schema)."""

from app_custom_fields.builtin_fields import builtin_fields_for_entity
from app_custom_fields.constants import (
    ENTITY_TYPE_USER,
    FILLED_BY_BOTH,
    REQUIRED_AT_NEVER,
    SOURCE_BUILTIN,
)


def _field_definition_model():
    from app_custom_fields.models import FieldDefinition

    return FieldDefinition


def _field_group_model():
    from app_custom_fields.models import FieldGroup

    return FieldGroup


def build_builtin_defaults(entity_type: str, field_key: str) -> dict:
    spec = builtin_fields_for_entity(entity_type)[field_key]
    return {
        "source": SOURCE_BUILTIN,
        "entity_type": entity_type,
        "field_key": field_key,
        "field_label": spec.default_label,
        "field_type": None,
        "required_at": REQUIRED_AT_NEVER,
        "filled_by": FILLED_BY_BOTH,
        "roles": [],
        "show_on_create": False,
        "show_on_edit": True,
        "show_on_detail": True,
        "is_active": True,
    }


def ensure_builtin_field_rows(entity_type: str) -> int:
    """Create any missing built-in rows for the entity. Returns the number created."""
    model = _field_definition_model()
    registry_keys = list(builtin_fields_for_entity(entity_type).keys())
    if not registry_keys:
        return 0
    existing = set(
        model.objects.filter(
            entity_type=entity_type,
            source=SOURCE_BUILTIN,
            field_key__in=registry_keys,
        ).values_list("field_key", flat=True)
    )
    created = 0
    for field_key in registry_keys:
        if field_key in existing:
            continue
        model.objects.create(**build_builtin_defaults(entity_type, field_key))
        created += 1
    return created


# Default tenant-facing grouping for built-in rows. Ordered; sort_order is the index.
DEFAULT_BUILTIN_GROUPS = {
    ENTITY_TYPE_USER: [
        {
            "name": "Personal",
            "field_keys": [
                "alternative_name",
                "date_of_birth",
                "gender",
                "nrc_passport",
                "facebook_account_link",
            ],
        },
        {
            "name": "Address",
            "field_keys": [
                "country",
                "region",
                "city",
                "township",
                "house_number",
                "street",
                "delivery_address",
            ],
        },
        {
            "name": "Emergency contact",
            "field_keys": [
                "emergency_contact_name",
                "emergency_contact_phone_number",
                "emergency_contact_relationship",
            ],
        },
    ]
}


def ensure_builtin_groups(entity_type: str = ENTITY_TYPE_USER) -> None:
    """Idempotently create default groups and assign built-in rows + per-field sort_order.

    Runs inside the active tenant schema. Only (re)assigns rows whose group is currently
    NULL so tenant customizations are never clobbered.
    """
    plan = DEFAULT_BUILTIN_GROUPS.get(entity_type, [])
    if not plan:
        return

    FieldGroup = _field_group_model()
    FieldDefinition = _field_definition_model()

    for group_index, group_spec in enumerate(plan):
        group, _ = FieldGroup.objects.get_or_create(
            entity_type=entity_type,
            name=group_spec["name"],
            defaults={"sort_order": group_index, "is_active": True},
        )
        for field_index, field_key in enumerate(group_spec["field_keys"]):
            FieldDefinition.objects.filter(
                entity_type=entity_type,
                field_key=field_key,
                source=SOURCE_BUILTIN,
                group__isnull=True,
            ).update(group=group, sort_order=field_index)

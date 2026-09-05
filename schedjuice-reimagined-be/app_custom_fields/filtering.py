"""Whitelist custom_data__* search filters against FieldDefinition (registry-driven)."""

from rest_framework import serializers

from app_custom_fields.constants import ENTITY_TYPE_COURSE, ENTITY_TYPE_USER
from app_custom_fields.models import FieldDefinition


def entity_type_for_model(model) -> str | None:
    """Map a Django model class to its custom-field entity_type, or None."""
    # Lazy imports: avoid importing app_auth/app_course at module load.
    from app_auth.models import User
    from app_course.models import Course

    mapping = {User: ENTITY_TYPE_USER, Course: ENTITY_TYPE_COURSE}
    return mapping.get(model)


def _filterable_keys_qs(entity_type: str, key: str):
    return FieldDefinition.objects.filter(
        entity_type=entity_type,
        field_key=key,
        is_active=True,
        is_filterable=True,
    )


def validate_filter_param_for_custom_fields(*, model, field_name: str) -> None:
    """Raise ValidationError if field_name targets custom_data without a filterable definition."""
    entity_type = entity_type_for_model(model)
    if entity_type is None:
        return

    for part in field_name.split("|"):
        part = part.strip()
        if not part.startswith("custom_data__"):
            continue
        key = part[len("custom_data__") :]
        if not key or "__" in key:
            raise serializers.ValidationError(
                f"Invalid custom field filter field_name: {field_name!r}"
            )
        if not _filterable_keys_qs(entity_type, key).exists():
            raise serializers.ValidationError(
                f"Custom field {key!r} is not filterable or does not exist."
            )

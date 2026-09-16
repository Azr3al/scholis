from django.db import migrations


def forwards(apps, schema_editor):
    # Use the historical model to stay migration-safe. The registry is static data,
    # safe to import (it does not touch app_auth at import time).
    from app_custom_fields.builtin_fields import builtin_fields_for_entity
    from app_custom_fields.constants import (
        ENTITY_TYPE_USER,
        FILLED_BY_BOTH,
        REQUIRED_AT_NEVER,
        SOURCE_BUILTIN,
    )

    FieldDefinition = apps.get_model("app_custom_fields", "FieldDefinition")
    registry = builtin_fields_for_entity(ENTITY_TYPE_USER)
    existing = set(
        FieldDefinition.objects.filter(
            entity_type=ENTITY_TYPE_USER,
            source=SOURCE_BUILTIN,
            field_key__in=list(registry.keys()),
        ).values_list("field_key", flat=True)
    )
    for field_key, spec in registry.items():
        if field_key in existing:
            continue
        FieldDefinition.objects.create(
            source=SOURCE_BUILTIN,
            entity_type=ENTITY_TYPE_USER,
            field_key=field_key,
            field_label=spec.default_label,
            field_type=None,
            required_at=REQUIRED_AT_NEVER,
            filled_by=FILLED_BY_BOTH,
            roles=[],
            show_on_create=False,
            show_on_edit=True,
            show_on_detail=True,
            is_active=True,
        )


def backwards(apps, schema_editor):
    from app_custom_fields.constants import ENTITY_TYPE_USER, SOURCE_BUILTIN

    FieldDefinition = apps.get_model("app_custom_fields", "FieldDefinition")
    FieldDefinition.objects.filter(
        entity_type=ENTITY_TYPE_USER, source=SOURCE_BUILTIN
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("app_custom_fields", "0005_map_policy_columns"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]

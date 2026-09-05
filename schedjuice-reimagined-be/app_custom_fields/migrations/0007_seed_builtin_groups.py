from django.db import migrations


def forwards(apps, schema_editor):
    # Use the live seeding helper (operates on the active schema set by migrate_schemas).
    from app_custom_fields.constants import ENTITY_TYPE_USER
    from app_custom_fields.seeding import ensure_builtin_groups

    ensure_builtin_groups(ENTITY_TYPE_USER)


def backwards(apps, schema_editor):
    # Non-destructive: leave groups in place.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("app_custom_fields", "0006_seed_builtin_user_fields"),
    ]

    operations = [migrations.RunPython(forwards, backwards)]

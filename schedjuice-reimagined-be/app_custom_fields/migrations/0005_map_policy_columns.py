from django.db import migrations


def forwards(apps, schema_editor):
    FieldDefinition = apps.get_model("app_custom_fields", "FieldDefinition")
    FieldDefinition.objects.filter(is_required=True).update(required_at="registration")
    FieldDefinition.objects.filter(form_input_mode="read_only").update(filled_by="admin")
    FieldDefinition.objects.filter(form_input_mode="editable").update(filled_by="both")


def backwards(apps, schema_editor):
    # required_at/filled_by are additive; legacy columns are untouched, so no-op.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("app_custom_fields", "0004_rename_to_fielddefinition"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]

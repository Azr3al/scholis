from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_organization", "0044_organization_zoom_s2s_credentials"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="max_custom_field_definitions_per_entity",
            field=models.PositiveIntegerField(
                default=100,
                help_text="Max active custom field definitions per entity type (e.g. User) in this tenant.",
            ),
        ),
    ]

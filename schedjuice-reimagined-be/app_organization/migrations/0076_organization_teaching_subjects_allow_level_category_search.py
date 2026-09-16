from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0075_is_legacy_discount_visible"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="teaching_subjects_allow_level_category_search",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "When on, teachers can add program levels and categories "
                    "(not just subjects) to their teaching list."
                ),
            ),
        ),
    ]

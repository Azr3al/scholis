from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0085_merge_20260724_1047"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="is_course_id_card_expiry_enabled",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "When True, courses may set an ID card expiry date that overrides "
                    "the template expiry for enrolled students."
                ),
            ),
        ),
    ]

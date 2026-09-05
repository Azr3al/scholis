from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0080_merge_20260721_1708"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="is_discount_eligibility_enabled",
            field=models.BooleanField(
                default=True,
                help_text=(
                    "When False, discount eligibility rules are unused: UI hides them and "
                    "create/update force eligibility_type to none."
                ),
            ),
        ),
    ]

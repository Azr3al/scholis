from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0080_merge_20260721_1708"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="is_telegram_login_on",
            field=models.BooleanField(
                default=False,
                help_text="Allow sign-in via Telegram Login Widget (requires configured bot).",
            ),
        ),
    ]

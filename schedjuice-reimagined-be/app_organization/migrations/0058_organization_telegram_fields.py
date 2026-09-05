from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0057_organization_course_sheet_template"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="is_telegram_on",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="organization",
            name="is_telegram_roster_sync_enabled",
            field=models.BooleanField(
                default=True,
                help_text="When off, no teacher membership sync; bot still posts announcements/DMs.",
            ),
        ),
        migrations.AddField(
            model_name="organization",
            name="telegram_bot_token_ct",
            field=models.TextField(
                blank=True,
                help_text="Fernet-encrypted bot token. Use set/get_telegram_bot_token().",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="organization",
            name="telegram_bot_username",
            field=models.CharField(blank=True, max_length=64, null=True),
        ),
        migrations.AddField(
            model_name="organization",
            name="telegram_bot_id",
            field=models.CharField(blank=True, max_length=64, null=True),
        ),
        migrations.AddField(
            model_name="organization",
            name="telegram_webhook_secret",
            field=models.CharField(blank=True, max_length=128, null=True),
        ),
        migrations.AddField(
            model_name="organization",
            name="telegram_routing_key",
            field=models.CharField(
                blank=True, db_index=True, max_length=64, null=True, unique=True
            ),
        ),
    ]

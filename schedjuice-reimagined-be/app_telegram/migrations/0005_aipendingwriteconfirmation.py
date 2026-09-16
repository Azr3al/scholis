import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        (
            "app_telegram",
            "0004_alter_telegramlinktoken_options_and_more",
        ),
    ]

    operations = [
        migrations.CreateModel(
            name="AIPendingWriteConfirmation",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("channel_key", models.CharField(db_index=True, max_length=128)),
                ("tool_name", models.CharField(max_length=64)),
                ("action", models.CharField(max_length=32)),
                ("execution_payload", models.JSONField(default=dict)),
                ("summary", models.TextField()),
                ("preview", models.JSONField(default=dict)),
                ("telegram_chat_id", models.BigIntegerField(blank=True, null=True)),
                ("telegram_message_id", models.BigIntegerField(blank=True, null=True)),
                ("expires_at", models.DateTimeField()),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "constraints": [
                    models.UniqueConstraint(
                        fields=("user", "channel_key"),
                        name="uniq_ai_write_confirm_user_channel",
                    )
                ],
            },
        ),
    ]

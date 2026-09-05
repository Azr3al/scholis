import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_telegram", "0002_telegramaiexchange"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AIDisambiguationPending",
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
                ("pending_field", models.CharField(max_length=32)),
                ("partial_args", models.JSONField(default=dict)),
                ("candidates", models.JSONField(default=list)),
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
                        name="uniq_ai_disambiguation_user_channel",
                    )
                ],
            },
        ),
    ]

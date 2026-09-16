import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("app_auth", "0077_microsoft_delegated_oauth"),
        ("app_telegram", "0005_aipendingwriteconfirmation"),
    ]

    operations = [
        migrations.CreateModel(
            name="TelegramLoginSession",
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
                (
                    "session_id",
                    models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, unique=True),
                ),
                ("pairing_code", models.CharField(db_index=True, max_length=8)),
                ("otp_hash", models.CharField(blank=True, default="", max_length=128)),
                ("otp_sent_at", models.DateTimeField(blank=True, null=True)),
                ("expires_at", models.DateTimeField()),
                ("consumed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        to="app_auth.user",
                    ),
                ),
            ],
            options={
                "abstract": False,
            },
        ),
    ]

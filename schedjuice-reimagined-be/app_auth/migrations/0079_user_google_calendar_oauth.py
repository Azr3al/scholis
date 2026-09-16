# Tenant schema: UserGoogleCalendarOAuth (consultant Google Calendar OAuth).

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_auth", "0078_user_google_fields"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="UserGoogleCalendarOAuth",
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
                ("authorized_email", models.CharField(blank=True, default="", max_length=320)),
                (
                    "authorized_display_name",
                    models.CharField(blank=True, default="", max_length=256),
                ),
                ("access_token_ct", models.TextField(blank=True, default="")),
                ("refresh_token_ct", models.TextField(blank=True, default="")),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("active", "Active"),
                            ("needs_reconnect", "Needs reconnect"),
                            ("disconnected", "Disconnected"),
                        ],
                        default="active",
                        max_length=32,
                    ),
                ),
                ("last_error", models.TextField(blank=True, default="")),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="google_calendar_oauth",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "app_auth_usergooglecalendaroauth",
            },
        ),
    ]

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("app_auth", "0083_user_microsoft_display_name"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserFieldChange",
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
                ("field_key", models.CharField(max_length=64)),
                ("old_value", models.TextField(blank=True, null=True)),
                ("new_value", models.TextField(blank=True, null=True)),
                (
                    "source",
                    models.CharField(
                        choices=[
                            ("self", "self"),
                            ("connected_teacher", "connected_teacher"),
                            ("admin", "admin"),
                        ],
                        max_length=32,
                    ),
                ),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="authored_field_changes",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="field_changes",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.AddIndex(
            model_name="userfieldchange",
            index=models.Index(
                fields=["user", "-created_at"],
                name="app_auth_us_user_id_fch_idx",
            ),
        ),
    ]

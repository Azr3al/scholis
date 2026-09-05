import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("app_auth", "0052_add_webpushsubscription"),
    ]

    operations = [
        migrations.CreateModel(
            name="RefreshSession",
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
                    models.UUIDField(
                        db_index=True, default=uuid.uuid4, editable=False, unique=True
                    ),
                ),
                ("refresh_jti", models.CharField(db_index=True, max_length=64)),
                ("schema_name", models.CharField(max_length=63)),
                ("remembered", models.BooleanField(default=False)),
                ("expires_at", models.DateTimeField()),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                ("user_agent", models.TextField(blank=True, null=True)),
                ("device_name", models.CharField(blank=True, max_length=256, null=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="refresh_sessions",
                        to="app_auth.user",
                    ),
                ),
            ],
            options={
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddIndex(
            model_name="refreshsession",
            index=models.Index(
                fields=["user", "schema_name", "revoked_at"],
                name="app_auth_re_user_id_8f3c2a_idx",
            ),
        ),
    ]

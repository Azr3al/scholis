from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


def backfill_refresh_session_client_type(apps, schema_editor):
    RefreshSession = apps.get_model("app_auth", "RefreshSession")
    RefreshSession.objects.all().update(client_type="web")


class Migration(migrations.Migration):

    dependencies = [
        ("app_auth", "0084_userfieldchange"),
    ]

    operations = [
        migrations.CreateModel(
            name="MobileDevice",
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
                ("installation_id", models.UUIDField(db_index=True)),
                ("display_name", models.CharField(max_length=256)),
                (
                    "device_model",
                    models.CharField(blank=True, max_length=128, null=True),
                ),
                ("os_name", models.CharField(blank=True, max_length=64, null=True)),
                ("os_version", models.CharField(blank=True, max_length=64, null=True)),
                (
                    "app_version",
                    models.CharField(blank=True, max_length=32, null=True),
                ),
                ("first_seen_at", models.DateTimeField(auto_now_add=True)),
                (
                    "last_seen_at",
                    models.DateTimeField(default=django.utils.timezone.now),
                ),
                ("is_active", models.BooleanField(default=True)),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="mobile_devices",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ("-last_seen_at",),
            },
        ),
        migrations.AddField(
            model_name="refreshsession",
            name="client_type",
            field=models.CharField(
                choices=[("web", "Web"), ("mobile_native", "Mobile native")],
                default="web",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="refreshsession",
            name="last_seen_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="refreshsession",
            name="revoked_reason",
            field=models.CharField(blank=True, max_length=64, null=True),
        ),
        migrations.AddField(
            model_name="refreshsession",
            name="mobile_device",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="sessions",
                to="app_auth.mobiledevice",
            ),
        ),
        migrations.AddConstraint(
            model_name="mobiledevice",
            constraint=models.UniqueConstraint(
                fields=("user", "installation_id"),
                name="unique_user_mobile_installation",
            ),
        ),
        migrations.RunPython(
            backfill_refresh_session_client_type,
            migrations.RunPython.noop,
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0091_organization_consultation_config"),
    ]

    operations = [
        migrations.CreateModel(
            name="GoogleCalendarPushChannel",
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
                ("channel_id", models.CharField(max_length=64, unique=True)),
                ("resource_id", models.CharField(max_length=256)),
                ("tenant_schema", models.CharField(max_length=63)),
                ("consultant_user_id", models.BigIntegerField()),
                ("expiration", models.DateTimeField()),
                ("sync_token", models.TextField(blank=True, default="")),
            ],
            options={
                "abstract": False,
            },
        ),
        migrations.AddConstraint(
            model_name="googlecalendarpushchannel",
            constraint=models.UniqueConstraint(
                fields=("tenant_schema", "consultant_user_id"),
                name="uniq_google_calendar_push_channel_consultant",
            ),
        ),
    ]

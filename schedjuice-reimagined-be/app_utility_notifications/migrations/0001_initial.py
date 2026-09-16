import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("app_auth", "0051_user_phone_digits_generated_orm"),
    ]

    operations = [
        migrations.CreateModel(
            name="UtilityNotificationSentLog",
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
                ("kind", models.CharField(max_length=64)),
                ("reference_id", models.CharField(max_length=255)),
                ("sent_on_date", models.DateField()),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="utility_notification_sent_logs",
                        to="app_auth.user",
                    ),
                ),
            ],
            options={
                "unique_together": {("user", "kind", "reference_id", "sent_on_date")},
            },
        ),
    ]

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("app_auth", "0066_user_id_card_class_name"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserAIPreferences",
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
                    "response_language",
                    models.CharField(
                        choices=[("auto", "auto"), ("en", "en"), ("my", "my")],
                        default="auto",
                        max_length=8,
                    ),
                ),
                (
                    "tone",
                    models.CharField(
                        choices=[
                            ("default", "default"),
                            ("formal", "formal"),
                            ("casual", "casual"),
                        ],
                        default="default",
                        max_length=16,
                    ),
                ),
                (
                    "verbosity",
                    models.CharField(
                        choices=[
                            ("default", "default"),
                            ("brief", "brief"),
                            ("detailed", "detailed"),
                        ],
                        default="default",
                        max_length=16,
                    ),
                ),
                (
                    "preferred_name",
                    models.CharField(blank=True, default="", max_length=64),
                ),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="ai_preferences",
                        to="app_auth.user",
                    ),
                ),
            ],
            options={
                "abstract": False,
            },
        ),
    ]

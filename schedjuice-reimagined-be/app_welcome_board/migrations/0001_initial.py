import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("app_auth", "0043_user_custom_data"),
    ]

    operations = [
        migrations.CreateModel(
            name="WelcomeBoard",
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
                    "audience",
                    models.CharField(
                        choices=[("staff", "staff"), ("student", "student")],
                        db_index=True,
                        max_length=32,
                    ),
                ),
                ("body_html", models.TextField(blank=True, null=True)),
                ("body_plain", models.TextField(blank=True, null=True)),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="welcome_boards_updated",
                        to="app_auth.user",
                    ),
                ),
            ],
            options={
                "abstract": False,
            },
        ),
        migrations.AddConstraint(
            model_name="welcomeboard",
            constraint=models.UniqueConstraint(
                fields=("audience",), name="welcome_board_audience_unique"
            ),
        ),
    ]

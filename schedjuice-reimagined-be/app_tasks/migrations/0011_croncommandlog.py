import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_tasks", "0010_alter_task_name"),
    ]

    operations = [
        migrations.CreateModel(
            name="CronCommandLog",
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
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True),
                ),
                (
                    "updated_at",
                    models.DateTimeField(auto_now=True),
                ),
                (
                    "command_name",
                    models.CharField(db_index=True, max_length=256),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("RUNNING", "Running"),
                            ("SUCCESS", "Success"),
                            ("FAILED", "Failed"),
                        ],
                        default="RUNNING",
                        max_length=16,
                    ),
                ),
                ("stdout", models.TextField(default="")),
                ("stderr", models.TextField(default="")),
                ("error_message", models.TextField(blank=True, null=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
            ],
            options={
                "abstract": False,
            },
        ),
    ]

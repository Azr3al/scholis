# Generated manually for Microsoft Teams meeting and UserAttendance

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("app_course", "0054_usercourse_is_fully_paid"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="course",
            name="microsoft_meeting_id",
            field=models.CharField(blank=True, max_length=512, null=True),
        ),
        migrations.CreateModel(
            name="UserAttendance",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("join_datetime", models.DateTimeField()),
                ("leave_datetime", models.DateTimeField()),
                ("duration_seconds", models.PositiveIntegerField(default=0)),
                (
                    "course",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="user_attendances",
                        to="app_course.course",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="user_attendances",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ("id",),
            },
        ),
    ]

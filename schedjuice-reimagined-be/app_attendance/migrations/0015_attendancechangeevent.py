from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("app_attendance", "0014_god_view_perf_indexes"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AttendanceChangeEvent",
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
                    "event_type",
                    models.CharField(
                        choices=[
                            ("self_checkin_corrected", "Self check-in corrected"),
                            ("self_checkin_backfilled", "Self check-in backfilled"),
                        ],
                        max_length=32,
                    ),
                ),
                ("occurred_at", models.DateTimeField()),
                (
                    "source",
                    models.CharField(
                        blank=True,
                        choices=[
                            (
                                "web_course_checkin_history",
                                "web_course_checkin_history",
                            )
                        ],
                        max_length=32,
                        null=True,
                    ),
                ),
                ("payload", models.JSONField(default=dict)),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="attendance_changes_performed",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "user_event",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="change_events",
                        to="app_attendance.userevent",
                    ),
                ),
            ],
            options={
                "ordering": ["-occurred_at", "-id"],
                "indexes": [
                    models.Index(
                        fields=["user_event", "-occurred_at"],
                        name="app_attenda_user_ev_6f8b2d_idx",
                    )
                ],
            },
        ),
    ]

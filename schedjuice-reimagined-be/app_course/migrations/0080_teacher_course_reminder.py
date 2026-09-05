from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("app_course", "0079_course_zoom_meeting_personal"),
    ]

    operations = [
        migrations.CreateModel(
            name="TeacherCourseReminder",
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
                    "reminder_type",
                    models.CharField(
                        choices=[
                            ("payment_consultation", "payment_consultation"),
                        ],
                        db_index=True,
                        default="payment_consultation",
                        max_length=64,
                    ),
                ),
                ("billing_year", models.PositiveIntegerField()),
                (
                    "billing_month",
                    models.PositiveSmallIntegerField(
                        help_text="Calendar month index 1=Jan … 12=Dec used as FM/HM payment month label.",
                    ),
                ),
                ("period_start", models.DateField()),
                ("period_end", models.DateField()),
                (
                    "obligation_deadline_date",
                    models.DateField(
                        help_text="Last inclusive calendar date for consultation; escalation after this if still open.",
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("open", "open"),
                            ("completed", "completed"),
                            ("waived", "waived"),
                        ],
                        db_index=True,
                        default="open",
                        max_length=32,
                    ),
                ),
                ("reminder_sent_at", models.DateTimeField(blank=True, null=True)),
                ("escalation_sent_at", models.DateTimeField(blank=True, null=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("submission_notes", models.TextField(blank=True, null=True)),
                ("waived_at", models.DateTimeField(blank=True, null=True)),
                ("metadata", models.JSONField(blank=True, null=True)),
                (
                    "course",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="teacher_course_reminders",
                        to="app_course.course",
                    ),
                ),
                (
                    "teacher",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="teacher_course_reminders",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "waived_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="waived_teacher_course_reminders",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ("-billing_year", "-billing_month", "teacher_id"),
            },
        ),
        migrations.AddConstraint(
            model_name="teachercoursereminder",
            constraint=models.UniqueConstraint(
                fields=(
                    "reminder_type",
                    "teacher_id",
                    "course_id",
                    "billing_year",
                    "billing_month",
                ),
                name="uniq_teacher_course_reminder_period",
            ),
        ),
        migrations.AddIndex(
            model_name="teachercoursereminder",
            index=models.Index(
                fields=["reminder_type", "status"],
                name="app_course_te_reminder_8368e9_idx",
            ),
        ),
    ]

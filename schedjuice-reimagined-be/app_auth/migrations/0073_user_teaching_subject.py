# Generated manually for UserTeachingSubject

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0083_programlevelsubject"),
        ("app_auth", "0072_organization_ai_default_user_monthly_usd_limit"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserTeachingSubject",
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
                ("sort_order", models.PositiveIntegerField(default=0)),
                (
                    "program_level",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="user_teaching_subjects",
                        to="app_course.programlevel",
                    ),
                ),
                (
                    "subject",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="user_teaching_subjects",
                        to="app_course.subject",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="teaching_subjects",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["sort_order", "created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="userteachingsubject",
            constraint=models.UniqueConstraint(
                fields=("user", "subject", "program_level"),
                name="uniq_user_teaching_subject_user_subject_level",
            ),
        ),
    ]

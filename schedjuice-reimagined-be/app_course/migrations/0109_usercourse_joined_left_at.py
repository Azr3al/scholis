from django.db import migrations, models
from django.utils import timezone


def backfill_joined_at(apps, schema_editor):
    UserCourse = apps.get_model("app_course", "UserCourse")
    UserCourse.objects.filter(joined_at__isnull=True).update(joined_at=models.F("created_at"))


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0108_program_session_credit_and_course_max_sessions"),
    ]

    operations = [
        migrations.AddField(
            model_name="usercourse",
            name="joined_at",
            field=models.DateTimeField(null=True),
        ),
        migrations.AddField(
            model_name="usercourse",
            name="left_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_joined_at, noop_reverse),
        migrations.AlterField(
            model_name="usercourse",
            name="joined_at",
            field=models.DateTimeField(default=timezone.now),
        ),
        migrations.AlterUniqueTogether(
            name="usercourse",
            unique_together=set(),
        ),
        migrations.AddConstraint(
            model_name="usercourse",
            constraint=models.UniqueConstraint(
                condition=models.Q(("left_at__isnull", True)),
                fields=("user", "course"),
                name="usercourse_one_open_per_user_course",
            ),
        ),
    ]

# Generated manually

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("app_course", "0078_course_zoom_linkage"),
    ]

    operations = [
        migrations.AddField(
            model_name="course",
            name="zoom_meeting_source",
            field=models.CharField(
                choices=[("school", "School Zoom"), ("personal", "Teacher personal Zoom")],
                db_index=True,
                default="school",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="course",
            name="zoom_personal_user",
            field=models.ForeignKey(
                blank=True,
                help_text="When zoom_meeting_source is personal: teacher whose Zoom OAuth is used.",
                null=True,
                on_delete=models.SET_NULL,
                related_name="+",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]

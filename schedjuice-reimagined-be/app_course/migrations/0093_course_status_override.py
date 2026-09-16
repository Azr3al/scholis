from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def migrate_paused_to_override(apps, schema_editor):
    Course = apps.get_model("app_course", "Course")
    Course.objects.filter(status="paused").update(status_override="paused")


class Migration(migrations.Migration):

    dependencies = [
        ("app_course", "0092_intake_generation_defaults"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="course",
            name="status_override",
            field=models.CharField(
                blank=True,
                choices=[("paused", "paused"), ("ended", "ended")],
                help_text="Manual status override (paused or ended). When set, date-based status is ignored.",
                max_length=16,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="course",
            name="status_override_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="course",
            name="status_override_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="course",
            name="status_override_reason",
            field=models.CharField(blank=True, max_length=512, null=True),
        ),
        migrations.RunPython(migrate_paused_to_override, migrations.RunPython.noop),
    ]

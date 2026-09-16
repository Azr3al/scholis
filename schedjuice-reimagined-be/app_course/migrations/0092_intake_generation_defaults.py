from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_course", "0091_repair_course_search_state"),
    ]

    operations = [
        migrations.AddField(
            model_name="intake",
            name="generation_defaults",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]

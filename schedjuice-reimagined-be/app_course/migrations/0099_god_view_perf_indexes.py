from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0098_campus_geofence_fields"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="event",
            index=models.Index(
                fields=["course", "date"],
                name="event_course_date_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="event",
            index=models.Index(
                fields=["date"],
                name="event_date_idx",
            ),
        ),
    ]

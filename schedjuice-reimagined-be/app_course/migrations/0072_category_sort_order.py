from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_course", "0071_course_meeting_scheduled_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="category",
            name="sort_order",
            field=models.PositiveIntegerField(default=0),
        ),
    ]

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0096_course_telegram_fields"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="usercourse",
            name="is_fully_paid",
        ),
    ]

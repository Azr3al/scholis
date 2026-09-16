from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("app_organization", "0047_refresh_course_fields_program"),
    ]

    operations = [
        migrations.DeleteModel(
            name="GraphSubscription",
        ),
        migrations.DeleteModel(
            name="RecordingSyncProgress",
        ),
    ]

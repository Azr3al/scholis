# Add course_fields string array to Organization

import django.contrib.postgres.fields
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0036_recordingsyncprogress"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="course_fields",
            field=django.contrib.postgres.fields.ArrayField(
                base_field=models.CharField(max_length=64),
                blank=True,
                null=True,
                size=None,
            ),
        ),
    ]

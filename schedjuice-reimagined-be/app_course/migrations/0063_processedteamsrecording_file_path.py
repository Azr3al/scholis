# Add file_path for storing copied recording location (option 3: copy after recording)

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0062_alter_processedteamsrecording_metadata"),
    ]

    operations = [
        migrations.AddField(
            model_name="processedteamsrecording",
            name="file_path",
            field=models.CharField(
                blank=True,
                help_text="Path where the recording was copied (within private media storage).",
                max_length=1024,
                null=True,
            ),
        ),
    ]

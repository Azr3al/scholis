from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0068_alter_subject_options_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="processedteamsrecording",
            name="onedrive_deleted",
            field=models.BooleanField(
                default=False,
                db_index=True,
                help_text="True when the original recording has been successfully deleted from OneDrive.",
            ),
        ),
    ]

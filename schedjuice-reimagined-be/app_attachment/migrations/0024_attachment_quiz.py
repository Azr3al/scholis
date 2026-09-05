import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_attachment", "0023_alter_attachment_data"),
        ("app_quiz_v3", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="attachment",
            name="quiz",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="attachments",
                to="app_quiz_v3.quiz",
            ),
        ),
    ]

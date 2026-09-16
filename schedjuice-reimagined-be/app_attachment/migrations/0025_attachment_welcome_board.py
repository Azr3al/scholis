import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_attachment", "0024_attachment_quiz"),
        ("app_welcome_board", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="attachment",
            name="welcome_board",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="attachments",
                to="app_welcome_board.welcomeboard",
            ),
        ),
    ]

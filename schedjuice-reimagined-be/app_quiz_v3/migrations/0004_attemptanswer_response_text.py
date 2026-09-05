from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_quiz_v3", "0003_quiz_source_quiz"),
    ]

    operations = [
        migrations.AddField(
            model_name="attemptanswer",
            name="response_text",
            field=models.TextField(blank=True, default=""),
        ),
    ]

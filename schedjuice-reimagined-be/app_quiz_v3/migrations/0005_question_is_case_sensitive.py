from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_quiz_v3", "0004_attemptanswer_response_text"),
    ]

    operations = [
        migrations.AddField(
            model_name="question",
            name="is_case_sensitive",
            field=models.BooleanField(default=False),
        ),
    ]

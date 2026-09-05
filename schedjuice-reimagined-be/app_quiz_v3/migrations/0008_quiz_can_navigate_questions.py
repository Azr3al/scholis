from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_quiz_v3", "0007_multi_blank_fill"),
    ]

    operations = [
        migrations.AddField(
            model_name="quiz",
            name="can_navigate_questions",
            field=models.BooleanField(default=False),
        ),
    ]

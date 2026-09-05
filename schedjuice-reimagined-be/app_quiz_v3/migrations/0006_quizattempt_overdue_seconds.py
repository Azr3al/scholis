from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_quiz_v3", "0005_question_is_case_sensitive"),
    ]

    operations = [
        migrations.AddField(
            model_name="quizattempt",
            name="overdue_seconds",
            field=models.PositiveIntegerField(
                default=0,
                help_text="Seconds after the allowed time window when the attempt was submitted; 0 if on time.",
            ),
        ),
    ]

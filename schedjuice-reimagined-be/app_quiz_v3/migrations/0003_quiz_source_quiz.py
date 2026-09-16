# Generated manually for optional import lineage FK

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("app_quiz_v3", "0002_questionoption_body_jsonfield"),
    ]

    operations = [
        migrations.AddField(
            model_name="quiz",
            name="source_quiz",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="derived_quizzes",
                to="app_quiz_v3.quiz",
            ),
        ),
    ]

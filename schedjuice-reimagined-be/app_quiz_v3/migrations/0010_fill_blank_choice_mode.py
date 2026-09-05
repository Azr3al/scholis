# Fill-blank single-choice options + answer_mode / config timestamps.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_quiz_v3", "0009_quiz_learner_branding"),
    ]

    operations = [
        migrations.AddField(
            model_name="questionfillblankslot",
            name="answer_mode",
            field=models.CharField(
                choices=[("typed", "Typed answer"), ("single_choice", "Single choice")],
                default="typed",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="questionfillblankslot",
            name="typed_config_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="questionfillblankslot",
            name="single_choice_config_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="QuestionFillBlankChoiceOption",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("text", models.CharField(max_length=2048)),
                ("is_correct", models.BooleanField(default=False)),
                ("display_order", models.PositiveIntegerField(default=0)),
                (
                    "slot",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="choice_options",
                        to="app_quiz_v3.questionfillblankslot",
                    ),
                ),
            ],
            options={
                "ordering": ["display_order", "id"],
            },
        ),
    ]

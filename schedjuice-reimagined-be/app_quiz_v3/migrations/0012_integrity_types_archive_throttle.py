# Integrity types, archive/throttle, attempt metadata, short-answer acceptables,
# essay grading fields, and legacy Open quizzes without course -> Draft.

import app_quiz_v3.models
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def open_without_course_to_draft(apps, schema_editor):
    Quiz = apps.get_model("app_quiz_v3", "Quiz")
    Quiz.objects.filter(status="open", course_id__isnull=True).update(status="draft")


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("app_quiz_v3", "0011_alter_question_options_alter_question_question_type_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="quiz",
            name="archived_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="quiz",
            name="take_rate_per_minute",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="question",
            name="correct_true",
            field=models.BooleanField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="question",
            name="explanation_body",
            field=models.JSONField(default=app_quiz_v3.models._empty_tiptap_doc),
        ),
        migrations.AlterField(
            model_name="question",
            name="question_type",
            field=models.CharField(
                choices=[
                    ("SINGLE_CHOICE", "Single choice"),
                    ("MULTIPLE_CHOICE", "Multiple choice"),
                    ("FILL_IN_BLANK", "Fill in the blank"),
                    ("TRUE_FALSE", "True / false"),
                    ("SHORT_ANSWER", "Short answer"),
                    ("ESSAY", "Essay"),
                ],
                max_length=32,
            ),
        ),
        migrations.CreateModel(
            name="QuestionShortAnswerAcceptableAnswer",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("body", models.TextField()),
                ("display_order", models.PositiveIntegerField(default=0)),
                (
                    "question",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="short_answer_acceptables",
                        to="app_quiz_v3.question",
                    ),
                ),
            ],
            options={
                "ordering": ["display_order", "id"],
            },
        ),
        migrations.AddField(
            model_name="quizattempt",
            name="client_ip",
            field=models.GenericIPAddressField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="quizattempt",
            name="user_agent",
            field=models.CharField(blank=True, default="", max_length=512),
        ),
        migrations.AddField(
            model_name="quizattempt",
            name="submit_idempotency_key",
            field=models.CharField(blank=True, max_length=64, null=True),
        ),
        migrations.AddConstraint(
            model_name="quizattempt",
            constraint=models.UniqueConstraint(
                condition=models.Q(submit_idempotency_key__isnull=False),
                fields=("submit_idempotency_key",),
                name="uniq_quizattempt_submit_idempotency_key_nonnull",
            ),
        ),
        migrations.AddField(
            model_name="attemptanswer",
            name="graded_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="attemptanswer",
            name="graded_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="quiz_v3_attempt_answers_graded",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(open_without_course_to_draft, noop_reverse),
    ]

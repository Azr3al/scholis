"""Schema migration: essay feedback, waiver, QuizResult, EssayComment."""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import app_quiz_v3.models as qm_models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("app_quiz_v3", "0013_attemptanswer_marked_review"),
    ]

    operations = [
        migrations.AddField(
            model_name="attemptanswer",
            name="feedback",
            field=models.JSONField(default=qm_models._empty_tiptap_doc),
        ),
        migrations.AddField(
            model_name="quizattempt",
            name="essay_grading_waived_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="quizattempt",
            name="essay_grading_waived_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="quiz_v3_essay_waivers",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.CreateModel(
            name="QuizResult",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("released_at", models.DateTimeField()),
                (
                    "attempt",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="quiz_results",
                        to="app_quiz_v3.quizattempt",
                    ),
                ),
                (
                    "quiz",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="released_results",
                        to="app_quiz_v3.quiz",
                    ),
                ),
                (
                    "released_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="quiz_v3_results_released",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="quiz_v3_released_results",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "abstract": False,
            },
        ),
        migrations.AddConstraint(
            model_name="quizresult",
            constraint=models.UniqueConstraint(fields=("quiz", "user"), name="uniq_quizresult_quiz_user"),
        ),
        migrations.CreateModel(
            name="EssayComment",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("anchor_start", models.PositiveIntegerField()),
                ("anchor_end", models.PositiveIntegerField()),
                ("body", models.TextField()),
                (
                    "attempt_answer",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="essay_comments",
                        to="app_quiz_v3.attemptanswer",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="quiz_v3_essay_comments_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "abstract": False,
            },
        ),
        migrations.AddConstraint(
            model_name="essaycomment",
            constraint=models.CheckConstraint(
                check=models.Q(anchor_end__gt=models.F("anchor_start")),
                name="ck_essay_comment_anchor_range",
            ),
        ),
    ]

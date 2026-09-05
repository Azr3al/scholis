"""Backfill QuizResult for essay quizzes where the learner's latest attempt is fully graded."""

from django.db import migrations
from django.utils import timezone


def forwards(apps, schema_editor):
    Quiz = apps.get_model("app_quiz_v3", "Quiz")
    Question = apps.get_model("app_quiz_v3", "Question")
    QuizAttempt = apps.get_model("app_quiz_v3", "QuizAttempt")
    AttemptAnswer = apps.get_model("app_quiz_v3", "AttemptAnswer")
    QuizResult = apps.get_model("app_quiz_v3", "QuizResult")

    essay_quiz_ids = list(
        Question.objects.filter(question_type="ESSAY").values_list("quiz_id", flat=True).distinct()
    )
    if not essay_quiz_ids:
        return

    now = timezone.now()
    for quiz_id in essay_quiz_ids:
        if not Quiz.objects.filter(pk=quiz_id).exists():
            continue
        user_ids = (
            QuizAttempt.objects.filter(quiz_id=quiz_id, submitted_at__isnull=False)
            .values_list("user_id", flat=True)
            .distinct()
        )
        for user_id in user_ids:
            latest = (
                QuizAttempt.objects.filter(quiz_id=quiz_id, user_id=user_id, submitted_at__isnull=False)
                .order_by("-submitted_at", "-id")
                .first()
            )
            if latest is None:
                continue
            pending = AttemptAnswer.objects.filter(
                attempt=latest,
                question__question_type="ESSAY",
                graded_at__isnull=True,
            ).exists()
            if pending:
                continue
            QuizResult.objects.get_or_create(
                quiz_id=quiz_id,
                user_id=user_id,
                defaults={
                    "attempt_id": latest.id,
                    "released_at": now,
                    "released_by_id": None,
                },
            )


def backwards(apps, schema_editor):
    QuizResult = apps.get_model("app_quiz_v3", "QuizResult")
    QuizResult.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("app_quiz_v3", "0014_grading_release_models"),
    ]

    operations = [migrations.RunPython(forwards, backwards)]

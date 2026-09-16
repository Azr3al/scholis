"""Helpers for essay-quiz result release and essay-quiz detection."""

from typing import TypedDict

from django.db import transaction
from django.utils import timezone

from app_auth.models import User
from app_quiz_v3 import models as qm


def quiz_has_essay_questions(quiz_id: int) -> bool:
    return qm.Question.objects.filter(
        quiz_id=quiz_id,
        question_type=qm.Question.QuestionType.ESSAY,
    ).exists()


def attempt_release_eligibility(attempt: qm.QuizAttempt) -> str | None:
    """Return error code string if not eligible, or None if eligible."""
    if not attempt.submitted_at:
        return "not_submitted"
    if not quiz_has_essay_questions(attempt.quiz_id):
        return "not_essay_quiz"
    if attempt.essay_grading_waived_at is not None:
        return None
    pending = qm.AttemptAnswer.objects.filter(
        attempt=attempt,
        question__question_type=qm.Question.QuestionType.ESSAY,
        graded_at__isnull=True,
    ).exists()
    if pending:
        return "needs_grading"
    return None


class ReleaseError(TypedDict):
    attempt_id: int
    code: str


class ReleaseResult(TypedDict):
    released: list[int]
    errors: list[ReleaseError]


@transaction.atomic
def release_attempts(quiz: qm.Quiz, attempt_ids: list[int], *, by_user: User) -> ReleaseResult:
    """Upsert ``QuizResult`` per student's attempt; partial batch tolerated."""
    released: list[int] = []
    errors: list[ReleaseError] = []
    attempts = qm.QuizAttempt.objects.filter(quiz=quiz, id__in=attempt_ids).select_related("user")
    found_ids = {a.id for a in attempts}
    for missing in set(attempt_ids) - found_ids:
        errors.append({"attempt_id": missing, "code": "wrong_quiz"})
    for attempt in attempts:
        elig = attempt_release_eligibility(attempt)
        if elig is not None:
            errors.append({"attempt_id": attempt.id, "code": elig})
            continue
        qm.QuizResult.objects.update_or_create(
            quiz=quiz,
            user=attempt.user,
            defaults={
                "attempt": attempt,
                "released_at": timezone.now(),
                "released_by": by_user,
            },
        )
        released.append(attempt.id)
    return {"released": released, "errors": errors}


def unrelease_for_user(quiz: qm.Quiz, user_id: int) -> bool:
    """Delete the released row for this student on this quiz. Returns True if a row was removed."""
    deleted, _ = qm.QuizResult.objects.filter(quiz=quiz, user_id=user_id).delete()
    return deleted > 0



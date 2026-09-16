"""release_attempts and quiz essay detection helpers."""

import unittest

from app_quiz_v3.tests.quiz_view_test_case import QuizViewTestCase, database_reachable
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_quiz_v3 import models as qm
from app_quiz_v3.release import (
    attempt_release_eligibility,
    quiz_has_essay_questions,
    release_attempts,
    unrelease_for_user,
)

@unittest.skipUnless(database_reachable(), "PostgreSQL not available")
class ReleaseHelpersTests(QuizViewTestCase):
    schema_name = "xschedjuice"

    def _setup_quiz(self, with_essay: bool):
        admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
        student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).first()
        quiz = qm.Quiz.objects.create(title="t-rel", created_by=admin)
        if with_essay:
            qm.Question.objects.create(
                quiz=quiz,
                question_type=qm.Question.QuestionType.ESSAY,
                body={},
                body_plaintext="E",
                points=5,
                display_order=0,
            )
        return admin, student, quiz

    def test_quiz_has_essay_questions(self):
        with schema_context(self.schema_name):
            _, _, q1 = self._setup_quiz(with_essay=True)
            _, _, q2 = self._setup_quiz(with_essay=False)
            self.assertTrue(quiz_has_essay_questions(q1.id))
            self.assertFalse(quiz_has_essay_questions(q2.id))

    def test_eligibility_needs_grading_blocks_release(self):
        with schema_context(self.schema_name):
            admin, student, quiz = self._setup_quiz(with_essay=True)
            essay_q = quiz.questions.first()
            attempt = qm.QuizAttempt.objects.create(
                quiz=quiz,
                user=student,
                started_at=timezone.now(),
                submitted_at=timezone.now(),
            )
            qm.AttemptAnswer.objects.create(
                attempt=attempt,
                question=essay_q,
                response_text={"text": "x"},
            )
            self.assertEqual(attempt_release_eligibility(attempt), "needs_grading")

    def test_release_creates_quiz_result(self):
        with schema_context(self.schema_name):
            admin, student, quiz = self._setup_quiz(with_essay=True)
            essay_q = quiz.questions.first()
            attempt = qm.QuizAttempt.objects.create(
                quiz=quiz,
                user=student,
                started_at=timezone.now(),
                submitted_at=timezone.now(),
                essay_grading_waived_at=timezone.now(),
                essay_grading_waived_by=admin,
            )
            qm.AttemptAnswer.objects.create(
                attempt=attempt,
                question=essay_q,
                response_text={"text": "x"},
            )
            result = release_attempts(quiz, [attempt.id], by_user=admin)
            self.assertEqual(result["released"], [attempt.id])
            self.assertEqual(result["errors"], [])
            self.assertTrue(
                qm.QuizResult.objects.filter(quiz=quiz, user=student, attempt=attempt).exists()
            )

    def test_release_replaces_prior_attempt_for_same_user(self):
        with schema_context(self.schema_name):
            admin, student, quiz = self._setup_quiz(with_essay=True)
            essay_q = quiz.questions.first()
            a1 = qm.QuizAttempt.objects.create(
                quiz=quiz,
                user=student,
                started_at=timezone.now(),
                submitted_at=timezone.now(),
                essay_grading_waived_at=timezone.now(),
                essay_grading_waived_by=admin,
            )
            qm.AttemptAnswer.objects.create(attempt=a1, question=essay_q, response_text={"text": "x"})
            release_attempts(quiz, [a1.id], by_user=admin)

            a2 = qm.QuizAttempt.objects.create(
                quiz=quiz,
                user=student,
                started_at=timezone.now(),
                submitted_at=timezone.now(),
                essay_grading_waived_at=timezone.now(),
                essay_grading_waived_by=admin,
            )
            qm.AttemptAnswer.objects.create(attempt=a2, question=essay_q, response_text={"text": "y"})
            release_attempts(quiz, [a2.id], by_user=admin)

            results = list(qm.QuizResult.objects.filter(quiz=quiz, user=student))
            self.assertEqual(len(results), 1)
            self.assertEqual(results[0].attempt_id, a2.id)

    def test_unrelease_deletes_row(self):
        with schema_context(self.schema_name):
            admin, student, quiz = self._setup_quiz(with_essay=True)
            essay_q = quiz.questions.first()
            attempt = qm.QuizAttempt.objects.create(
                quiz=quiz,
                user=student,
                started_at=timezone.now(),
                submitted_at=timezone.now(),
                essay_grading_waived_at=timezone.now(),
                essay_grading_waived_by=admin,
            )
            qm.AttemptAnswer.objects.create(
                attempt=attempt,
                question=essay_q,
                response_text={"text": "x"},
            )
            release_attempts(quiz, [attempt.id], by_user=admin)
            self.assertTrue(qm.QuizResult.objects.filter(quiz=quiz, user=student).exists())

            unrelease_for_user(quiz, student.id)
            self.assertFalse(qm.QuizResult.objects.filter(quiz=quiz, user=student).exists())

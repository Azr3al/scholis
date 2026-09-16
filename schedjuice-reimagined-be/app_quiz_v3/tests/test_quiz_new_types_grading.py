"""Auto-grading for TRUE_FALSE, SHORT_ANSWER, ESSAY + recalculate_attempt_totals."""

import unittest
from decimal import Decimal

from app_quiz_v3.tests.quiz_view_test_case import QuizViewTestCase, database_reachable
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_quiz_v3 import models as qm
from app_quiz_v3.grading import grade_attempt, recalculate_attempt_totals

@unittest.skipUnless(
    database_reachable(),
    "PostgreSQL not available (set DATABASE_URL, e.g. local Docker on 127.0.0.1:55432)",
)
class QuizNewTypesGradingTests(QuizViewTestCase):
    schema_name = "xschedjuice"

    def test_true_false_and_short_answer_grading(self):
        with schema_context(self.schema_name):
            admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            self.assertIsNotNone(admin)
            student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).first()
            self.assertIsNotNone(student)

            quiz = qm.Quiz.objects.create(title="Types", created_by=admin)
            q_tf = qm.Question.objects.create(
                quiz=quiz,
                question_type=qm.Question.QuestionType.TRUE_FALSE,
                body={},
                body_plaintext="tf",
                points=2,
                display_order=0,
                correct_true=True,
            )
            q_sa = qm.Question.objects.create(
                quiz=quiz,
                question_type=qm.Question.QuestionType.SHORT_ANSWER,
                body={},
                body_plaintext="sa",
                points=3,
                display_order=1,
                is_case_sensitive=False,
            )
            qm.QuestionShortAnswerAcceptableAnswer.objects.create(
                question=q_sa,
                body="Paris",
                display_order=0,
            )

            attempt = qm.QuizAttempt.objects.create(
                quiz=quiz,
                user=student,
                started_at=timezone.now(),
            )
            qm.AttemptAnswer.objects.create(
                attempt=attempt,
                question=q_tf,
                score=0,
                response_text={"value": True},
            )
            qm.AttemptAnswer.objects.create(
                attempt=attempt,
                question=q_sa,
                score=0,
                response_text={"text": "paris"},
            )
            grade_attempt(attempt)
            attempt.refresh_from_db()
            self.assertEqual(attempt.score, Decimal("5"))
            self.assertEqual(attempt.max_score, 5)

    def test_essay_stays_zero_until_graded_recalculate_updates_total(self):
        with schema_context(self.schema_name):
            admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).first()
            quiz = qm.Quiz.objects.create(title="Essay quiz", created_by=admin)
            q_e = qm.Question.objects.create(
                quiz=quiz,
                question_type=qm.Question.QuestionType.ESSAY,
                body={},
                body_plaintext="e",
                points=10,
                display_order=0,
            )
            attempt = qm.QuizAttempt.objects.create(
                quiz=quiz,
                user=student,
                started_at=timezone.now(),
            )
            aa = qm.AttemptAnswer.objects.create(
                attempt=attempt,
                question=q_e,
                score=0,
                response_text={"text": "Draft"},
            )
            grade_attempt(attempt)
            attempt.refresh_from_db()
            self.assertEqual(attempt.score, Decimal("0"))
            aa.score = Decimal("7")
            aa.graded_at = timezone.now()
            aa.save(update_fields=["score", "graded_at", "updated_at"])
            recalculate_attempt_totals(attempt)
            attempt.refresh_from_db()
            self.assertEqual(attempt.score, Decimal("7"))
            self.assertEqual(attempt.max_score, 10)

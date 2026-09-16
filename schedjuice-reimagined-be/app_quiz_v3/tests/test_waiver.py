"""Per-attempt and bulk essay waiver endpoints."""

import unittest

from app_quiz_v3.tests.quiz_view_test_case import QuizViewTestCase, attach_view_request_user, database_reachable
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIRequestFactory
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_quiz_v3 import models as qm
from app_quiz_v3.views import QuizAttemptWaiveEssayGradingView, QuizBulkWaiveEssayGradingView

@unittest.skipUnless(database_reachable(), "PostgreSQL not available")
class WaiverEndpointTests(QuizViewTestCase):
    schema_name = "xschedjuice"

    def _setup_attempt(self):
        admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
        student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).first()
        quiz = qm.Quiz.objects.create(title="we", created_by=admin)
        qm.Question.objects.create(
            quiz=quiz,
            question_type=qm.Question.QuestionType.ESSAY,
            body={},
            body_plaintext="E",
            points=5,
            display_order=0,
        )
        attempt = qm.QuizAttempt.objects.create(
            quiz=quiz,
            user=student,
            started_at=timezone.now(),
            submitted_at=timezone.now(),
        )
        return admin, quiz, attempt

    def test_post_waive_sets_fields(self):
        with schema_context(self.schema_name):
            admin, _, attempt = self._setup_attempt()
            f = APIRequestFactory()
            wsgi = f.post(f"/quizzes/attempts/{attempt.id}/waive-essay-grading")
            attach_view_request_user(wsgi, admin.email)
            resp = QuizAttemptWaiveEssayGradingView.as_view()(wsgi, attempt_id=attempt.id)
            self.assertEqual(resp.status_code, status.HTTP_200_OK)
            attempt.refresh_from_db()
            self.assertIsNotNone(attempt.essay_grading_waived_at)
            self.assertEqual(attempt.essay_grading_waived_by_id, admin.id)

    def test_delete_clears_when_unreleased(self):
        with schema_context(self.schema_name):
            admin, _, attempt = self._setup_attempt()
            attempt.essay_grading_waived_at = timezone.now()
            attempt.essay_grading_waived_by = admin
            attempt.save(update_fields=["essay_grading_waived_at", "essay_grading_waived_by"])
            f = APIRequestFactory()
            wsgi = f.delete(f"/quizzes/attempts/{attempt.id}/waive-essay-grading")
            attach_view_request_user(wsgi, admin.email)
            resp = QuizAttemptWaiveEssayGradingView.as_view()(wsgi, attempt_id=attempt.id)
            self.assertEqual(resp.status_code, status.HTTP_200_OK)
            attempt.refresh_from_db()
            self.assertIsNone(attempt.essay_grading_waived_at)

    def test_delete_blocked_when_released(self):
        with schema_context(self.schema_name):
            admin, quiz, attempt = self._setup_attempt()
            attempt.essay_grading_waived_at = timezone.now()
            attempt.essay_grading_waived_by = admin
            attempt.save()
            qm.QuizResult.objects.create(
                quiz=quiz,
                user=attempt.user,
                attempt=attempt,
                released_at=timezone.now(),
                released_by=admin,
            )
            f = APIRequestFactory()
            wsgi = f.delete(f"/quizzes/attempts/{attempt.id}/waive-essay-grading")
            attach_view_request_user(wsgi, admin.email)
            resp = QuizAttemptWaiveEssayGradingView.as_view()(wsgi, attempt_id=attempt.id)
            self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_bulk_waive(self):
        with schema_context(self.schema_name):
            admin, quiz, _ = self._setup_attempt()
            essay_q = quiz.questions.first()
            student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).first()
            ids = []
            for _ in range(3):
                a = qm.QuizAttempt.objects.create(
                    quiz=quiz,
                    user=student,
                    started_at=timezone.now(),
                    submitted_at=timezone.now(),
                )
                qm.AttemptAnswer.objects.create(
                    attempt=a, question=essay_q, response_text={"text": "x"}
                )
                ids.append(a.id)
            f = APIRequestFactory()
            wsgi = f.post(
                f"/quizzes/{quiz.id}/waive-essay-grading-bulk",
                {"attempt_ids": ids},
                format="json",
            )
            attach_view_request_user(wsgi, admin.email)
            resp = QuizBulkWaiveEssayGradingView.as_view()(wsgi, quiz_id=quiz.id)
            self.assertEqual(resp.status_code, status.HTTP_200_OK)
            self.assertEqual(
                qm.QuizAttempt.objects.filter(
                    id__in=ids,
                    essay_grading_waived_at__isnull=False,
                ).count(),
                3,
            )

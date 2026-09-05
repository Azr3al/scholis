"""Release / unrelease endpoints."""

import unittest

from app_quiz_v3.tests.quiz_view_test_case import QuizViewTestCase, attach_view_request_user, database_reachable
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIRequestFactory
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_quiz_v3 import models as qm
from app_quiz_v3.views import QuizReleaseView, QuizResultDeleteView

@unittest.skipUnless(database_reachable(), "PostgreSQL not available")
class ReleaseEndpointTests(QuizViewTestCase):
    schema_name = "xschedjuice"

    def _setup(self):
        admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
        student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).first()
        quiz = qm.Quiz.objects.create(title="rel", created_by=admin)
        essay_q = qm.Question.objects.create(
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
            essay_grading_waived_at=timezone.now(),
            essay_grading_waived_by=admin,
        )
        qm.AttemptAnswer.objects.create(
            attempt=attempt,
            question=essay_q,
            response_text={"text": "x"},
        )
        return admin, student, quiz, attempt

    def _post_release(self, admin, quiz, attempt_ids):
        f = APIRequestFactory()
        wsgi = f.post(f"/quizzes/{quiz.id}/release", {"attempt_ids": attempt_ids}, format="json")
        attach_view_request_user(wsgi, admin.email)
        return QuizReleaseView.as_view()(wsgi, quiz_id=quiz.id)

    def test_release_partial_batch_returns_per_attempt_errors(self):
        with schema_context(self.schema_name):
            admin, student, quiz, attempt = self._setup()
            essay_q = quiz.questions.first()
            ungraded = qm.QuizAttempt.objects.create(
                quiz=quiz,
                user=student,
                started_at=timezone.now(),
                submitted_at=timezone.now(),
            )
            qm.AttemptAnswer.objects.create(
                attempt=ungraded,
                question=essay_q,
                response_text={"text": "y"},
            )
            resp = self._post_release(admin, quiz, [attempt.id, ungraded.id])
            self.assertEqual(resp.status_code, status.HTTP_200_OK)
            data = resp.data["data"]
            self.assertIn(attempt.id, data["released"])
            codes = {e["code"] for e in data["errors"]}
            self.assertIn("needs_grading", codes)

    def test_unrelease_deletes_row(self):
        with schema_context(self.schema_name):
            admin, student, quiz, attempt = self._setup()
            self._post_release(admin, quiz, [attempt.id])
            f = APIRequestFactory()
            wsgi = f.delete(f"/quizzes/{quiz.id}/results/{student.id}")
            attach_view_request_user(wsgi, admin.email)
            resp = QuizResultDeleteView.as_view()(wsgi, quiz_id=quiz.id, user_id=student.id)
            self.assertEqual(resp.status_code, status.HTTP_200_OK)
            self.assertFalse(qm.QuizResult.objects.filter(quiz=quiz, user=student).exists())

    def test_unrelease_idempotent(self):
        with schema_context(self.schema_name):
            admin, student, quiz, _ = self._setup()
            f = APIRequestFactory()
            wsgi = f.delete(f"/quizzes/{quiz.id}/results/{student.id}")
            attach_view_request_user(wsgi, admin.email)
            resp = QuizResultDeleteView.as_view()(wsgi, quiz_id=quiz.id, user_id=student.id)
            self.assertEqual(resp.status_code, status.HTTP_200_OK)

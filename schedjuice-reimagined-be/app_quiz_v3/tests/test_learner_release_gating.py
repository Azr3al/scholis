"""Learner attempt detail and take-result gating for essay quizzes."""

import unittest
import uuid

from app_quiz_v3.tests.quiz_view_test_case import QuizViewTestCase, attach_view_request_user, database_reachable
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIRequestFactory
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import UserCourse
from app_quiz_v3 import models as qm
from app_quiz_v3.views import QuizAttemptDetailsView, QuizTakeAttemptResultView

@unittest.skipUnless(database_reachable(), "PostgreSQL not available")
class LearnerReleaseGatingTests(QuizViewTestCase):
    schema_name = "xschedjuice"

    def _seed(self, with_essay: bool, can_show: bool):
        admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
        student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).first()
        uc = UserCourse.objects.filter(
            user=student,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        ).first()
        code = uuid.uuid4()
        quiz = qm.Quiz.objects.create(
            title="lrg",
            status=qm.Quiz.QuizStatus.OPEN,
            created_by=admin,
            code=code,
            course=uc.course,
            can_show_answers_afterwards=can_show,
        )
        if with_essay:
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
        return admin, student, quiz, attempt, code

    def _get_detail(self, attempt_id, user_email):
        f = APIRequestFactory()
        wsgi = f.get(f"/quizzes/attempts/{attempt_id}")
        attach_view_request_user(wsgi, user_email)
        return QuizAttemptDetailsView.as_view()(wsgi, obj_id=attempt_id)

    def _get_take_result(self, code, attempt_id, user_email):
        f = APIRequestFactory()
        wsgi = f.get(f"/quizzes/take/{code}/attempts/{attempt_id}")
        attach_view_request_user(wsgi, user_email)
        return QuizTakeAttemptResultView.as_view()(wsgi, code=code, attempt_id=attempt_id)

    def test_essay_quiz_unreleased_returns_awaiting_detail(self):
        with schema_context(self.schema_name):
            _, student, _, attempt, _ = self._seed(with_essay=True, can_show=True)
            resp = self._get_detail(attempt.id, student.email)
            self.assertEqual(resp.status_code, status.HTTP_200_OK)
            self.assertEqual(resp.data["data"]["review_mode"], "awaiting_release")

    def test_essay_quiz_released_returns_full_with_feedback_take(self):
        with schema_context(self.schema_name):
            admin, student, quiz, attempt, code = self._seed(with_essay=True, can_show=True)
            essay_q = quiz.questions.first()
            qm.AttemptAnswer.objects.create(
                attempt=attempt,
                question=essay_q,
                response_text={"text": "x"},
                feedback={"type": "doc", "content": [{"type": "paragraph"}]},
            )
            qm.QuizResult.objects.create(
                quiz=quiz,
                user=student,
                attempt=attempt,
                released_at=timezone.now(),
                released_by=admin,
            )
            resp = self._get_take_result(code, attempt.id, student.email)
            self.assertEqual(resp.status_code, status.HTTP_200_OK)
            self.assertEqual(resp.data["data"]["review_mode"], "full")
            answers = resp.data["data"]["answers"]
            self.assertTrue(any(a.get("feedback") for a in answers))

    def test_non_essay_quiz_not_awaiting_release(self):
        with schema_context(self.schema_name):
            _, student, quiz, attempt, _ = self._seed(with_essay=False, can_show=True)
            resp = self._get_detail(attempt.id, student.email)
            self.assertNotEqual(resp.data["data"].get("review_mode"), "awaiting_release")

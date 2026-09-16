import unittest
import uuid
from decimal import Decimal

from app_quiz_v3.tests.quiz_view_test_case import (
    QuizViewTestCase,
    attach_view_request_user,
    database_reachable,
)
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIRequestFactory
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import UserCourse
from app_quiz_v3 import models as qm
from app_quiz_v3.tests.quiz_view_helpers import call_view_in_schema
from app_quiz_v3.views import QuizAttemptDetailsView, QuizTakeAttemptResultView

@unittest.skipUnless(
    database_reachable(),
    "PostgreSQL not available (set DATABASE_URL, e.g. local Docker on 127.0.0.1:55432)",
)
class QuizTakeAttemptResultTests(QuizViewTestCase):
    schema_name = "xschedjuice"

    def _make_submitted_attempt(self, *, show_answers: bool):
        with schema_context(self.schema_name):
            admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            self.assertIsNotNone(admin)
            student = User.objects.filter(
                roles__contains=[User.UserRole.STUDENT]
            ).first()
            self.assertIsNotNone(student)

            code = uuid.uuid4()
            uc = UserCourse.objects.filter(
                user=student,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            ).first()
            self.assertIsNotNone(uc)
            quiz = qm.Quiz.objects.create(
                title="Take result quiz",
                status=qm.Quiz.QuizStatus.OPEN,
                created_by=admin,
                code=code,
                can_show_answers_afterwards=show_answers,
                course=uc.course,
            )
            qm.Question.objects.create(
                quiz=quiz,
                question_type=qm.Question.QuestionType.SINGLE_CHOICE,
                body={},
                body_plaintext="q1",
                display_order=0,
            )
            now = timezone.now()
            attempt = qm.QuizAttempt.objects.create(
                quiz=quiz,
                user=student,
                score=1,
                max_score=1,
                started_at=now,
                submitted_at=now,
            )
            return quiz, attempt, student

    def test_take_result_summary_when_flag_off(self):
        quiz, attempt, student = self._make_submitted_attempt(show_answers=False)
        factory = APIRequestFactory()
        wsgi = factory.get(f"/quizzes/take/{quiz.code}/attempts/{attempt.id}")
        request = attach_view_request_user(wsgi, student.email)

        resp = call_view_in_schema(
            self.schema_name,
            QuizTakeAttemptResultView(),
            "get",
            request,
            code=quiz.code,
            attempt_id=attempt.id,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.data
        self.assertFalse(body["isError"])
        data = body["data"]
        self.assertEqual(data["review_mode"], "summary")
        self.assertEqual(data["attempt_id"], attempt.id)
        self.assertNotIn("answers", data)
        self.assertIn("has_pending_essay_grading", data)
        self.assertFalse(data["has_pending_essay_grading"])

    def test_take_result_full_when_flag_on(self):
        quiz, attempt, student = self._make_submitted_attempt(show_answers=True)
        factory = APIRequestFactory()
        wsgi = factory.get(f"/quizzes/take/{quiz.code}/attempts/{attempt.id}")
        request = attach_view_request_user(wsgi, student.email)

        resp = call_view_in_schema(
            self.schema_name,
            QuizTakeAttemptResultView(),
            "get",
            request,
            code=quiz.code,
            attempt_id=attempt.id,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.data["data"]
        self.assertEqual(data["review_mode"], "full")
        self.assertIn("answers", data)

    def test_take_result_wrong_code_404(self):
        quiz, attempt, student = self._make_submitted_attempt(show_answers=False)
        factory = APIRequestFactory()
        wrong = uuid.uuid4()
        wsgi = factory.get(f"/quizzes/take/{wrong}/attempts/{attempt.id}")
        request = attach_view_request_user(wsgi, student.email)

        resp = call_view_in_schema(
            self.schema_name,
            QuizTakeAttemptResultView(),
            "get",
            request,
            code=wrong,
            attempt_id=attempt.id,
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_attempt_details_redacts_for_owner_when_flag_off(self):
        quiz, attempt, student = self._make_submitted_attempt(show_answers=False)
        factory = APIRequestFactory()
        wsgi = factory.get(f"/quizzes/attempts/{attempt.id}")
        request = attach_view_request_user(wsgi, student.email)

        resp = call_view_in_schema(
            self.schema_name,
            QuizAttemptDetailsView(),
            "get",
            request,
            obj_id=attempt.id,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.data["data"]
        self.assertEqual(data.get("review_mode"), "summary")
        self.assertNotIn("answers", data)
        self.assertFalse(data["has_pending_essay_grading"])

    def _make_submitted_attempt_with_essay(self, *, graded: bool):
        with schema_context(self.schema_name):
            admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            self.assertIsNotNone(admin)
            student = User.objects.filter(
                roles__contains=[User.UserRole.STUDENT]
            ).first()
            self.assertIsNotNone(student)

            code = uuid.uuid4()
            uc = UserCourse.objects.filter(
                user=student,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            ).first()
            self.assertIsNotNone(uc)
            quiz = qm.Quiz.objects.create(
                title="Essay summary quiz",
                status=qm.Quiz.QuizStatus.OPEN,
                created_by=admin,
                code=code,
                can_show_answers_afterwards=False,
                course=uc.course,
            )
            q_essay = qm.Question.objects.create(
                quiz=quiz,
                question_type=qm.Question.QuestionType.ESSAY,
                body={},
                body_plaintext="Essay prompt",
                points=10,
                display_order=0,
            )
            now = timezone.now()
            attempt = qm.QuizAttempt.objects.create(
                quiz=quiz,
                user=student,
                score=Decimal("0"),
                max_score=10,
                started_at=now,
                submitted_at=now,
            )
            aa = qm.AttemptAnswer.objects.create(
                attempt=attempt,
                question=q_essay,
                score=Decimal("0"),
                response_text={"text": "Draft."},
            )
            if graded:
                aa.graded_at = now
                aa.save(update_fields=["graded_at"])
                qm.QuizResult.objects.create(
                    quiz=quiz,
                    user=student,
                    attempt=attempt,
                    released_at=now,
                    released_by=admin,
                )
            return quiz, attempt, student

    def test_summary_has_pending_essay_grading_when_ungraded(self):
        quiz, attempt, student = self._make_submitted_attempt_with_essay(graded=False)
        factory = APIRequestFactory()
        wsgi = factory.get(f"/quizzes/take/{quiz.code}/attempts/{attempt.id}")
        request = attach_view_request_user(wsgi, student.email)

        resp = call_view_in_schema(
            self.schema_name,
            QuizTakeAttemptResultView(),
            "get",
            request,
            code=quiz.code,
            attempt_id=attempt.id,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["data"]["has_pending_essay_grading"])

    def test_summary_no_pending_essay_grading_when_essay_graded(self):
        quiz, attempt, student = self._make_submitted_attempt_with_essay(graded=True)
        factory = APIRequestFactory()
        wsgi = factory.get(f"/quizzes/take/{quiz.code}/attempts/{attempt.id}")
        request = attach_view_request_user(wsgi, student.email)

        resp = call_view_in_schema(
            self.schema_name,
            QuizTakeAttemptResultView(),
            "get",
            request,
            code=quiz.code,
            attempt_id=attempt.id,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data["data"]["has_pending_essay_grading"])


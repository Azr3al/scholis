"""Submit idempotency + select_for_update path."""

import unittest
import uuid

from app_quiz_v3.tests.quiz_view_test_case import QuizViewTestCase, attach_view_request_user, database_reachable
from rest_framework import status
from rest_framework.test import APIRequestFactory
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import UserCourse
from app_quiz_v3 import models as qm
from app_quiz_v3.views import QuizSubmitView, QuizTakeBeginView

@unittest.skipUnless(
    database_reachable(),
    "PostgreSQL not available (set DATABASE_URL, e.g. local Docker on 127.0.0.1:55432)",
)
class QuizSubmitIdempotencyTests(QuizViewTestCase):
    schema_name = "xschedjuice"

    def test_duplicate_submit_same_idempotency_key_returns_200(self):
        with schema_context(self.schema_name):
            admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).first()
            uc = UserCourse.objects.filter(
                user=student,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            ).first()
            self.assertIsNotNone(uc)

            code = uuid.uuid4()
            quiz = qm.Quiz.objects.create(
                title="Idem quiz",
                status=qm.Quiz.QuizStatus.OPEN,
                created_by=admin,
                code=code,
                course=uc.course,
            )
            question = qm.Question.objects.create(
                quiz=quiz,
                question_type=qm.Question.QuestionType.SINGLE_CHOICE,
                body={},
                body_plaintext="Q",
                display_order=0,
            )
            opt_ok = qm.QuestionOption.objects.create(
                question=question,
                body={"type": "doc", "content": []},
                is_correct=True,
                display_order=0,
            )
            qm.QuestionOption.objects.create(
                question=question,
                body={"type": "doc", "content": []},
                is_correct=False,
                display_order=1,
            )

            factory = APIRequestFactory()
            wsgi_b = factory.post(f"/quizzes/take/{code}/begin")
            attach_view_request_user(wsgi_b, student.email)
            beg = QuizTakeBeginView.as_view()(wsgi_b, code=code)
            self.assertEqual(beg.status_code, status.HTTP_200_OK)
            attempt_id = beg.data["data"]["attempt_id"]

            answers = {str(question.id): [opt_ok.id]}
            payload = {"attempt_id": attempt_id, "answers": answers}

            wsgi1 = factory.post(
                f"/quizzes/take/{code}/submit",
                payload,
                format="json",
                HTTP_IDEMPOTENCY_KEY="idem-submit-1",
            )
            attach_view_request_user(wsgi1, student.email)
            r1 = QuizSubmitView.as_view()(wsgi1, code=code)
            self.assertEqual(r1.status_code, status.HTTP_200_OK)
            self.assertFalse(r1.data["isError"])

            wsgi2 = factory.post(
                f"/quizzes/take/{code}/submit",
                payload,
                format="json",
                HTTP_IDEMPOTENCY_KEY="idem-submit-1",
            )
            attach_view_request_user(wsgi2, student.email)
            r2 = QuizSubmitView.as_view()(wsgi2, code=code)
            self.assertEqual(r2.status_code, status.HTTP_200_OK)
            self.assertFalse(r2.data["isError"])

            att = qm.QuizAttempt.objects.get(id=attempt_id)
            self.assertEqual(att.submit_idempotency_key, "idem-submit-1")
            self.assertEqual(
                qm.AttemptAnswer.objects.filter(attempt=att).count(),
                1,
            )

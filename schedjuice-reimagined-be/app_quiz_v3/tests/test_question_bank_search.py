import unittest

from app_quiz_v3.tests.quiz_view_test_case import (
    QuizViewTestCase,
    attach_view_request_user,
    database_reachable,
)
from rest_framework import status
from rest_framework.test import APIRequestFactory
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_quiz_v3 import models as qm
from app_quiz_v3.views import QuizQuestionBankSearchView

@unittest.skipUnless(
    database_reachable(),
    "PostgreSQL not available (set DATABASE_URL, e.g. local Docker on 127.0.0.1:55432)",
)
class QuizQuestionBankSearchTest(QuizViewTestCase):
    schema_name = "xschedjuice"

    def _post_search(self, user: User, payload: dict | None = None):
        factory = APIRequestFactory()
        body = (
            payload
            if payload is not None
            else {"filter_params": [], "exclude_params": []}
        )
        wsgi = factory.post("/quiz-questions/search", body, format="json")
        request = attach_view_request_user(wsgi, user.email)
        with schema_context(self.schema_name):
            view = QuizQuestionBankSearchView()
            view.request = request
            view.format_kwarg = None
            return view.post(request)

    def test_teacher_sees_only_questions_from_visible_quizzes(self):
        with schema_context(self.schema_name):
            admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            self.assertIsNotNone(admin)
            teacher = (
                User.objects.filter(roles__contains=[User.UserRole.TEACHER])
                .exclude(roles__contains=[User.UserRole.ADMIN])
                .exclude(roles__contains=[User.UserRole.MANAGER])
                .exclude(roles__contains=[User.UserRole.SUPERADMIN])
                .first()
            )
            self.assertIsNotNone(teacher)

            quiz_teacher = qm.Quiz.objects.create(
                title="Teacher-owned bank quiz",
                created_by=teacher,
            )
            q_visible = qm.Question.objects.create(
                quiz=quiz_teacher,
                question_type=qm.Question.QuestionType.SINGLE_CHOICE,
                body={},
                body_plaintext="visible q",
                display_order=0,
            )

            quiz_admin_only = qm.Quiz.objects.create(
                title="Admin-only bank quiz",
                created_by=admin,
            )
            q_hidden = qm.Question.objects.create(
                quiz=quiz_admin_only,
                question_type=qm.Question.QuestionType.SINGLE_CHOICE,
                body={},
                body_plaintext="hidden q",
                display_order=0,
            )

            resp = self._post_search(teacher)
            self.assertEqual(resp.status_code, status.HTTP_200_OK)
            self.assertFalse(resp.data["isError"])
            rows = resp.data["data"]
            ids = {r["id"] for r in rows}
            self.assertIn(q_visible.id, ids)
            self.assertNotIn(q_hidden.id, ids)


"""PATCH take progress + saved_answers hydrate on GET take."""

import unittest
import uuid

from app_quiz_v3.tests.quiz_view_test_case import QuizViewTestCase, attach_view_request_user, database_reachable
from rest_framework import status
from rest_framework.test import APIRequestFactory
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import UserCourse
from app_quiz_v3 import models as qm
from app_quiz_v3.views import QuizTakeBeginView, QuizTakeProgressView, QuizTakeView

@unittest.skipUnless(
    database_reachable(),
    "PostgreSQL not available (set DATABASE_URL, e.g. local Docker on 127.0.0.1:55432)",
)
class QuizProgressAutosaveTests(QuizViewTestCase):
    schema_name = "xschedjuice"

    def test_patch_progress_then_get_includes_saved_answers(self):
        with schema_context(self.schema_name):
            admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            self.assertIsNotNone(admin)
            student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).first()
            self.assertIsNotNone(student)
            uc = UserCourse.objects.filter(
                user=student,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            ).first()
            self.assertIsNotNone(uc)

            code = uuid.uuid4()
            quiz = qm.Quiz.objects.create(
                title="Progress quiz",
                status=qm.Quiz.QuizStatus.OPEN,
                created_by=admin,
                code=code,
                course=uc.course,
            )
            question = qm.Question.objects.create(
                quiz=quiz,
                question_type=qm.Question.QuestionType.SINGLE_CHOICE,
                body={},
                body_plaintext="Pick one",
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
            wsgi_begin = factory.post(f"/quizzes/take/{code}/begin")
            attach_view_request_user(wsgi_begin, student.email)
            begin_req = wsgi_begin
            beg = QuizTakeBeginView.as_view()(begin_req, code=code)
            self.assertEqual(beg.status_code, status.HTTP_200_OK)
            attempt_id = beg.data["data"]["attempt_id"]

            wsgi_patch = factory.patch(
                f"/quizzes/take/{code}/progress",
                {"attempt_id": attempt_id, "answers": {str(question.id): [opt_ok.id]}},
                format="json",
            )
            attach_view_request_user(wsgi_patch, student.email)
            patch_req = wsgi_patch
            prog = QuizTakeProgressView.as_view()(patch_req, code=code)
            self.assertEqual(prog.status_code, status.HTTP_200_OK)

            wsgi_get = factory.get(f"/quizzes/take/{code}")
            attach_view_request_user(wsgi_get, student.email)
            get_req = wsgi_get
            res = QuizTakeView.as_view()(get_req, code=code)
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            saved = res.data["data"]["saved_answers"]
            self.assertEqual(saved[str(question.id)], [opt_ok.id])

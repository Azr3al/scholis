"""PATCH take progress accepts marked_review; GET take hydrates saved_marked_review."""

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
class QuizProgressMarkedReviewTests(QuizViewTestCase):
    schema_name = "xschedjuice"

    def test_patch_marked_review_only_then_get_reflects_toggle(self):
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
                title="Marked review quiz",
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
            qm.QuestionOption.objects.create(
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

            wsgi_patch_flag = factory.patch(
                f"/quizzes/take/{code}/progress",
                {"attempt_id": attempt_id, "marked_review": {str(question.id): True}},
                format="json",
            )
            attach_view_request_user(wsgi_patch_flag, student.email)
            patch_req = wsgi_patch_flag
            prog = QuizTakeProgressView.as_view()(patch_req, code=code)
            self.assertEqual(prog.status_code, status.HTTP_200_OK)

            wsgi_get = factory.get(f"/quizzes/take/{code}")
            attach_view_request_user(wsgi_get, student.email)
            get_req = wsgi_get
            res = QuizTakeView.as_view()(get_req, code=code)
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            flags = res.data["data"]["saved_marked_review"]
            self.assertEqual(flags[str(question.id)], True)

            wsgi_patch_off = factory.patch(
                f"/quizzes/take/{code}/progress",
                {"attempt_id": attempt_id, "marked_review": {str(question.id): False}},
                format="json",
            )
            attach_view_request_user(wsgi_patch_off, student.email)
            off_req = wsgi_patch_off
            prog_off = QuizTakeProgressView.as_view()(off_req, code=code)
            self.assertEqual(prog_off.status_code, status.HTTP_200_OK)

            wsgi_get2 = factory.get(f"/quizzes/take/{code}")
            attach_view_request_user(wsgi_get2, student.email)
            get_req2 = wsgi_get2
            res2 = QuizTakeView.as_view()(get_req2, code=code)
            self.assertEqual(res2.status_code, status.HTTP_200_OK)
            flags2 = res2.data["data"]["saved_marked_review"]
            self.assertNotIn(str(question.id), flags2)

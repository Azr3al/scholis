import unittest
import uuid

from app_quiz_v3.tests.quiz_view_test_case import QuizViewTestCase, attach_view_request_user, database_reachable
from rest_framework import status
from rest_framework.test import APIRequestFactory
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import UserCourse
from app_quiz_v3 import models as qm
from app_quiz_v3.views import QuizTakeBeginView, QuizTakePreviewView, QuizTakeView

@unittest.skipUnless(
    database_reachable(),
    "PostgreSQL not available (set DATABASE_URL, e.g. local Docker on 127.0.0.1:55432)",
)
class QuizPreviewBeginTests(QuizViewTestCase):
    schema_name = "xschedjuice"

    def test_preview_does_not_create_attempt_begin_does(self):
        with schema_context(self.schema_name):
            admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            self.assertIsNotNone(admin)
            student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).first()
            self.assertIsNotNone(student)

            code = uuid.uuid4()
            quiz = qm.Quiz.objects.create(
                title="Preview quiz",
                status=qm.Quiz.QuizStatus.OPEN,
                created_by=admin,
                code=code,
            )
            qm.Question.objects.create(
                quiz=quiz,
                question_type=qm.Question.QuestionType.SINGLE_CHOICE,
                body={},
                body_plaintext="q1",
                display_order=0,
            )
            uc = UserCourse.objects.filter(
                user=student,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            ).first()
            self.assertIsNotNone(uc)
            quiz.course = uc.course
            quiz.save(update_fields=["course"])

            factory = APIRequestFactory()
            wsgi_prev = factory.get(f"/quizzes/take/{code}/preview")
            attach_view_request_user(wsgi_prev, student.email)
            preview_req = wsgi_prev
            ac0 = qm.QuizAttempt.objects.filter(quiz=quiz, user=student).count()
            prev = QuizTakePreviewView.as_view()(preview_req, code=code)
            self.assertEqual(prev.status_code, status.HTTP_200_OK)
            ac1 = qm.QuizAttempt.objects.filter(quiz=quiz, user=student).count()
            self.assertEqual(ac0, ac1)

            wsgi_begin = factory.post(f"/quizzes/take/{code}/begin")
            attach_view_request_user(wsgi_begin, student.email)
            begin_req = wsgi_begin
            beg = QuizTakeBeginView.as_view()(begin_req, code=code)
            self.assertEqual(beg.status_code, status.HTTP_200_OK)
            ac2 = qm.QuizAttempt.objects.filter(quiz=quiz, user=student).count()
            self.assertEqual(ac2, ac0 + 1)

    def test_get_take_without_in_progress_returns_400(self):
        with schema_context(self.schema_name):
            admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).first()
            code = uuid.uuid4()
            quiz = qm.Quiz.objects.create(
                title="Resume-only quiz",
                status=qm.Quiz.QuizStatus.OPEN,
                created_by=admin,
                code=code,
            )
            qm.Question.objects.create(
                quiz=quiz,
                question_type=qm.Question.QuestionType.SINGLE_CHOICE,
                body={},
                body_plaintext="q1",
                display_order=0,
            )
            uc = UserCourse.objects.filter(
                user=student,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            ).first()
            self.assertIsNotNone(uc)
            quiz.course = uc.course
            quiz.save(update_fields=["course"])

            factory = APIRequestFactory()
            wsgi = factory.get(f"/quizzes/take/{code}")
            attach_view_request_user(wsgi, student.email)
            get_req = wsgi
            res = QuizTakeView.as_view()(get_req, code=code)
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

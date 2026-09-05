"""Batched essay grading PATCH (score + feedback + comments)."""

import unittest
import uuid
from decimal import Decimal

from app_quiz_v3.tests.quiz_view_test_case import QuizViewTestCase, attach_view_request_user, database_reachable
from rest_framework import status
from rest_framework.test import APIRequestFactory
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import UserCourse
from app_quiz_v3 import models as qm
from app_quiz_v3.views import QuizAttemptEssayAnswerPatchView, QuizSubmitView, QuizTakeBeginView

@unittest.skipUnless(database_reachable(), "PostgreSQL not available")
class GradingEndpointBatchTests(QuizViewTestCase):
    schema_name = "xschedjuice"

    def _setup_essay_attempt(self):
        admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
        student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).first()
        uc = UserCourse.objects.filter(
            user=student,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        ).first()
        code = uuid.uuid4()
        quiz = qm.Quiz.objects.create(
            title="ge",
            status=qm.Quiz.QuizStatus.OPEN,
            created_by=admin,
            code=code,
            course=uc.course,
        )
        essay_q = qm.Question.objects.create(
            quiz=quiz,
            question_type=qm.Question.QuestionType.ESSAY,
            body={},
            body_plaintext="E",
            points=10,
            display_order=0,
        )
        f = APIRequestFactory()
        wsgi_b = f.post(f"/quizzes/take/{code}/begin")
        attach_view_request_user(wsgi_b, student.email)
        beg = QuizTakeBeginView.as_view()(wsgi_b, code=code)
        attempt_id = beg.data["data"]["attempt_id"]
        wsgi_s = f.post(
            f"/quizzes/take/{code}/submit",
            {"attempt_id": attempt_id, "answers": {str(essay_q.id): {"text": "Hello world"}}},
            format="json",
        )
        attach_view_request_user(wsgi_s, student.email)
        QuizSubmitView.as_view()(wsgi_s, code=code)
        aa = qm.AttemptAnswer.objects.get(attempt_id=attempt_id, question=essay_q)
        return admin, attempt_id, aa

    def _patch(self, admin, attempt_id, answer_id, body):
        f = APIRequestFactory()
        wsgi = f.patch(f"/quizzes/attempts/{attempt_id}/answers/{answer_id}", body, format="json")
        attach_view_request_user(wsgi, admin.email)
        return QuizAttemptEssayAnswerPatchView.as_view()(
            wsgi, attempt_id=attempt_id, answer_id=answer_id
        )

    def test_score_only_grades_and_recalcs(self):
        with schema_context(self.schema_name):
            admin, attempt_id, aa = self._setup_essay_attempt()
            resp = self._patch(admin, attempt_id, aa.id, {"score": "8.5"})
            self.assertEqual(resp.status_code, status.HTTP_200_OK)
            aa.refresh_from_db()
            self.assertEqual(aa.score, Decimal("8.5"))
            self.assertIsNotNone(aa.graded_at)

    def test_feedback_persists_without_score(self):
        with schema_context(self.schema_name):
            admin, attempt_id, aa = self._setup_essay_attempt()
            resp = self._patch(
                admin,
                attempt_id,
                aa.id,
                {"feedback": {"type": "doc", "content": [{"type": "paragraph"}]}},
            )
            self.assertEqual(resp.status_code, status.HTTP_200_OK)
            aa.refresh_from_db()
            self.assertEqual(aa.feedback["type"], "doc")
            self.assertIsNone(aa.graded_at)

    def test_comments_diff(self):
        with schema_context(self.schema_name):
            admin, attempt_id, aa = self._setup_essay_attempt()
            r1 = self._patch(
                admin,
                attempt_id,
                aa.id,
                {
                    "comments": [
                        {"anchor_start": 0, "anchor_end": 5, "body": "first"},
                        {"anchor_start": 6, "anchor_end": 11, "body": "second"},
                    ]
                },
            )
            self.assertEqual(r1.status_code, status.HTTP_200_OK)
            cids = list(qm.EssayComment.objects.filter(attempt_answer=aa).values_list("id", flat=True))
            self.assertEqual(len(cids), 2)
            keep_id = cids[0]

            r2 = self._patch(
                admin,
                attempt_id,
                aa.id,
                {"comments": [{"id": keep_id, "anchor_start": 0, "anchor_end": 5, "body": "first edited"}]},
            )
            self.assertEqual(r2.status_code, status.HTTP_200_OK)
            remaining = list(qm.EssayComment.objects.filter(attempt_answer=aa).order_by("id"))
            self.assertEqual(len(remaining), 1)
            self.assertEqual(remaining[0].body, "first edited")

    def test_invalid_anchor_returns_400(self):
        with schema_context(self.schema_name):
            admin, attempt_id, aa = self._setup_essay_attempt()
            resp = self._patch(
                admin,
                attempt_id,
                aa.id,
                {"comments": [{"anchor_start": 0, "anchor_end": 9999, "body": "x"}]},
            )
            self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

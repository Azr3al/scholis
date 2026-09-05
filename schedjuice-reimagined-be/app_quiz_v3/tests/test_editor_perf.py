import unittest

from django.core.cache import cache
from django.db import connection, transaction
from app_quiz_v3.tests.quiz_view_test_case import (
    QuizViewTestCase,
    attach_view_request_user,
    database_reachable,
)
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIRequestFactory
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import UserCourse
from app_quiz_v3 import models as qm
from app_quiz_v3.perms import user_is_teacher_for_course
from app_quiz_v3.serializers import QuestionSerializer
from app_quiz_v3.views import QuizQuestionReorderView

@unittest.skipUnless(
    database_reachable(),
    "PostgreSQL not available (set DATABASE_URL, e.g. local Docker on 127.0.0.1:55432)",
)
class QuizV3EditorPerfTest(QuizViewTestCase):
    schema_name = "xschedjuice"

    def setUp(self):
        cache.clear()

    def _post_json(self, user: User, payload: dict):
        factory = APIRequestFactory()
        wsgi = factory.post("/", payload, format="json")
        return attach_view_request_user(wsgi, user.email)

    def test_reorder_rejects_wrong_id_set(self):
        with schema_context(self.schema_name):
            admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            self.assertIsNotNone(admin)
            quiz = qm.Quiz.objects.create(title="Reorder test", created_by=admin)
            q1 = qm.Question.objects.create(
                quiz=quiz,
                question_type=qm.Question.QuestionType.SINGLE_CHOICE,
                body={},
                body_plaintext="a",
                display_order=0,
            )
            q2 = qm.Question.objects.create(
                quiz=quiz,
                question_type=qm.Question.QuestionType.SINGLE_CHOICE,
                body={},
                body_plaintext="b",
                display_order=1,
            )
            view = QuizQuestionReorderView()
            request = self._post_json(admin, {"ordered_ids": [q1.id]})
            view.request = request
            view.format_kwarg = None
            resp = view.post(request, quiz_id=quiz.id)
            self.assertEqual(resp.status_code, 400)
            request = self._post_json(admin, {"ordered_ids": [q1.id, q1.id]})
            view.request = request
            view.format_kwarg = None
            resp = view.post(request, quiz_id=quiz.id)
            self.assertEqual(resp.status_code, 400)
            request = self._post_json(admin, {"ordered_ids": [q1.id, q2.id, q1.id]})
            view.request = request
            view.format_kwarg = None
            resp = view.post(request, quiz_id=quiz.id)
            self.assertEqual(resp.status_code, 400)

    def test_reorder_bulk_updates_order(self):
        with schema_context(self.schema_name):
            admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            self.assertIsNotNone(admin)
            quiz = qm.Quiz.objects.create(title="Reorder ok", created_by=admin)
            q1 = qm.Question.objects.create(
                quiz=quiz,
                question_type=qm.Question.QuestionType.SINGLE_CHOICE,
                body={},
                body_plaintext="a",
                display_order=0,
            )
            q2 = qm.Question.objects.create(
                quiz=quiz,
                question_type=qm.Question.QuestionType.SINGLE_CHOICE,
                body={},
                body_plaintext="b",
                display_order=1,
            )
            view = QuizQuestionReorderView()
            request = self._post_json(admin, {"ordered_ids": [q2.id, q1.id]})
            view.request = request
            view.format_kwarg = None
            resp = view.post(request, quiz_id=quiz.id)
            self.assertEqual(resp.status_code, 200)
            q1.refresh_from_db()
            q2.refresh_from_db()
            self.assertEqual(q1.display_order, 1)
            self.assertEqual(q2.display_order, 0)

    def test_question_serializer_syncs_options_with_ids(self):
        with schema_context(self.schema_name):
            admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            quiz = qm.Quiz.objects.create(title="Serializer", created_by=admin)
            question = qm.Question.objects.create(
                quiz=quiz,
                question_type=qm.Question.QuestionType.SINGLE_CHOICE,
                body={},
                body_plaintext="q",
                display_order=0,
            )
            o1 = qm.QuestionOption.objects.create(
                question=question,
                body={
                    "type": "doc",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": "A"}],
                        }
                    ],
                },
                is_correct=True,
                display_order=0,
            )
            o2 = qm.QuestionOption.objects.create(
                question=question,
                body={
                    "type": "doc",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": "B"}],
                        }
                    ],
                },
                is_correct=False,
                display_order=1,
            )
            from types import SimpleNamespace

            request = SimpleNamespace(
                query_params=SimpleNamespace(getlist=lambda _field: []),
            )
            ser = QuestionSerializer(
                question,
                data={
                    "quiz": quiz.id,
                    "question_type": question.question_type,
                    "body": {},
                    "body_plaintext": "q2",
                    "points": 1,
                    "display_order": 0,
                    "is_partial_scoring_enabled": False,
                    "options": [
                        {
                            "id": o1.id,
                            "body": {
                                "type": "doc",
                                "content": [
                                    {
                                        "type": "paragraph",
                                        "content": [{"type": "text", "text": "A2"}],
                                    }
                                ],
                            },
                            "is_correct": True,
                            "display_order": 0,
                        },
                        {
                            "body": {
                                "type": "doc",
                                "content": [
                                    {
                                        "type": "paragraph",
                                        "content": [{"type": "text", "text": "C"}],
                                    }
                                ],
                            },
                            "is_correct": False,
                            "display_order": 1,
                        },
                    ],
                },
                partial=True,
                context={"request": request},
            )
            self.assertTrue(ser.is_valid(), ser.errors)
            with transaction.atomic():
                ser.save()
            opts = list(
                qm.QuestionOption.objects.filter(question=question).order_by(
                    "display_order"
                )
            )
            self.assertEqual(len(opts), 2)
            updated = next(
                o for o in opts if o.body["content"][0]["content"][0]["text"] == "A2"
            )
            self.assertIsNotNone(updated)
            self.assertNotEqual(opts[1].id, o2.id)
            self.assertFalse(qm.QuestionOption.objects.filter(id=o2.id).exists())

    def test_teacher_permission_uses_cache(self):
        with schema_context(self.schema_name):
            uc = UserCourse.objects.filter(
                assigned_as=UserCourse.AssignedAs.TEACHER
            ).first()
            self.assertIsNotNone(uc)
            user = uc.user
            course = uc.course

            cache.clear()
            with CaptureQueriesContext(connection) as ctx:
                user_is_teacher_for_course(user.id, course.id)
            first_n = len(ctx.captured_queries)
            self.assertGreaterEqual(first_n, 1)

            with CaptureQueriesContext(connection) as ctx:
                user_is_teacher_for_course(user.id, course.id)
            second_n = len(ctx.captured_queries)
            self.assertEqual(second_n, 0)

            uc.save()
            with CaptureQueriesContext(connection) as ctx:
                user_is_teacher_for_course(user.id, course.id)
            self.assertGreaterEqual(len(ctx.captured_queries), 1)

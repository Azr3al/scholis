"""Model and serializer invariants for grading + release."""

import unittest
from unittest.mock import patch

from django.core.management import call_command
from django.db import IntegrityError, transaction
from app_quiz_v3.tests.quiz_view_test_case import QuizViewTestCase, database_reachable
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_quiz_v3 import models as qm

@unittest.skipUnless(database_reachable(), "PostgreSQL not available")
class QuizResultTests(QuizViewTestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def test_unique_quiz_user(self):
        with schema_context(self.schema_name):
            admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).first()
            quiz = qm.Quiz.objects.create(title="qrt", created_by=admin)
            attempt_a = qm.QuizAttempt.objects.create(
                quiz=quiz,
                user=student,
                started_at="2026-01-01T00:00:00Z",
            )
            attempt_b = qm.QuizAttempt.objects.create(
                quiz=quiz,
                user=student,
                started_at="2026-01-02T00:00:00Z",
            )
            qm.QuizResult.objects.create(
                quiz=quiz,
                user=student,
                attempt=attempt_a,
                released_at=timezone.now(),
                released_by=admin,
            )
            with self.assertRaises(IntegrityError):
                with transaction.atomic():
                    qm.QuizResult.objects.create(
                        quiz=quiz,
                        user=student,
                        attempt=attempt_b,
                        released_at=timezone.now(),
                        released_by=admin,
                    )

@unittest.skipUnless(database_reachable(), "PostgreSQL not available")
class EssayCommentConstraintTests(QuizViewTestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def test_anchor_end_must_be_greater_than_start(self):
        with schema_context(self.schema_name):
            admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).first()
            quiz = qm.Quiz.objects.create(title="ect", created_by=admin)
            q_essay = qm.Question.objects.create(
                quiz=quiz,
                question_type=qm.Question.QuestionType.ESSAY,
                body={},
                body_plaintext="E",
                points=10,
                display_order=0,
            )
            attempt = qm.QuizAttempt.objects.create(
                quiz=quiz,
                user=student,
                started_at="2026-01-01T00:00:00Z",
            )
            aa = qm.AttemptAnswer.objects.create(
                attempt=attempt,
                question=q_essay,
                response_text={"text": "Hello world"},
            )
            with self.assertRaises(IntegrityError):
                with transaction.atomic():
                    qm.EssayComment.objects.create(
                        attempt_answer=aa,
                        anchor_start=5,
                        anchor_end=5,
                        body="bad",
                        created_by=admin,
                    )

@unittest.skipUnless(database_reachable(), "PostgreSQL not available")
class QuizAttemptSerializerStatusTests(QuizViewTestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def test_status_fields_present(self):
        from app_quiz_v3.serializers import QuizAttemptSerializer

        with schema_context(self.schema_name):
            admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).first()
            quiz = qm.Quiz.objects.create(title="qas", created_by=admin)
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
            )
            qm.AttemptAnswer.objects.create(
                attempt=attempt,
                question=essay_q,
                response_text={"text": "x"},
            )
            data = QuizAttemptSerializer(attempt).data
            self.assertTrue(data["has_pending_essay_grading"])
            self.assertIsNone(data["essay_grading_waived_at"])
            self.assertFalse(data["is_released"])
            self.assertIsNone(data["released_at"])

            qm.QuizResult.objects.create(
                quiz=quiz,
                user=student,
                attempt=attempt,
                released_at=timezone.now(),
                released_by=admin,
            )
            data2 = QuizAttemptSerializer(attempt).data
            self.assertTrue(data2["is_released"])
            self.assertIsNotNone(data2["released_at"])

@unittest.skipUnless(database_reachable(), "PostgreSQL not available")
class QuizSerializerHasEssayTests(QuizViewTestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def test_has_essay_questions(self):
        from app_quiz_v3.serializers import QuizSerializer

        with schema_context(self.schema_name):
            admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            q1 = qm.Quiz.objects.create(title="a", created_by=admin)
            q2 = qm.Quiz.objects.create(title="h", created_by=admin)
            qm.Question.objects.create(
                quiz=q2,
                question_type=qm.Question.QuestionType.ESSAY,
                body={},
                body_plaintext="E",
                points=1,
                display_order=0,
            )
            self.assertFalse(QuizSerializer(q1).data["has_essay_questions"])
            self.assertTrue(QuizSerializer(q2).data["has_essay_questions"])

"""EssayComment anchor and cap validation."""

import unittest

from app_quiz_v3.tests.quiz_view_test_case import QuizViewTestCase, database_reachable
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_quiz_v3 import models as qm
from app_quiz_v3.essay_comments import (
    COMMENT_BODY_CAP,
    COMMENTS_PER_ESSAY_CAP,
    apply_comments_diff,
    validate_anchor_range,
)

@unittest.skipUnless(database_reachable(), "PostgreSQL not available")
class EssayCommentsValidationTests(QuizViewTestCase):
    schema_name = "xschedjuice"

    def _seed(self):
        admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
        student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).first()
        quiz = qm.Quiz.objects.create(title="ec", created_by=admin)
        q_essay = qm.Question.objects.create(
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
            started_at="2026-01-01T00:00:00Z",
        )
        aa = qm.AttemptAnswer.objects.create(
            attempt=attempt,
            question=q_essay,
            response_text={"text": "Hello world"},
        )
        return admin, aa

    def test_validate_anchor_range_out_of_bounds(self):
        with schema_context(self.schema_name):
            _, aa = self._seed()
            self.assertEqual(validate_anchor_range(aa, 0, 999), "anchor_out_of_bounds")
            self.assertEqual(validate_anchor_range(aa, -1, 5), "anchor_invalid")
            self.assertEqual(validate_anchor_range(aa, 5, 5), "anchor_invalid")
            self.assertEqual(validate_anchor_range(aa, 6, 4), "anchor_invalid")

    def test_apply_comments_diff_create_update_delete(self):
        with schema_context(self.schema_name):
            admin, aa = self._seed()
            res = apply_comments_diff(
                aa,
                [
                    {"anchor_start": 0, "anchor_end": 5, "body": "first"},
                    {"anchor_start": 6, "anchor_end": 11, "body": "second"},
                ],
                by_user=admin,
            )
            self.assertEqual(len(res["created_ids"]), 2)
            self.assertEqual(res["errors"], [])
            cids = list(qm.EssayComment.objects.filter(attempt_answer=aa).values_list("id", flat=True))
            self.assertEqual(len(cids), 2)
            keep_id = cids[0]

            res2 = apply_comments_diff(
                aa,
                [{"id": keep_id, "anchor_start": 0, "anchor_end": 5, "body": "first edited"}],
                by_user=admin,
            )
            self.assertEqual(res2["updated_ids"], [keep_id])
            self.assertEqual(res2["errors"], [])
            remaining = list(
                qm.EssayComment.objects.filter(attempt_answer=aa).order_by("id").values_list("body", flat=True)
            )
            self.assertEqual(remaining, ["first edited"])

    def test_apply_comments_diff_rejects_unknown_id(self):
        with schema_context(self.schema_name):
            admin, aa = self._seed()
            res = apply_comments_diff(
                aa,
                [{"id": 999999, "anchor_start": 0, "anchor_end": 5, "body": "x"}],
                by_user=admin,
            )
            self.assertEqual(res["errors"], [{"index": 0, "code": "unknown_id"}])

    def test_body_cap_enforced(self):
        with schema_context(self.schema_name):
            admin, aa = self._seed()
            res = apply_comments_diff(
                aa,
                [{"anchor_start": 0, "anchor_end": 5, "body": "x" * (COMMENT_BODY_CAP + 1)}],
                by_user=admin,
            )
            self.assertEqual(res["errors"], [{"index": 0, "code": "body_too_long"}])

    def test_per_essay_cap_enforced(self):
        with schema_context(self.schema_name):
            admin, aa = self._seed()
            payload = [
                {"anchor_start": 0, "anchor_end": 5, "body": f"c{i}"} for i in range(COMMENTS_PER_ESSAY_CAP + 1)
            ]
            res = apply_comments_diff(aa, payload, by_user=admin)
            self.assertEqual(res["errors"], [{"index": COMMENTS_PER_ESSAY_CAP, "code": "too_many_comments"}])

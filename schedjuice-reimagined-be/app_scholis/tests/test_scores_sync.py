"""
Score storage and the projection into the gradebook.

Two rules carry the weight here, and both are tested because both are easy to
break without any test failing loudly:

1. ``ScholisScore`` keeps the exact decimal Scholis reported. ``ResultCell.marks``
   is a rounded integer projection of it. If the rounding policy changes, every
   cell is recomputed from the stored rows without asking Scholis again.
2. Every score row that cannot reach the gradebook is *counted*, not dropped.
   Marks that exist but have nowhere to go are the thing a teacher most needs to
   be told about, and a report that quietly omits them reads as success.
"""
from __future__ import annotations

import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

from contextlib import ExitStack

from cryptography.fernet import Fernet
from django.core.management import call_command
from django.db import connection as db_connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Course
from app_grading_reports.models import MonthlyResultSheet, ResultCell, ResultColumn
from app_rbac.seeding import seed_rbac
from app_scholis.models import ScholisConnection, ScholisPaperLink, ScholisScore
from app_scholis.papers import link_paper
from app_scholis.scores import SyncReport, store_score_rows, sync_to_gradebook


def _database_reachable() -> bool:
    try:
        db_connection.ensure_connection()
        return True
    except Exception:
        return False


def _row(**overrides):
    """
    One released score row, in the shape Scholis returns it.

    The types follow ``scoreRowSchema`` in packages/schema/src/integration.ts:
    ``testId`` and ``attemptId`` are UUIDs, ``studentRef``/``courseRef`` are
    nullable strings (our own ids, echoed back), and ``score``/``maxScore`` are
    JSON numbers -- Scholis builds them by arithmetic in list-scores.ts, so they
    are not the strings a Postgres numeric column would give it. String numbers
    are still accepted, and tested, because a proxy or a future schema change
    could produce them and silently dropping a mark is not an acceptable way to
    find out.
    """
    row = {
        "testId": str(uuid4()),
        "testTitle": "Midterm",
        "courseRef": None,
        "attemptId": str(uuid4()),
        "studentRef": None,
        "takerName": "Walk In",
        "score": 0,
        "maxScore": 50,
        "submittedAt": "2026-09-01T09:00:00Z",
        "releasedAt": "2026-09-02T09:00:00Z",
        "sections": [],
    }
    row.update(overrides)
    return row


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(SCHOLIS_TOKEN_ENCRYPTION_KEY=Fernet.generate_key().decode())
class ScholisScoreSyncTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.suffix = uuid4().hex[:6]
        # Every test here reads and writes one tenant's tables, so the schema is
        # entered once for the whole test rather than wrapping each body in a
        # `with schema_context(...)`. ExitStack restores the previous schema even
        # when the test fails, which is the part that is easy to get wrong by
        # hand.
        stack = ExitStack()
        stack.enter_context(schema_context(self.schema_name))
        self.addCleanup(stack.close)

        seed_rbac()
        self.course = Course.objects.first()
        self.teacher = User.objects.create_user(
            email=f"sch-teacher-{self.suffix}@example.com",
            password="x",
            name="Sch Teacher",
            phone_number="1",
            date_of_birth=date(1990, 1, 1),
            code=f"sch-teacher-{self.suffix}",
            roles=[User.UserRole.TEACHER],
        )
        self.student = User.objects.create_user(
            email=f"sch-student-{self.suffix}@example.com",
            password="x",
            name="Sch Student",
            phone_number="2",
            date_of_birth=date(2008, 1, 1),
            code=f"sch-student-{self.suffix}",
            roles=[User.UserRole.STUDENT],
        )
        # A connected school. The key material is encrypted on the way in,
        # which is why the Fernet key above has to be a real one.
        self.connection = ScholisConnection.objects.create(
            external_ref=f"org-{self.suffix}",
            school_name="Test School",
        )
        self.connection.set_api_key(key_id="key1", token="sch_live_key1.secret")
        self.connection.save()

        self.sheet = MonthlyResultSheet.objects.create(
            course=self.course,
            year=2026,
            month=9,
            exam_date=date(2026, 9, 28),
            created_by=self.teacher,
        )
        self.column = ResultColumn.objects.create(
            sheet=self.sheet, title="Midterm", sort_order=0
        )

    # -- helpers -------------------------------------------------------------

    def _placed(self, row):
        """
        Bind the row's paper to the gradebook column before syncing.

        A score row for a paper nobody has placed still stores its marks, but
        there is nowhere to write them -- which is a different test, and is
        covered separately. These are the tests where a teacher has already
        decided where the marks go.
        """
        link_paper(
            scholis_test_id=row["testId"],
            column=self.column,
            course=self.course,
            title=row["testTitle"],
            max_score=row["maxScore"],
        )
        return row

    def _store_and_sync(self, rows):
        report = SyncReport()
        store_score_rows(rows, report=report)
        sync_to_gradebook(report=report)
        return report

    # -- exact storage, rounded projection -----------------------------------

    def test_the_exact_decimal_is_stored_and_the_cell_gets_the_rounded_int(self):
        row = self._placed(
            _row(studentRef=str(self.student.id), score=12.5, maxScore=50)
        )
        report = self._store_and_sync([row])

        stored = ScholisScore.objects.get(attempt_id=row["attemptId"])
        self.assertEqual(stored.score, Decimal("12.50"))
        self.assertEqual(stored.rounded_marks, 13)

        cell = ResultCell.objects.get(column=self.column, student=self.student)
        self.assertEqual(cell.marks, 13)
        self.assertEqual(stored.synced_marks, 13)
        self.assertIsNotNone(stored.synced_at)
        self.assertEqual(report.written_to_gradebook, 1)

    def test_two_decimal_places_survive_the_round_trip(self):
        # The column holds hundredths, so 12.34 must not arrive as 12.3 or 12.
        row = self._placed(
            _row(score=12.34, studentRef=str(self.student.id), maxScore=50)
        )
        self._store_and_sync([row])
        stored = ScholisScore.objects.get(attempt_id=row["attemptId"])
        self.assertEqual(stored.score, Decimal("12.34"))
        self.assertEqual(
            ResultCell.objects.get(column=self.column, student=self.student).marks, 12
        )

    def test_a_zero_score_is_stored_and_written(self):
        # Zero is a real mark. Anywhere this used a truthiness test, the student
        # would end up with a blank cell instead of a zero.
        row = self._placed(_row(score=0, studentRef=str(self.student.id), maxScore=50))
        report = self._store_and_sync([row])
        stored = ScholisScore.objects.get(attempt_id=row["attemptId"])
        self.assertEqual(stored.score, Decimal("0.00"))
        self.assertEqual(report.written_to_gradebook, 1)
        self.assertEqual(
            ResultCell.objects.get(column=self.column, student=self.student).marks, 0
        )

    # -- re-release amends ---------------------------------------------------

    def test_a_re_release_amends_the_row_and_the_cell_rather_than_duplicating(self):
        # Releasing is something a teacher does more than once: marks get
        # corrected after a regrade. The correction has to replace the old mark
        # everywhere, not sit beside it.
        attempt = str(uuid4())
        first = _row(attemptId=attempt, studentRef=str(self.student.id), score=10)
        self._placed(first)
        self._store_and_sync([first])
        self.assertEqual(
            ResultCell.objects.get(column=self.column, student=self.student).marks, 10
        )

        corrected = _row(
            attemptId=attempt,
            testId=first["testId"],
            studentRef=str(self.student.id),
            score=18,
        )
        report = self._store_and_sync([corrected])

        self.assertEqual(ScholisScore.objects.filter(attempt_id=attempt).count(), 1)
        self.assertEqual(
            ResultCell.objects.filter(column=self.column, student=self.student).count(),
            1,
        )
        self.assertEqual(
            ScholisScore.objects.get(attempt_id=attempt).score, Decimal("18.00")
        )
        self.assertEqual(
            ResultCell.objects.get(column=self.column, student=self.student).marks, 18
        )
        self.assertEqual(report.written_to_gradebook, 1)

    def test_a_re_run_writes_only_what_has_not_been_projected_yet(self):
        # A partial failure leaves some rows unsynced. Re-running must finish
        # those without rewriting the whole gradebook.
        row = self._placed(_row(studentRef=str(self.student.id), score=20, maxScore=50))
        self._store_and_sync([row])

        second = SyncReport()
        sync_to_gradebook(report=second)
        self.assertEqual(second.written_to_gradebook, 0)
        self.assertEqual(second.unlinked_papers, 0)
        self.assertEqual(second.without_student, 0)

    def test_a_row_stored_without_syncing_is_written_by_a_later_sync(self):
        row = self._placed(_row(studentRef=str(self.student.id), score=20, maxScore=50))
        report = SyncReport()
        store_score_rows([row], report=report)
        self.assertEqual(report.written_to_gradebook, 0)
        self.assertEqual(ResultCell.objects.count(), 0)

        later = SyncReport()
        sync_to_gradebook(report=later)
        self.assertEqual(later.written_to_gradebook, 1)
        self.assertEqual(
            ResultCell.objects.get(column=self.column, student=self.student).marks, 20
        )

    # -- skips are counted, never dropped ------------------------------------

    def test_a_paper_with_no_column_stores_the_marks_and_counts_the_skip_once(self):
        # The marks are real and worth keeping even before a teacher decides
        # where they go. But the report must not claim two skips for one row: a
        # number larger than the number of rows fetched makes the report
        # untrustworthy, which defeats its purpose.
        row = _row(studentRef=str(self.student.id), score=30)
        report = self._store_and_sync([row])

        self.assertTrue(
            ScholisScore.objects.filter(attempt_id=row["attemptId"]).exists()
        )
        self.assertEqual(report.fetched, 0)  # set by pull_scores, not here
        self.assertEqual(report.stored, 1)
        self.assertEqual(report.unlinked_papers, 1)
        self.assertEqual(report.written_to_gradebook, 0)
        self.assertEqual(ResultCell.objects.count(), 0)

    def test_a_walk_in_attempt_keeps_the_score_without_inventing_a_student(self):
        # Somebody sat the paper without being launched from here, so there is no
        # student reference of ours. The mark still exists and is still worth
        # storing -- but there is nobody to attribute it to.
        row = _row(studentRef=None, takerName="Unknown Taker", score=25)
        report = self._store_and_sync([row])

        stored = ScholisScore.objects.get(attempt_id=row["attemptId"])
        self.assertIsNone(stored.student)
        self.assertEqual(stored.taker_name, "Unknown Taker")
        self.assertEqual(report.without_student, 1)
        self.assertEqual(report.written_to_gradebook, 0)
        self.assertEqual(ResultCell.objects.count(), 0)
        # Blamed on the missing student, not the missing column: placing this
        # paper would not make the mark writable, so pointing a teacher at the
        # column would send them to fix something that was never the obstacle.
        self.assertEqual(report.unlinked_papers, 0)

    def test_a_walk_in_on_a_placed_paper_is_counted_once_not_twice(self):
        # The combination that used to double-count. The paper has a column, so
        # the write stage reaches the row instead of skipping it earlier for
        # having nowhere to go -- and both stages claimed it, reporting one
        # walk-in attempt as two. Nothing else covered this: every other walk-in
        # test sits on an unplaced paper, where the write stage bails out at the
        # column check before it ever looks at the student.
        row = self._placed(_row(studentRef=None, takerName="Unknown Taker", score=25))
        report = self._store_and_sync([row])

        self.assertEqual(report.stored, 1)
        self.assertEqual(report.without_student, 1)
        self.assertEqual(report.unlinked_papers, 0)
        self.assertEqual(report.written_to_gradebook, 0)
        self.assertEqual(ResultCell.objects.count(), 0)

    def test_the_skips_partition_the_rows_that_were_stored(self):
        # A report exists so a teacher can reconcile "stored N" against "wrote M"
        # and see why the difference. That only works if every stored row is
        # accounted for exactly once: one too many and the numbers cannot be
        # believed, one too few and a mark went missing without explanation.
        rows = [
            self._placed(_row(studentRef=str(self.student.id), score=20)),  # written
            _row(studentRef=str(self.student.id), score=30),  # no column
            _row(studentRef=None, score=25),  # no student
        ]
        report = self._store_and_sync(rows)

        self.assertEqual(report.stored, 3)
        self.assertEqual(report.written_to_gradebook, 1)
        self.assertEqual(report.unlinked_papers, 1)
        self.assertEqual(report.without_student, 1)
        self.assertEqual(
            report.written_to_gradebook
            + report.unlinked_papers
            + report.without_student,
            report.stored,
            "every stored row should be explained exactly once",
        )

    def test_a_student_ref_that_does_not_resolve_is_never_guessed_at(self):
        # Attributing a mark to the wrong student is the one mistake here that
        # re-running cannot undo, so an unknown reference must produce no
        # attribution at all rather than a close one.
        row = _row(studentRef="999999999", score=40)
        report = self._store_and_sync([row])

        stored = ScholisScore.objects.get(attempt_id=row["attemptId"])
        self.assertIsNone(stored.student)
        self.assertEqual(stored.student_ref, "999999999")
        self.assertEqual(report.without_student, 1)
        self.assertEqual(ResultCell.objects.count(), 0)

    def test_a_non_numeric_student_ref_is_treated_as_unknown(self):
        row = _row(studentRef="not-an-id", score=40)
        report = self._store_and_sync([row])
        self.assertIsNone(ScholisScore.objects.get(attempt_id=row["attemptId"]).student)
        self.assertEqual(report.without_student, 1)

    def test_a_row_missing_its_ids_is_reported_as_an_error(self):
        report = SyncReport()
        stored = store_score_rows([_row(attemptId=None)], report=report)
        self.assertEqual(stored, 0)
        self.assertEqual(ScholisScore.objects.count(), 0)
        self.assertTrue(report.errors)
        self.assertFalse(report.ok)

    def test_one_bad_row_does_not_lose_the_rest_of_the_class(self):
        # The failure mode that matters most here: a single malformed row in a
        # batch of forty must not cost the teacher thirty-nine marks.
        bad = _row(attemptId=None, score=10)
        good = [_row(score=11, takerName=f"Student {i}") for i in range(3)]
        report = self._store_and_sync([bad, *good])

        self.assertEqual(ScholisScore.objects.count(), 3)
        self.assertEqual(report.stored, 3)
        self.assertTrue(report.errors)

    # -- column maximum ------------------------------------------------------

    def test_an_empty_column_maximum_is_filled_from_scholis(self):
        self.assertIsNone(self.column.max_marks)
        row = self._placed(_row(score=30, maxScore=40, studentRef=str(self.student.id)))
        self._store_and_sync([row])
        self.column.refresh_from_db()
        self.assertEqual(self.column.max_marks, 40)

    def test_a_maximum_a_teacher_already_set_is_not_overwritten(self):
        # An integration quietly changing a number a human typed is the kind of
        # surprise that costs far more trust than the convenience is worth.
        self.column.max_marks = 45
        self.column.save()
        row = self._placed(_row(score=30, maxScore=40, studentRef=str(self.student.id)))
        self._store_and_sync([row])
        self.column.refresh_from_db()
        self.assertEqual(self.column.max_marks, 45)

    # -- link behaviour ------------------------------------------------------

    def test_an_inactive_link_is_not_written_to(self):
        row = _row(score=30, studentRef=str(self.student.id))
        self._store_and_sync([row])
        link = ScholisPaperLink.objects.get(scholis_test_id=row["testId"])

        # Undo the write, deactivate, and re-release: nothing should be written.
        ResultCell.objects.all().delete()
        link.is_active = False
        link.save()
        ScholisScore.objects.filter(attempt_id=row["attemptId"]).update(
            synced_at=None, synced_marks=None
        )

        report = SyncReport()
        sync_to_gradebook(report=report)
        self.assertEqual(report.written_to_gradebook, 0)
        self.assertEqual(ResultCell.objects.count(), 0)
        self.assertEqual(report.unlinked_papers, 1)

    def test_a_score_row_does_not_move_a_paper_a_teacher_already_placed(self):
        # Where the marks go is a decision made in this system by a teacher, not
        # something an inbound row should silently change.
        placed_test_id = str(uuid4())
        binding = link_paper(
            scholis_test_id=placed_test_id,
            column=self.column,
            course=self.course,
            title="Placed",
            max_score="50",
        )
        self.assertTrue(binding.created)

        other_column = ResultColumn.objects.create(
            sheet=self.sheet, title="Other", sort_order=1
        )
        row = _row(testId=placed_test_id, score=30, studentRef=str(self.student.id))
        report = self._store_and_sync([row])

        binding.link.refresh_from_db()
        self.assertEqual(binding.link.column_id, self.column.id)
        self.assertNotEqual(binding.link.column_id, other_column.id)
        self.assertEqual(report.written_to_gradebook, 1)
        self.assertEqual(
            ResultCell.objects.get(column=self.column, student=self.student).marks, 30
        )

    def test_the_course_reference_round_trips_to_a_real_course(self):
        row = _row(courseRef=str(self.course.id), score=30)
        report = SyncReport()
        store_score_rows([row], report=report)

        link = ScholisPaperLink.objects.get(scholis_test_id=row["testId"])
        self.assertEqual(link.course_id, self.course.id)

    def test_a_foreign_course_reference_binds_nothing(self):
        row = _row(courseRef="999999999", score=30)
        store_score_rows([row], report=SyncReport())

        link = ScholisPaperLink.objects.get(scholis_test_id=row["testId"])
        self.assertIsNone(link.course_id)

    # -- sections ------------------------------------------------------------

    def test_the_section_breakdown_is_kept_as_reported(self):
        # sectionId is a nullable UUID; questions outside any section come back
        # grouped under a null id.
        sections = [
            {
                "sectionId": str(uuid4()),
                "title": "Reading",
                "score": 7.5,
                "maxScore": 10,
            },
            {"sectionId": None, "title": "Unsectioned", "score": 5, "maxScore": 10},
        ]
        row = _row(score=12.5, sections=sections, studentRef=str(self.student.id))
        self._store_and_sync([row])
        stored = ScholisScore.objects.get(attempt_id=row["attemptId"])
        self.assertEqual(stored.sections, sections)

    def test_timestamps_are_parsed_and_kept(self):
        row = _row(
            submittedAt="2026-09-01T09:30:00Z",
            releasedAt="2026-09-02T14:00:00Z",
            score=10,
        )
        store_score_rows([row], report=SyncReport())
        stored = ScholisScore.objects.get(attempt_id=row["attemptId"])
        self.assertEqual(
            stored.submitted_at, datetime(2026, 9, 1, 9, 30, tzinfo=timezone.utc)
        )
        self.assertEqual(
            stored.released_at, datetime(2026, 9, 2, 14, 0, tzinfo=timezone.utc)
        )

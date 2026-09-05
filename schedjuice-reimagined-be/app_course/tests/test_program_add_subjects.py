import unittest
from uuid import uuid4

from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_course.models import Program, ProgramSubject, Subject
from app_course.program_subject_services import (
    ProgramSubjectValidationError,
    add_subjects_to_program,
)


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ProgramAddSubjectsTest(TestCase):
    schema_name = "xschedjuice"

    def _required_program(self) -> Program:
        return Program.objects.create(
            name=f"ACCA {uuid4().hex[:6]}",
            course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
            subject_strategy=Program.SubjectStrategy.REQUIRED,
        )

    def test_creates_new_subjects_and_links(self):
        with schema_context(self.schema_name):
            program = self._required_program()
            summary = add_subjects_to_program(
                program.id, ["Dip IFR", "Audit & Assurance"]
            )
            self.assertEqual(summary["created_subjects"], 2)
            self.assertEqual(summary["linked"], 0)
            self.assertEqual(summary["skipped_already_linked"], 0)
            self.assertEqual(
                ProgramSubject.objects.filter(program=program).count(), 2
            )

    def test_links_existing_org_subject_without_duplicating(self):
        with schema_context(self.schema_name):
            program = self._required_program()
            Subject.objects.create(name="Financial Reporting")
            before = Subject.objects.count()
            summary = add_subjects_to_program(program.id, ["financial reporting"])
            self.assertEqual(summary["created_subjects"], 0)
            self.assertEqual(summary["linked"], 1)
            self.assertEqual(Subject.objects.count(), before)

    def test_skips_already_linked(self):
        with schema_context(self.schema_name):
            program = self._required_program()
            add_subjects_to_program(program.id, ["Dip IFR"])
            summary = add_subjects_to_program(program.id, ["Dip IFR"])
            self.assertEqual(summary["created_subjects"], 0)
            self.assertEqual(summary["linked"], 0)
            self.assertEqual(summary["skipped_already_linked"], 1)
            self.assertEqual(
                ProgramSubject.objects.filter(program=program).count(), 1
            )

    def test_dedupes_within_request(self):
        with schema_context(self.schema_name):
            program = self._required_program()
            summary = add_subjects_to_program(
                program.id, ["Dip IFR", "dip ifr", "  Dip   IFR "]
            )
            self.assertEqual(summary["created_subjects"], 1)
            self.assertEqual(len(summary["results"]), 1)

    def test_sort_order_continues_from_existing_max(self):
        with schema_context(self.schema_name):
            program = self._required_program()
            add_subjects_to_program(program.id, ["A", "B"])
            add_subjects_to_program(program.id, ["C"])
            orders = sorted(
                ProgramSubject.objects.filter(program=program).values_list(
                    "sort_order", flat=True
                )
            )
            self.assertEqual(orders, [0, 1, 2])

    def test_rejects_non_required_strategy(self):
        with schema_context(self.schema_name):
            program = Program.objects.create(
                name=f"Free {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.OPTIONAL,
            )
            with self.assertRaises(ProgramSubjectValidationError):
                add_subjects_to_program(program.id, ["Anything"])

    def test_rejects_over_length_name(self):
        with schema_context(self.schema_name):
            program = self._required_program()
            with self.assertRaises(ProgramSubjectValidationError):
                add_subjects_to_program(program.id, ["x" * 513])

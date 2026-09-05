import unittest
from datetime import date
from decimal import Decimal
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Course, UserCourse
from app_grading_reports.models import CourseRubric, MarkSheet, MarkSheetCell
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


RUBRIC_COLUMNS = [
    {
        "key": "content_1",
        "title": "Content",
        "kind": "score",
        "max_marks": 5,
        "sort_order": 0,
    },
    {"key": "total", "title": "Total", "kind": "computed_total", "sort_order": 1},
]


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class MarkSheetModelTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.course = Course.objects.first()
            self.admin = User.objects.create_user(
                email=f"ms-admin-{self.suffix}@example.com",
                password="x",
                name="Ms Admin",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"ms-admin-{self.suffix}@example.com",
                code=f"ms-admin-{self.suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.student = User.objects.create_user(
                email=f"ms-stu-{self.suffix}@example.com",
                password="x",
                name="Paul Herbold",
                phone_number="2",
                date_of_birth=date(2010, 1, 1),
                communication_email=f"ms-stu-{self.suffix}@example.com",
                code=f"ms-stu-{self.suffix}",
                roles=[User.UserRole.STUDENT],
                alternative_name="Paul Burmese",
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            self.rubric = CourseRubric.objects.create(
                course=self.course,
                title="Writing Project",
                columns=RUBRIC_COLUMNS,
                source=CourseRubric.Source.MANUAL,
                created_by=self.admin,
            )

    def test_multiple_mark_sheets_same_month_allowed(self):
        with schema_context(self.schema_name):
            MarkSheet.objects.create(
                course=self.course,
                rubric=self.rubric,
                title="Writing A",
                year=2026,
                month=5,
                created_by=self.admin,
            )
            MarkSheet.objects.create(
                course=self.course,
                rubric=self.rubric,
                title="Writing B",
                year=2026,
                month=5,
                created_by=self.admin,
            )
            self.assertEqual(
                MarkSheet.objects.filter(
                    course=self.course, year=2026, month=5
                ).count(),
                2,
            )

    def test_decimal_marks_persisted(self):
        with schema_context(self.schema_name):
            sheet = MarkSheet.objects.create(
                course=self.course,
                rubric=self.rubric,
                title="Writing",
                year=2026,
                month=5,
                created_by=self.admin,
            )
            MarkSheetCell.objects.create(
                sheet=sheet,
                student=self.student,
                column_key="content_1",
                marks=Decimal("3.5"),
            )
            cell = MarkSheetCell.objects.get(sheet=sheet, student=self.student)
            self.assertEqual(cell.marks, Decimal("3.5"))


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class MarkSheetApiTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.course = Course.objects.first()
            self.admin = User.objects.create_user(
                email=f"msa-admin-{self.suffix}@example.com",
                password="x",
                name="Ms Admin",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"msa-admin-{self.suffix}@example.com",
                code=f"msa-admin-{self.suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.student = User.objects.create_user(
                email=f"msa-stu-{self.suffix}@example.com",
                password="x",
                name="Paul Herbold",
                phone_number="2",
                date_of_birth=date(2010, 1, 1),
                communication_email=f"msa-stu-{self.suffix}@example.com",
                code=f"msa-stu-{self.suffix}",
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            self.rubric = CourseRubric.objects.create(
                course=self.course,
                title=f"Writing-{self.suffix}",
                columns=RUBRIC_COLUMNS,
                source=CourseRubric.Source.MANUAL,
                created_by=self.admin,
            )

    def _client(self, user):
        from rest_framework.test import APIClient

        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_student_forbidden_on_create(self):
        with schema_context(self.schema_name):
            res = self._client(self.student).post(
                f"{self.api_prefix}/courses/{self.course.id}/mark-sheets",
                {
                    "rubric_id": self.rubric.id,
                    "title": "T",
                    "year": 2026,
                    "month": 5,
                },
                format="json",
            )
            self.assertEqual(res.status_code, 403, res.content)

    def test_cells_reject_computed_total_key(self):
        with schema_context(self.schema_name):
            sheet = MarkSheet.objects.create(
                course=self.course,
                rubric=self.rubric,
                title="Writing",
                year=2026,
                month=5,
                created_by=self.admin,
            )
            res = self._client(self.admin).patch(
                f"{self.api_prefix}/mark-sheets/{sheet.id}/cells",
                {
                    "cells": [
                        {
                            "student_id": self.student.id,
                            "column_key": "total",
                            "marks": 10,
                        }
                    ]
                },
                format="json",
            )
            self.assertEqual(res.status_code, 400, res.content)

    def test_import_commit_rejected_with_unresolved_matches(self):
        with schema_context(self.schema_name):
            res = self._client(self.admin).post(
                f"{self.api_prefix}/courses/{self.course.id}/mark-sheets/import/commit",
                {
                    "title": "Writing",
                    "year": 2026,
                    "month": 5,
                    "rubric": {"title": f"Import-{self.suffix}", "columns": RUBRIC_COLUMNS},
                    "rows": [{"marks": {"content_1": 4}}],
                },
                format="json",
            )
            self.assertEqual(res.status_code, 400, res.content)
            body = res.json()
            message = body.get("message") or str(body.get("details") or "")
            self.assertIn("unresolved", message.lower())

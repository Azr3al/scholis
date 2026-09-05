import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_userlog import models, serializers, services


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ServicesTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _user(self, roles, prefix):
        s = uuid4().hex[:6]
        return User.objects.create_user(
            email=f"{prefix}-{s}@example.com",
            password="x",
            name=prefix,
            phone_number="1",
            date_of_birth=date(2000, 1, 1),
            communication_email=f"{prefix}-{s}@example.com",
            code=f"{prefix}-{s}",
            roles=roles,
        )

    def test_create_entry_writes_version_and_event(self):
        with schema_context(self.schema_name):
            staff = self._user([User.UserRole.ADMIN], "staff")
            student = self._user([User.UserRole.STUDENT], "stu")
            rt = models.ReportType.objects.create(
                name=f"RT-{uuid4().hex[:6]}",
                applies_to=models.ReportType.AppliesTo.STUDENT,
            )
            entry = services.create_entry(
                subject=student,
                report_type=rt,
                title="Late",
                body="<p>x</p>",
                field_values={},
                author=staff,
            )
            self.assertEqual(entry.versions.count(), 1)
            self.assertTrue(
                entry.events.filter(
                    event_type=models.LogEntryEvent.EventType.CREATED
                ).exists()
            )

    def test_staff_user_fk_rejects_student(self):
        with schema_context(self.schema_name):
            student = self._user([User.UserRole.STUDENT], "stu")
            rt = models.ReportType.objects.create(name=f"RT-{uuid4().hex[:6]}")
            models.ReportTypeField.objects.create(
                report_type=rt,
                field_key="fp",
                field_label="FP",
                field_type=models.ReportTypeField.FieldType.STAFF_USER_FK,
                is_required=True,
            )
            with self.assertRaises(ValidationError):
                services.validate_field_values(rt, {"fp": student.id})

    def test_applies_to_staff_rejects_student_subject(self):
        with schema_context(self.schema_name):
            student = self._user([User.UserRole.STUDENT], "stu")
            rt = models.ReportType.objects.create(
                name=f"RT-{uuid4().hex[:6]}",
                applies_to=models.ReportType.AppliesTo.STAFF,
            )
            with self.assertRaises(ValidationError):
                services.check_applies_to(rt, student)

    def test_update_records_detail_event(self):
        with schema_context(self.schema_name):
            staff = self._user([User.UserRole.ADMIN], "staff")
            student = self._user([User.UserRole.STUDENT], "stu")
            rt = models.ReportType.objects.create(name=f"RT-{uuid4().hex[:6]}")
            entry = services.create_entry(
                subject=student,
                report_type=rt,
                title="A",
                body="",
                field_values={},
                author=staff,
            )
            services.update_entry(entry, actor=staff, data={"title": "B"})
            entry.refresh_from_db()
            self.assertEqual(entry.title, "B")
            self.assertEqual(entry.versions.count(), 2)
            self.assertTrue(
                entry.events.filter(
                    event_type=models.LogEntryEvent.EventType.EDITED,
                    level=models.LogEntryEvent.Level.DETAIL,
                ).exists()
            )

    def test_expand_field_values_resolves_staff_fk(self):
        with schema_context(self.schema_name):
            staff = self._user([User.UserRole.ADMIN], "staff")
            rt = models.ReportType.objects.create(name=f"RT-{uuid4().hex[:6]}")
            models.ReportTypeField.objects.create(
                report_type=rt,
                field_key="fp",
                field_label="FP",
                field_type=models.ReportTypeField.FieldType.STAFF_USER_FK,
            )
            display = serializers.expand_field_values(rt, {"fp": staff.id})
            self.assertEqual(display["fp"]["id"], staff.id)
            self.assertEqual(display["fp"]["name"], staff.name)

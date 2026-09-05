import re
import unittest
from datetime import date, datetime
from unittest.mock import patch
from uuid import uuid4
from zoneinfo import ZoneInfo

from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.import_commit import commit_import_rows, validate_import_rows
from app_auth.models import User, UserCodeCounter
from app_auth.serializers import UserSerializer
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


AUTO_CODE_RE = re.compile(r"^[12]\d{8}$")


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class UserCodeHelpersTests(TestCase):
    schema_name = "xschedjuice"
    fixed_year = 2026

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        from app_auth import user_code as uc

        self.uc = uc
        self.year_patch = patch.object(
            uc, "calendar_year_in_tenant_tz", return_value=self.fixed_year
        )
        self.year_patch.start()
        self.addCleanup(self.year_patch.stop)
        with schema_context(self.schema_name):
            UserCodeCounter.objects.filter(year=self.fixed_year).delete()

    def test_type_digit_student_only(self):
        self.assertEqual(
            self.uc.type_digit_for_roles([User.UserRole.STUDENT]),
            "2",
        )

    def test_type_digit_staff_roles(self):
        self.assertEqual(
            self.uc.type_digit_for_roles([User.UserRole.TEACHER]),
            "1",
        )
        self.assertEqual(
            self.uc.type_digit_for_roles(
                [User.UserRole.STUDENT, User.UserRole.TEACHER]
            ),
            "1",
        )

    def test_allocate_student_code_format(self):
        with schema_context(self.schema_name):
            code = self.uc.allocate_user_code(
                roles=[User.UserRole.STUDENT],
                year=self.fixed_year,
            )
        self.assertEqual(code, f"2{self.fixed_year}0001")
        self.assertRegex(code, AUTO_CODE_RE.pattern)

    def test_allocate_increments_sequence(self):
        with schema_context(self.schema_name):
            first = self.uc.allocate_user_code(
                roles=[User.UserRole.STUDENT],
                year=self.fixed_year,
            )
            second = self.uc.allocate_user_code(
                roles=[User.UserRole.STUDENT],
                year=self.fixed_year,
            )
        self.assertEqual(first, f"2{self.fixed_year}0001")
        self.assertEqual(second, f"2{self.fixed_year}0002")

    def test_staff_and_student_counters_independent(self):
        with schema_context(self.schema_name):
            staff = self.uc.allocate_user_code(
                roles=[User.UserRole.TEACHER],
                year=self.fixed_year,
            )
            student = self.uc.allocate_user_code(
                roles=[User.UserRole.STUDENT],
                year=self.fixed_year,
            )
        self.assertEqual(staff, f"1{self.fixed_year}0001")
        self.assertEqual(student, f"2{self.fixed_year}0001")

    def test_validate_code_unique_raises_on_duplicate(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            User.objects.create_user(
                email=f"dup-{suffix}@example.com",
                password="x",
                name="Dup",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"dup-{suffix}@example.com",
                code="LEGACY-99",
                roles=[User.UserRole.STUDENT],
            )
            with self.assertRaises(ValidationError):
                self.uc.validate_code_unique("LEGACY-99")

    def test_validate_code_unique_allows_self_on_update(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            user = User.objects.create_user(
                email=f"self-{suffix}@example.com",
                password="x",
                name="Self",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"self-{suffix}@example.com",
                code="LEGACY-SELF",
                roles=[User.UserRole.STUDENT],
            )
            self.uc.validate_code_unique("LEGACY-SELF", exclude_user_id=user.id)

    def test_reconcile_counters_from_existing_codes(self):
        with schema_context(self.schema_name):
            UserCodeCounter.objects.all().delete()
            User.objects.create_user(
                email=f"recon-a-{uuid4().hex[:6]}@example.com",
                password="x",
                name="A",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                communication_email="a@example.com",
                code="220260003",
                roles=[User.UserRole.STUDENT],
            )
            self.uc.reconcile_counters_from_existing_codes()
            counter = UserCodeCounter.objects.get(type_digit="2", year=2026)
        self.assertEqual(counter.next_sequence, 4)

    def test_calendar_year_uses_tenant_timezone(self):
        self.year_patch.stop()
        from app_auth import user_code as uc

        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                timezone="Asia/Bangkok"
            )
        if hasattr(connection, "_user_code_org_tz_cache"):
            connection._user_code_org_tz_cache = {}
        aware = datetime(2025, 12, 31, 20, 0, tzinfo=ZoneInfo("UTC"))
        with schema_context(self.schema_name):
            with patch.object(uc.timezone, "now", return_value=aware):
                self.assertEqual(uc.calendar_year_in_tenant_tz(), 2026)
        self.year_patch.start()


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class UserSaveAutoCodeTests(TestCase):
    schema_name = "xschedjuice"
    fixed_year = 2026

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        from app_auth import user_code as uc

        self.year_patch = patch.object(
            uc, "calendar_year_in_tenant_tz", return_value=self.fixed_year
        )
        self.year_patch.start()
        self.addCleanup(self.year_patch.stop)
        with schema_context(self.schema_name):
            UserCodeCounter.objects.filter(year=self.fixed_year).delete()

    def test_create_user_auto_assigns_student_code(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            user = User.objects.create_user(
                email=f"auto-stu-{suffix}@example.com",
                password="x",
                name="Auto Student",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                communication_email=f"auto-stu-{suffix}@example.com",
                roles=[User.UserRole.STUDENT],
            )
        self.assertEqual(user.code, f"2{self.fixed_year}0001")

    def test_create_user_auto_assigns_staff_code(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            user = User.objects.create_user(
                email=f"auto-t-{suffix}@example.com",
                password="x",
                name="Auto Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"auto-t-{suffix}@example.com",
                roles=[User.UserRole.TEACHER],
            )
        self.assertEqual(user.code, f"1{self.fixed_year}0001")

    def test_create_user_preserves_admin_supplied_code(self):
        suffix = uuid4().hex[:6]
        manual = "LEGACY-ABC"
        with schema_context(self.schema_name):
            user = User.objects.create_user(
                email=f"manual-{suffix}@example.com",
                password="x",
                name="Manual",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"manual-{suffix}@example.com",
                code=manual,
                roles=[User.UserRole.STUDENT],
            )
        self.assertEqual(user.code, manual)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class UserSerializerCodeValidationTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_validate_code_rejects_duplicate(self):
        suffix = uuid4().hex[:6]
        taken = "TAKEN-CODE"
        with schema_context(self.schema_name):
            User.objects.create_user(
                email=f"owner-{suffix}@example.com",
                password="x",
                name="Owner",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"owner-{suffix}@example.com",
                code=taken,
                roles=[User.UserRole.STUDENT],
            )
            target = User.objects.create_user(
                email=f"target-{suffix}@example.com",
                password="x",
                name="Target",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"target-{suffix}@example.com",
                roles=[User.UserRole.STUDENT],
            )
            ser = UserSerializer(
                instance=target,
                data={"code": taken},
                partial=True,
                context={"request": Request(APIRequestFactory().get("/"))},
            )
            self.assertFalse(ser.is_valid())
            self.assertIn("code", ser.errors)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ImportCommitAutoCodeTests(TestCase):
    schema_name = "xschedjuice"
    fixed_year = 2026

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        from app_auth import user_code as uc

        self.year_patch = patch.object(
            uc, "calendar_year_in_tenant_tz", return_value=self.fixed_year
        )
        self.year_patch.start()
        self.addCleanup(self.year_patch.stop)
        with schema_context(self.schema_name):
            UserCodeCounter.objects.filter(year=self.fixed_year).delete()

    def test_import_auto_assigns_code_when_blank(self):
        uid = uuid4().hex[:8]
        with schema_context(self.schema_name):
            call_command("sync_builtin_fields")
            rows = [
                {
                    "email": f"import-{uid}@example.com",
                    "name": "Import Student",
                    "phone_number": "-",
                    "date_of_birth": "2002-03-04",
                    "custom_data": {},
                }
            ]
            errors, prepared = validate_import_rows(rows=rows, role="student")
            self.assertEqual(errors, [])
            result = commit_import_rows(prepared=prepared, role="student")
            user = User.objects.get(email=f"import-{uid}@example.com")
        self.assertEqual(result["created"], 1)
        self.assertEqual(user.code, f"2{self.fixed_year}0001")

    def test_import_preserves_sheet_code(self):
        uid = uuid4().hex[:8]
        manual = "IMPORT-MANUAL-1"
        with schema_context(self.schema_name):
            call_command("sync_builtin_fields")
            rows = [
                {
                    "email": f"import-manual-{uid}@example.com",
                    "name": "Manual Import",
                    "phone_number": "-",
                    "date_of_birth": "2002-03-04",
                    "code": manual,
                    "custom_data": {},
                }
            ]
            errors, prepared = validate_import_rows(rows=rows, role="student")
            self.assertEqual(errors, [])
            commit_import_rows(prepared=prepared, role="student")
            user = User.objects.get(email=f"import-manual-{uid}@example.com")
        self.assertEqual(user.code, manual)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class BackfillUserCodesCommandTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _make_user_without_code(self, *, email: str, roles: list[str], created_at):
        with schema_context(self.schema_name):
            user = User(
                email=email,
                name="Backfill",
                phone_number="-",
                communication_email=email,
                date_of_birth=date(2010, 1, 1),
                roles=roles,
                is_active=True,
                is_staff=User.UserRole.STUDENT not in roles
                or len(roles) != 1,
            )
            user.set_password("x")
            user.save()
            User.objects.filter(pk=user.pk).update(created_at=created_at)
            user.refresh_from_db()
            User.objects.filter(pk=user.pk).update(code=None)
            user.refresh_from_db()
            return user

    def test_backfill_assigns_codes_by_created_at_year(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            u1 = self._make_user_without_code(
                email=f"bf1-{suffix}@example.com",
                roles=[User.UserRole.STUDENT],
                created_at=timezone.make_aware(datetime(2024, 6, 1)),
            )
            u2 = self._make_user_without_code(
                email=f"bf2-{suffix}@example.com",
                roles=[User.UserRole.STUDENT],
                created_at=timezone.make_aware(datetime(2024, 7, 1)),
            )
            UserCodeCounter.objects.filter(type_digit="2", year=2024).delete()
            call_command("backfill-user-codes", schema_name=self.schema_name)
            u1.refresh_from_db()
            u2.refresh_from_db()
        self.assertEqual(u1.code, "220240001")
        self.assertEqual(u2.code, "220240002")

    def test_backfill_dry_run_does_not_write(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            user = self._make_user_without_code(
                email=f"dry-{suffix}@example.com",
                roles=[User.UserRole.TEACHER],
                created_at=timezone.make_aware(datetime(2025, 1, 1)),
            )
            call_command(
                "backfill-user-codes",
                schema_name=self.schema_name,
                dry_run=True,
            )
            user.refresh_from_db()
        self.assertIsNone(user.code)

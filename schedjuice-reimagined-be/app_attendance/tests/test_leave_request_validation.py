import unittest
from datetime import date, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4
from zoneinfo import ZoneInfo

from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from tenant_schemas.utils import schema_context

from app_attendance.leave_request_validation import (
    LeaveOverlapError,
    find_overlapping_leave_request,
    tenant_today,
    validate_leave_dates,
)
from app_attendance.models import LeaveRequest
from app_auth.models import User


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _tenant(timezone_name="UTC"):
    return SimpleNamespace(timezone=timezone_name)


class TenantTodayTests(SimpleTestCase):
    @patch("django.utils.timezone.now")
    def test_tenant_today_uses_tenant_timezone(self, mock_now):
        mock_now.return_value = timezone.make_aware(
            datetime(2026, 8, 21, 18, 0, 0),
            timezone.utc,
        )
        yangon_today = tenant_today(_tenant("Asia/Yangon"))
        self.assertEqual(yangon_today, date(2026, 8, 22))


class ValidateLeaveDatesTests(SimpleTestCase):
    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_rejects_start_date_before_today_in_tenant_tz(self, mock_tenant_today):
        mock_tenant_today.return_value = date(2026, 8, 21)
        tenant = _tenant("Asia/Yangon")

        with self.assertRaises(ValidationError) as ctx:
            validate_leave_dates(
                start_date=date(2026, 8, 20),
                end_date=date(2026, 8, 20),
                tenant=tenant,
            )
        self.assertIn("start_date", ctx.exception.detail)

    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_accepts_start_date_on_today(self, mock_tenant_today):
        mock_tenant_today.return_value = date(2026, 8, 21)
        tenant = _tenant("Asia/Yangon")

        validate_leave_dates(
            start_date=date(2026, 8, 21),
            end_date=date(2026, 8, 21),
            tenant=tenant,
        )

    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_rejects_end_date_before_start_date(self, mock_tenant_today):
        mock_tenant_today.return_value = date(2026, 8, 21)
        tenant = _tenant("UTC")

        with self.assertRaises(ValidationError) as ctx:
            validate_leave_dates(
                start_date=date(2026, 8, 25),
                end_date=date(2026, 8, 24),
                tenant=tenant,
            )
        self.assertIn("end_date", ctx.exception.detail)


class LeaveOverlapErrorTests(SimpleTestCase):
    def test_exposes_existing_request_fields(self):
        err = LeaveOverlapError(
            existing_request_id=42,
            existing_request_status=LeaveRequest.Status.PENDING,
        )
        self.assertEqual(err.existing_request_id, 42)
        self.assertEqual(err.existing_request_status, LeaveRequest.Status.PENDING)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class FindOverlappingLeaveRequestTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            self.student = User.objects.create_user(
                email=f"stu-leave-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.other_student = User.objects.create_user(
                email=f"stu-other-{suffix}@example.com",
                password="x",
                name="Other Student",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )

    def _create_leave(
        self,
        *,
        student=None,
        start_date,
        end_date,
        status=LeaveRequest.Status.PENDING,
    ):
        with schema_context(self.schema_name):
            return LeaveRequest.objects.create(
                student=student or self.student,
                start_date=start_date,
                end_date=end_date,
                reason="Test leave",
                status=status,
            )

    def test_find_overlap_returns_pending_request(self):
        pending = self._create_leave(
            start_date=date(2026, 9, 1),
            end_date=date(2026, 9, 5),
        )

        with schema_context(self.schema_name):
            overlap = find_overlapping_leave_request(
                self.student,
                date(2026, 9, 3),
                date(2026, 9, 7),
            )

        self.assertIsNotNone(overlap)
        self.assertEqual(overlap.id, pending.id)

    def test_find_overlap_returns_approved_request(self):
        approved = self._create_leave(
            start_date=date(2026, 9, 10),
            end_date=date(2026, 9, 12),
            status=LeaveRequest.Status.APPROVED,
        )

        with schema_context(self.schema_name):
            overlap = find_overlapping_leave_request(
                self.student,
                date(2026, 9, 11),
                date(2026, 9, 11),
            )

        self.assertIsNotNone(overlap)
        self.assertEqual(overlap.id, approved.id)

    def test_find_overlap_ignores_cancelled_and_denied(self):
        self._create_leave(
            start_date=date(2026, 9, 20),
            end_date=date(2026, 9, 22),
            status=LeaveRequest.Status.CANCELLED,
        )
        self._create_leave(
            start_date=date(2026, 9, 20),
            end_date=date(2026, 9, 22),
            status=LeaveRequest.Status.DENIED,
        )

        with schema_context(self.schema_name):
            overlap = find_overlapping_leave_request(
                self.student,
                date(2026, 9, 21),
                date(2026, 9, 21),
            )

        self.assertIsNone(overlap)

    def test_find_overlap_returns_none_for_non_intersecting_range(self):
        self._create_leave(
            start_date=date(2026, 10, 1),
            end_date=date(2026, 10, 3),
        )

        with schema_context(self.schema_name):
            overlap = find_overlapping_leave_request(
                self.student,
                date(2026, 10, 4),
                date(2026, 10, 6),
            )

        self.assertIsNone(overlap)

    def test_find_overlap_excludes_request_by_id(self):
        existing = self._create_leave(
            start_date=date(2026, 11, 1),
            end_date=date(2026, 11, 5),
        )

        with schema_context(self.schema_name):
            overlap = find_overlapping_leave_request(
                self.student,
                date(2026, 11, 2),
                date(2026, 11, 4),
                exclude_id=existing.id,
            )

        self.assertIsNone(overlap)

    def test_find_overlap_scoped_to_student(self):
        self._create_leave(
            student=self.other_student,
            start_date=date(2026, 12, 1),
            end_date=date(2026, 12, 3),
        )

        with schema_context(self.schema_name):
            overlap = find_overlapping_leave_request(
                self.student,
                date(2026, 12, 2),
                date(2026, 12, 2),
            )

        self.assertIsNone(overlap)

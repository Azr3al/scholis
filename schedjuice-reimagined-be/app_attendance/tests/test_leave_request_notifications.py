import unittest
from datetime import date
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_attendance.leave_request_approval import approve_leave_request, deny_leave_request
from app_attendance.leave_request_notifications import (
    _admin_recipient_ids,
    notify_leave_approved,
    notify_leave_denied,
    notify_leave_submitted,
)
from app_attendance.models import LeaveRequest
from app_auth.models import User
from app_organization.models import Organization
from app_rbac.models import Role, RolePermission
from app_rbac.seeding import seed_rbac
from app_utility_notifications.utility_notification_kinds import UtilityNotificationKind


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class LeaveRequestNotificationTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        ensure_public_schema()
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(get_public_schema_name()):
            cls.org = Organization.objects.filter(schema_name=cls.schema_name).first()

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.leave_day = date(2026, 9, 15)
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"leave-notify-admin-{suffix}@example.com",
                password="x",
                name="Leave Admin",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"leave-notify-admin-{suffix}@example.com",
                code=f"leave-notify-admin-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"leave-notify-teacher-{suffix}@example.com",
                password="x",
                name="Leave Teacher",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"leave-notify-teacher-{suffix}@example.com",
                code=f"leave-notify-teacher-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            leave_only_slug = f"leave-only-{suffix}"
            leave_only_role = Role.objects.create(
                slug=leave_only_slug,
                display_name="Leave manage only",
                is_system=False,
            )
            RolePermission.objects.create(
                role=leave_only_role,
                permission_code="leave.manage_all",
            )
            self.leave_manager = User.objects.create_user(
                email=f"leave-notify-manager-{suffix}@example.com",
                password="x",
                name="Leave Manager",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"leave-notify-manager-{suffix}@example.com",
                code=f"leave-notify-manager-{suffix}",
                roles=[leave_only_slug],
            )
            self.student = User.objects.create_user(
                email=f"leave-notify-student-{suffix}@example.com",
                password="x",
                name="Leave Student",
                phone_number="1",
                date_of_birth=date(2010, 1, 1),
                communication_email=f"leave-notify-student-{suffix}@example.com",
                code=f"leave-notify-student-{suffix}",
                roles=[User.UserRole.STUDENT],
            )

    def _create_leave(self, **kwargs):
        defaults = {
            "student": self.student,
            "start_date": self.leave_day,
            "end_date": self.leave_day,
            "reason": "Family trip",
            "status": LeaveRequest.Status.PENDING,
        }
        defaults.update(kwargs)
        with schema_context(self.schema_name):
            return LeaveRequest.objects.create(**defaults)

    def test_admin_recipient_ids_uses_rbac_not_role_heuristics(self):
        with schema_context(self.schema_name):
            recipient_ids = _admin_recipient_ids()
            self.assertIn(self.admin.id, recipient_ids)
            self.assertIn(self.leave_manager.id, recipient_ids)
            self.assertNotIn(self.teacher.id, recipient_ids)

    def test_admin_recipient_ids_honors_exclude(self):
        with schema_context(self.schema_name):
            recipient_ids = _admin_recipient_ids(exclude_user_ids=[self.admin.id])
            self.assertNotIn(self.admin.id, recipient_ids)
            self.assertIn(self.leave_manager.id, recipient_ids)

    @patch("app_attendance.leave_request_notifications.enqueue_push_for_user_ids")
    def test_notify_leave_submitted_targets_leave_manage_all_holders(self, mock_enqueue):
        leave = self._create_leave()
        with schema_context(self.schema_name):
            notify_leave_submitted(leave, self.org)

        mock_enqueue.assert_called_once()
        args, kwargs = mock_enqueue.call_args
        self.assertIn(self.admin.id, args[0])
        self.assertIn(self.leave_manager.id, args[0])
        self.assertNotIn(self.teacher.id, args[0])
        self.assertNotIn(self.student.id, args[0])
        self.assertEqual(kwargs["data"]["kind"], UtilityNotificationKind.LEAVE_SUBMITTED.value)
        self.assertEqual(
            kwargs["data"]["href"],
            f"/leave-requests?highlight={leave.id}",
        )
        self.assertEqual(kwargs["data"]["leave_request_id"], str(leave.id))

    @patch("app_attendance.leave_request_notifications.enqueue_push_for_user_ids")
    def test_notify_leave_approved_targets_student(self, mock_enqueue):
        leave = self._create_leave(status=LeaveRequest.Status.APPROVED)
        with schema_context(self.schema_name):
            notify_leave_approved(leave, self.org)

        mock_enqueue.assert_called_once()
        args, kwargs = mock_enqueue.call_args
        self.assertEqual(args[0], [self.student.id])
        self.assertEqual(kwargs["data"]["kind"], UtilityNotificationKind.LEAVE_APPROVED.value)
        self.assertEqual(
            kwargs["data"]["href"],
            f"/(protected)/leave-requests/{leave.id}",
        )

    @patch("app_attendance.leave_request_notifications.enqueue_push_for_user_ids")
    def test_notify_leave_denied_targets_student_with_reason(self, mock_enqueue):
        leave = self._create_leave(
            status=LeaveRequest.Status.DENIED,
            denial_reason="Insufficient notice",
        )
        with schema_context(self.schema_name):
            notify_leave_denied(leave, self.org)

        mock_enqueue.assert_called_once()
        args, kwargs = mock_enqueue.call_args
        self.assertEqual(args[0], [self.student.id])
        self.assertEqual(kwargs["data"]["kind"], UtilityNotificationKind.LEAVE_DENIED.value)
        self.assertEqual(kwargs["body"], "Insufficient notice")
        self.assertEqual(
            kwargs["data"]["href"],
            f"/(protected)/leave-requests/{leave.id}",
        )

    @patch("app_attendance.leave_request_approval.notify_leave_approved")
    def test_approve_leave_request_notifies_student(self, mock_notify):
        leave = self._create_leave()
        with schema_context(self.schema_name):
            approve_leave_request(leave, actor=self.admin, tenant=self.org)

        mock_notify.assert_called_once_with(leave, self.org)

    @patch("app_attendance.leave_request_approval.notify_leave_denied")
    def test_deny_leave_request_notifies_student(self, mock_notify):
        leave = self._create_leave()
        with schema_context(self.schema_name):
            deny_leave_request(
                leave,
                actor=self.admin,
                denial_reason="Insufficient notice",
                tenant=self.org,
            )

        mock_notify.assert_called_once_with(leave, self.org)

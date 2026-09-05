import unittest
from datetime import date, datetime, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_attendance.leave_request_approval import (
    apply_approved_leave_to_attendance,
    approve_leave_request,
    deny_leave_request,
    maybe_apply_approved_leave_for_user_event,
)
from app_attendance.marking_services import build_marking_roster
from app_attendance.models import LeaveRequest, UserEvent
from app_auth.models import User
from app_course.models import Category, Course, Event, Program, UserCourse
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class LeaveRequestApprovalTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        ensure_public_schema()
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=cls.schema_name).update(
                timezone="UTC",
            )
            cls.org = Organization.objects.filter(schema_name=cls.schema_name).first()
        with schema_context(cls.schema_name):
            seed_rbac()

    def setUp(self):
        self.leave_day = date(2026, 9, 15)
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name), patch(
            "app_telegram.signals.dm_invite_link_to_teacher.delay"
        ), patch("app_telegram.signals.remove_telegram_member.delay"):
            self.admin = User.objects.create_user(
                email=f"admin-leave-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.student = User.objects.create_user(
                email=f"stu-leave-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.cat = Category.objects.create(name=f"Cat {suffix}")
            self.prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.leave_day,
                end_date=self.leave_day + timedelta(days=30),
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            ev_date = timezone.make_aware(
                datetime.combine(self.leave_day, datetime.min.time())
            )
            self.event = Event.objects.create(
                title="Session",
                course=self.course,
                date=ev_date,
                time_from=datetime.strptime("09:00", "%H:%M").time(),
                time_to=datetime.strptime("10:00", "%H:%M").time(),
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

    def test_approve_marks_unregistered_as_absent_with_note(self):
        leave = self._create_leave()
        with schema_context(self.schema_name):
            updated = approve_leave_request(leave, actor=self.admin, tenant=self.org)
            ue = UserEvent.objects.get(user=self.student, event=self.event)

        self.assertEqual(updated.status, LeaveRequest.Status.APPROVED)
        self.assertEqual(updated.reviewed_by_id, self.admin.id)
        self.assertIsNotNone(updated.reviewed_at)
        self.assertEqual(ue.attendance_status, UserEvent.AttendanceStatus.ABSENT_WITH_LEAVE)
        self.assertEqual(ue.attendance_note, f"Approved leave #{leave.id}")

    def test_approve_skips_present_and_late(self):
        leave = self._create_leave()
        with schema_context(self.schema_name):
            UserEvent.objects.create(
                user=self.student,
                event=self.event,
                attendance_status=UserEvent.AttendanceStatus.PRESENT,
                attendance_note="Checked in",
            )
            approve_leave_request(leave, actor=self.admin, tenant=self.org)
            present_ue = UserEvent.objects.get(user=self.student, event=self.event)
            self.assertEqual(
                present_ue.attendance_status, UserEvent.AttendanceStatus.PRESENT
            )
            self.assertEqual(present_ue.attendance_note, "Checked in")

        leave2 = self._create_leave(
            start_date=self.leave_day + timedelta(days=1),
            end_date=self.leave_day + timedelta(days=1),
        )
        with schema_context(self.schema_name):
            late_event = Event.objects.create(
                title="Late session",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(self.leave_day + timedelta(days=1), datetime.min.time())
                ),
                time_from=datetime.strptime("11:00", "%H:%M").time(),
                time_to=datetime.strptime("12:00", "%H:%M").time(),
            )
            UserEvent.objects.create(
                user=self.student,
                event=late_event,
                attendance_status=UserEvent.AttendanceStatus.LATE,
            )
            approve_leave_request(leave2, actor=self.admin, tenant=self.org)
            late_ue = UserEvent.objects.get(user=self.student, event=late_event)
            self.assertEqual(late_ue.attendance_status, UserEvent.AttendanceStatus.LATE)

    def test_approve_no_op_when_student_has_no_sessions_that_day(self):
        leave = self._create_leave(
            start_date=date(2026, 10, 1),
            end_date=date(2026, 10, 3),
        )
        with schema_context(self.schema_name):
            count = apply_approved_leave_to_attendance(leave, self.org)
            self.assertEqual(count, 0)
            self.assertFalse(UserEvent.objects.filter(user=self.student).exists())

    def test_deny_does_not_touch_userevent(self):
        leave = self._create_leave()
        with schema_context(self.schema_name):
            UserEvent.objects.create(
                user=self.student,
                event=self.event,
                attendance_status=UserEvent.AttendanceStatus.UNREGISTERED,
            )
            deny_leave_request(
                leave,
                actor=self.admin,
                denial_reason="Insufficient notice",
                tenant=self.org,
            )
            ue = UserEvent.objects.get(user=self.student, event=self.event)

        self.assertEqual(leave.status, LeaveRequest.Status.DENIED)
        self.assertEqual(leave.denial_reason, "Insufficient notice")
        self.assertEqual(ue.attendance_status, UserEvent.AttendanceStatus.UNREGISTERED)
        self.assertIsNone(ue.attendance_note)

    def test_approve_rejects_non_pending(self):
        leave = self._create_leave(status=LeaveRequest.Status.APPROVED)
        with schema_context(self.schema_name):
            with self.assertRaises(ValidationError):
                approve_leave_request(leave, actor=self.admin, tenant=self.org)

    def test_deny_requires_non_empty_denial_reason(self):
        leave = self._create_leave()
        with schema_context(self.schema_name):
            with self.assertRaises(ValidationError):
                deny_leave_request(
                    leave,
                    actor=self.admin,
                    denial_reason="   ",
                    tenant=self.org,
                )

    def test_roster_bulk_create_applies_approved_leave(self):
        future_day = self.leave_day + timedelta(days=7)
        with schema_context(self.schema_name):
            future_event = Event.objects.create(
                title="Future session",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(future_day, datetime.min.time())
                ),
                time_from=datetime.strptime("09:00", "%H:%M").time(),
                time_to=datetime.strptime("10:00", "%H:%M").time(),
            )
            leave = LeaveRequest.objects.create(
                student=self.student,
                start_date=future_day,
                end_date=future_day,
                reason="Doctor",
                status=LeaveRequest.Status.APPROVED,
                reviewed_by=self.admin,
                reviewed_at=timezone.now(),
            )
            UserEvent.objects.filter(event=future_event).delete()
            build_marking_roster(future_event.id, tenant=self.org)
            ue = UserEvent.objects.get(user=self.student, event=future_event)

        self.assertEqual(ue.attendance_status, UserEvent.AttendanceStatus.ABSENT_WITH_LEAVE)
        self.assertEqual(ue.attendance_note, f"Approved leave #{leave.id}")

    def test_maybe_apply_marks_new_userevent_from_approved_leave(self):
        future_day = self.leave_day + timedelta(days=7)
        with schema_context(self.schema_name):
            future_event = Event.objects.create(
                title="Future session",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(future_day, datetime.min.time())
                ),
                time_from=datetime.strptime("09:00", "%H:%M").time(),
                time_to=datetime.strptime("10:00", "%H:%M").time(),
            )
            leave = LeaveRequest.objects.create(
                student=self.student,
                start_date=future_day,
                end_date=future_day,
                reason="Doctor",
                status=LeaveRequest.Status.APPROVED,
                reviewed_by=self.admin,
                reviewed_at=timezone.now(),
            )
            UserEvent.objects.filter(event=future_event).delete()
            build_marking_roster(future_event.id)
            ue = UserEvent.objects.get(user=self.student, event=future_event)
            self.assertEqual(
                ue.attendance_status, UserEvent.AttendanceStatus.UNREGISTERED
            )

            applied = maybe_apply_approved_leave_for_user_event(ue, self.org)
            ue.refresh_from_db()

        self.assertTrue(applied)
        self.assertEqual(ue.attendance_status, UserEvent.AttendanceStatus.ABSENT_WITH_LEAVE)
        self.assertEqual(ue.attendance_note, f"Approved leave #{leave.id}")

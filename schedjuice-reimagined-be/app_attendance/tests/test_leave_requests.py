import unittest
from datetime import date, datetime, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import get_public_schema_name, schema_context

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
@override_settings(RBAC_ENFORCE="enforce")
class LeaveRequestViewTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"
    leave_day = date(2026, 9, 15)

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

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.tenant_today = date(2026, 8, 21)
        with schema_context(self.schema_name), patch(
            "app_telegram.signals.dm_invite_link_to_teacher.delay"
        ), patch("app_telegram.signals.remove_telegram_member.delay"):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"leave-api-admin-{suffix}@example.com",
                password="x",
                name="Leave Admin",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"leave-api-admin-{suffix}@example.com",
                code=f"leave-api-admin-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"leave-api-teacher-{suffix}@example.com",
                password="x",
                name="Leave Teacher",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"leave-api-teacher-{suffix}@example.com",
                code=f"leave-api-teacher-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.student_a = self._make_student(f"leave-api-student-a-{suffix}")
            self.student_b = self._make_student(f"leave-api-student-b-{suffix}")
            self.cat = Category.objects.create(name=f"Leave Cat {suffix}")
            self.prog = Program.objects.create(
                name=f"Leave Prog {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"Leave Course {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.leave_day,
                end_date=self.leave_day + timedelta(days=30),
            )
            for student in (self.student_a, self.student_b):
                UserCourse.objects.create(
                    user=student,
                    course=self.course,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                )
            from django.utils import timezone

            ev_date = timezone.make_aware(
                datetime.combine(self.leave_day, datetime.min.time())
            )
            self.event = Event.objects.create(
                title="Leave session",
                course=self.course,
                date=ev_date,
                time_from=datetime.strptime("09:00", "%H:%M").time(),
                time_to=datetime.strptime("10:00", "%H:%M").time(),
            )

    def _make_student(self, prefix: str) -> User:
        return User.objects.create_user(
            email=f"{prefix}@example.com",
            password="x",
            name=prefix,
            phone_number="1",
            date_of_birth=date(2010, 1, 1),
            communication_email=f"{prefix}@example.com",
            code=prefix,
            roles=[User.UserRole.STUDENT],
        )

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _token_client(self, user):
        class TokenUserStub:
            def __init__(self, email):
                self.id = email
                self.pk = email
                self.is_authenticated = True

            def __getattr__(self, attr):
                return None

        client = APIClient()
        client.force_authenticate(user=TokenUserStub(user.email))
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _create_leave(self, *, student=None, **kwargs):
        defaults = {
            "student": student or self.student_a,
            "start_date": self.leave_day,
            "end_date": self.leave_day,
            "reason": "Family trip",
            "status": LeaveRequest.Status.PENDING,
        }
        defaults.update(kwargs)
        with schema_context(self.schema_name):
            return LeaveRequest.objects.create(**defaults)

    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_student_list_only_own_requests(self, mock_tenant_today):
        mock_tenant_today.return_value = self.tenant_today
        with schema_context(self.schema_name):
            own = self._create_leave(student=self.student_a)
            self._create_leave(
                student=self.student_b,
                start_date=self.leave_day + timedelta(days=1),
                end_date=self.leave_day + timedelta(days=1),
            )
            res = self._client(self.student_a).get(f"{self.api_prefix}/leave-requests")
            self.assertEqual(res.status_code, 200, res.content)
            rows = res.json()["data"]
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["id"], own.id)

    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_student_cannot_view_other_students_request(self, mock_tenant_today):
        mock_tenant_today.return_value = self.tenant_today
        with schema_context(self.schema_name):
            other = self._create_leave(student=self.student_b)
            res = self._client(self.student_a).get(
                f"{self.api_prefix}/leave-requests/{other.id}"
            )
            self.assertEqual(res.status_code, 404)

    @patch("app_attendance.leave_request_views.notify_leave_submitted")
    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_student_create_leave_request(self, mock_tenant_today, mock_notify):
        mock_tenant_today.return_value = self.tenant_today
        with schema_context(self.schema_name):
            res = self._client(self.student_a).post(
                f"{self.api_prefix}/leave-requests",
                {
                    "start_date": self.leave_day.isoformat(),
                    "reason": "Doctor appointment",
                },
                format="json",
            )
            self.assertEqual(res.status_code, 201, res.content)
            payload = res.json()["data"]
            leave = LeaveRequest.objects.get(id=payload["id"])
            self.assertEqual(leave.student_id, self.student_a.id)
            self.assertEqual(leave.end_date, self.leave_day)
            self.assertEqual(leave.status, LeaveRequest.Status.PENDING)
            mock_notify.assert_called_once()

    @patch("app_attendance.leave_request_views.notify_leave_submitted")
    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_student_create_leave_request_with_stateless_jwt_user(
        self, mock_tenant_today, mock_notify
    ):
        mock_tenant_today.return_value = self.tenant_today
        with schema_context(self.schema_name):
            res = self._token_client(self.student_a).post(
                f"{self.api_prefix}/leave-requests",
                {
                    "start_date": self.leave_day.isoformat(),
                    "reason": "Doctor appointment",
                },
                format="json",
            )
            self.assertEqual(res.status_code, 201, res.content)
            payload = res.json()["data"]
            leave = LeaveRequest.objects.get(id=payload["id"])
            self.assertEqual(leave.student_id, self.student_a.id)
            mock_notify.assert_called_once()

    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_create_overlap_returns_409_payload(self, mock_tenant_today):
        mock_tenant_today.return_value = self.tenant_today
        with schema_context(self.schema_name):
            existing = self._create_leave(
                start_date=self.leave_day,
                end_date=self.leave_day + timedelta(days=2),
            )
            res = self._client(self.student_a).post(
                f"{self.api_prefix}/leave-requests",
                {
                    "start_date": (self.leave_day + timedelta(days=1)).isoformat(),
                    "end_date": (self.leave_day + timedelta(days=3)).isoformat(),
                    "reason": "Overlap attempt",
                },
                format="json",
            )
            self.assertEqual(res.status_code, 409, res.content)
            body = res.json()
            self.assertEqual(body["code"], "leave_overlap")
            self.assertEqual(body["existing_request_id"], existing.id)
            self.assertEqual(body["existing_request_status"], LeaveRequest.Status.PENDING)

    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_create_rejects_past_start_date(self, mock_tenant_today):
        mock_tenant_today.return_value = self.tenant_today
        with schema_context(self.schema_name):
            res = self._client(self.student_a).post(
                f"{self.api_prefix}/leave-requests",
                {
                    "start_date": (self.tenant_today - timedelta(days=1)).isoformat(),
                    "reason": "Too late",
                },
                format="json",
            )
            self.assertEqual(res.status_code, 400, res.content)
            self.assertIn("start_date", res.json()["details"])

    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_create_rejects_empty_reason(self, mock_tenant_today):
        mock_tenant_today.return_value = self.tenant_today
        with schema_context(self.schema_name):
            res = self._client(self.student_a).post(
                f"{self.api_prefix}/leave-requests",
                {
                    "start_date": self.leave_day.isoformat(),
                    "reason": "   ",
                },
                format="json",
            )
            self.assertEqual(res.status_code, 400, res.content)

    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_patch_overlap_returns_409(self, mock_tenant_today):
        mock_tenant_today.return_value = self.tenant_today
        with schema_context(self.schema_name):
            self._create_leave(
                start_date=self.leave_day + timedelta(days=5),
                end_date=self.leave_day + timedelta(days=7),
            )
            editable = self._create_leave(
                start_date=self.leave_day + timedelta(days=10),
                end_date=self.leave_day + timedelta(days=10),
            )
            res = self._client(self.student_a).patch(
                f"{self.api_prefix}/leave-requests/{editable.id}",
                {"start_date": (self.leave_day + timedelta(days=6)).isoformat()},
                format="json",
            )
            self.assertEqual(res.status_code, 409, res.content)
            self.assertEqual(res.json()["code"], "leave_overlap")

    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_student_can_patch_pending_request(self, mock_tenant_today):
        mock_tenant_today.return_value = self.tenant_today
        with schema_context(self.schema_name):
            leave = self._create_leave()
            res = self._client(self.student_a).patch(
                f"{self.api_prefix}/leave-requests/{leave.id}",
                {"reason": "Updated reason"},
                format="json",
            )
            self.assertEqual(res.status_code, 200, res.content)
            leave.refresh_from_db()
            self.assertEqual(leave.reason, "Updated reason")

    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_patch_blocked_when_not_pending(self, mock_tenant_today):
        mock_tenant_today.return_value = self.tenant_today
        with schema_context(self.schema_name):
            leave = self._create_leave(status=LeaveRequest.Status.APPROVED)
            res = self._client(self.student_a).patch(
                f"{self.api_prefix}/leave-requests/{leave.id}",
                {"reason": "Should fail"},
                format="json",
            )
            self.assertEqual(res.status_code, 400, res.content)

    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_cancel_pending_request(self, mock_tenant_today):
        mock_tenant_today.return_value = self.tenant_today
        with schema_context(self.schema_name):
            leave = self._create_leave()
            res = self._client(self.student_a).post(
                f"{self.api_prefix}/leave-requests/{leave.id}/cancel"
            )
            self.assertEqual(res.status_code, 200, res.content)
            leave.refresh_from_db()
            self.assertEqual(leave.status, LeaveRequest.Status.CANCELLED)

    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_cancel_blocked_when_not_pending(self, mock_tenant_today):
        mock_tenant_today.return_value = self.tenant_today
        with schema_context(self.schema_name):
            leave = self._create_leave(status=LeaveRequest.Status.DENIED)
            res = self._client(self.student_a).post(
                f"{self.api_prefix}/leave-requests/{leave.id}/cancel"
            )
            self.assertEqual(res.status_code, 400, res.content)

    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_admin_list_supports_filters(self, mock_tenant_today):
        mock_tenant_today.return_value = self.tenant_today
        with schema_context(self.schema_name):
            pending = self._create_leave(
                student=self.student_a,
                status=LeaveRequest.Status.PENDING,
            )
            self._create_leave(
                student=self.student_b,
                start_date=self.leave_day + timedelta(days=3),
                end_date=self.leave_day + timedelta(days=3),
                status=LeaveRequest.Status.APPROVED,
            )
            res = self._client(self.admin).get(
                f"{self.api_prefix}/leave-requests",
                {
                    "status": LeaveRequest.Status.PENDING,
                    "student_id": self.student_a.id,
                },
            )
            self.assertEqual(res.status_code, 200, res.content)
            rows = res.json()["data"]
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["id"], pending.id)

    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_admin_approve_marks_matching_userevent_absent(self, mock_tenant_today):
        mock_tenant_today.return_value = self.tenant_today
        with schema_context(self.schema_name):
            leave = self._create_leave()
            res = self._client(self.admin).post(
                f"{self.api_prefix}/leave-requests/{leave.id}/approve"
            )
            self.assertEqual(res.status_code, 200, res.content)
            leave.refresh_from_db()
            ue = UserEvent.objects.get(user=self.student_a, event=self.event)
            self.assertEqual(leave.status, LeaveRequest.Status.APPROVED)
            self.assertEqual(ue.attendance_status, UserEvent.AttendanceStatus.ABSENT)
            self.assertEqual(ue.attendance_note, f"Approved leave #{leave.id}")

    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_deny_without_reason_returns_400(self, mock_tenant_today):
        mock_tenant_today.return_value = self.tenant_today
        with schema_context(self.schema_name):
            leave = self._create_leave()
            res = self._client(self.admin).post(
                f"{self.api_prefix}/leave-requests/{leave.id}/deny",
                {"denial_reason": "   "},
                format="json",
            )
            self.assertEqual(res.status_code, 400, res.content)

    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_admin_deny_sets_status_and_reason(self, mock_tenant_today):
        mock_tenant_today.return_value = self.tenant_today
        with schema_context(self.schema_name):
            leave = self._create_leave()
            res = self._client(self.admin).post(
                f"{self.api_prefix}/leave-requests/{leave.id}/deny",
                {"denial_reason": "Insufficient notice"},
                format="json",
            )
            self.assertEqual(res.status_code, 200, res.content)
            leave.refresh_from_db()
            self.assertEqual(leave.status, LeaveRequest.Status.DENIED)
            self.assertEqual(leave.denial_reason, "Insufficient notice")

    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_teacher_forbidden_on_approve(self, mock_tenant_today):
        mock_tenant_today.return_value = self.tenant_today
        with schema_context(self.schema_name):
            leave = self._create_leave()
            res = self._client(self.teacher).post(
                f"{self.api_prefix}/leave-requests/{leave.id}/approve"
            )
            self.assertEqual(res.status_code, 403, res.content)

    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_approve_non_pending_returns_409(self, mock_tenant_today):
        mock_tenant_today.return_value = self.tenant_today
        with schema_context(self.schema_name):
            leave = self._create_leave(status=LeaveRequest.Status.APPROVED)
            res = self._client(self.admin).post(
                f"{self.api_prefix}/leave-requests/{leave.id}/approve"
            )
            self.assertEqual(res.status_code, 409, res.content)

    @patch("app_attendance.leave_request_validation.tenant_today")
    def test_admin_can_view_student_detail(self, mock_tenant_today):
        mock_tenant_today.return_value = self.tenant_today
        with schema_context(self.schema_name):
            leave = self._create_leave()
            res = self._client(self.admin).get(
                f"{self.api_prefix}/leave-requests/{leave.id}"
            )
            self.assertEqual(res.status_code, 200, res.content)
            self.assertEqual(res.json()["data"]["id"], leave.id)

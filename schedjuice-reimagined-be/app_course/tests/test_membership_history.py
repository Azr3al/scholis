"""Tests for course membership history events and API."""

from datetime import date, datetime, time, timezone as dt_timezone
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_attendance.models import UserEvent
from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM
from app_auth.models import User
from app_course.membership_history import record_membership_event
from app_course.models import (
    Category,
    Course,
    CourseJoinRequest,
    CourseMembershipEvent,
    Event,
    UserCourse,
)
from app_course.program_helpers import get_default_program
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac
from app_reports.analytics_services import build_time_series


class CourseMembershipHistoryTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        ensure_public_schema()
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=cls.schema_name).update(
                is_microsoft_on=False,
                is_teams_creation_enabled=False,
                timezone="UTC",
            )
        with schema_context(cls.schema_name):
            seed_rbac()
            cls.cat = Category.objects.first() or Category.objects.create(
                name=f"HistCat-{uuid4().hex[:6]}"
            )
            cls.course = Course.objects.create(
                title=f"History Course {uuid4().hex[:6]}",
                description="Course",
                code=f"HC-{uuid4().hex[:6]}",
                category=cls.cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )
            cls.admin = User.objects.create_user(
                email=f"admin-hist-{uuid4().hex[:6]}@hist.example",
                password="pw-test-123",
                phone_number="1",
                communication_email=f"admin-hist-{uuid4().hex[:6]}@hist.example",
                name="Admin",
                date_of_birth=date(1990, 1, 1),
                code=f"hist-admin-{uuid4().hex[:6]}",
                roles=[User.UserRole.ADMIN],
            )
            cls.student = User.objects.create_user(
                email=f"student-hist-{uuid4().hex[:6]}@hist.example",
                password="pw-test-123",
                phone_number="2",
                communication_email=f"student-hist-{uuid4().hex[:6]}@hist.example",
                name="Student",
                date_of_birth=date(1990, 1, 1),
                code=f"hist-student-{uuid4().hex[:6]}",
                roles=[User.UserRole.STUDENT],
            )
            cls.other_course = Course.objects.create(
                title=f"Other Course {uuid4().hex[:6]}",
                description="Other",
                code=f"OC-{uuid4().hex[:6]}",
                category=cls.cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )
            cls.course_teacher = User.objects.create_user(
                email=f"teacher-hist-{uuid4().hex[:6]}@hist.example",
                password="pw-test-123",
                phone_number="3",
                communication_email=f"teacher-hist-{uuid4().hex[:6]}@hist.example",
                name="Course Teacher",
                date_of_birth=date(1990, 1, 1),
                code=f"hist-teacher-{uuid4().hex[:6]}",
                roles=[User.UserRole.TEACHER],
            )
            cls.other_teacher = User.objects.create_user(
                email=f"other-teacher-{uuid4().hex[:6]}@hist.example",
                password="pw-test-123",
                phone_number="4",
                communication_email=f"other-teacher-{uuid4().hex[:6]}@hist.example",
                name="Other Teacher",
                date_of_birth=date(1990, 1, 1),
                code=f"hist-other-teacher-{uuid4().hex[:6]}",
                roles=[User.UserRole.TEACHER],
            )
            UserCourse.objects.bulk_create(
                [
                    UserCourse(
                        user=cls.course_teacher,
                        course=cls.course,
                        assigned_as=UserCourse.AssignedAs.TEACHER,
                    ),
                    UserCourse(
                        user=cls.other_teacher,
                        course=cls.other_course,
                        assigned_as=UserCourse.AssignedAs.TEACHER,
                    ),
                ]
            )

    def setUp(self):
        self.course = type(self).course
        self.admin = type(self).admin
        self.student = type(self).student

    def _client(self, user: User) -> APIClient:
        token = AccessToken.for_user(user)
        token[JWT_TENANT_SCHEMA_CLAIM] = self.schema_name
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_TENANT=self.schema_name,
        )
        return client

    def test_record_membership_event_persists_joined(self):
        with schema_context(self.schema_name):
            event = record_membership_event(
                course_id=self.course.id,
                user_id=self.student.id,
                event_type=CourseMembershipEvent.EventType.JOINED,
                actor_id=self.admin.id,
            )
            self.assertEqual(event.event_type, "joined")
            self.assertEqual(event.actor_id, self.admin.id)
            self.assertEqual(CourseMembershipEvent.objects.count(), 1)

    def test_record_membership_event_persists_source(self):
        with schema_context(self.schema_name):
            event = record_membership_event(
                course_id=self.course.id,
                user_id=self.student.id,
                event_type=CourseMembershipEvent.EventType.JOINED,
                actor_id=self.admin.id,
                source=CourseMembershipEvent.Source.TELEGRAM_BOT,
            )
            event.refresh_from_db()
            self.assertEqual(event.source, CourseMembershipEvent.Source.TELEGRAM_BOT)

    @patch("app_course.views.tenant_syncs_course_team_roster", return_value=False)
    def test_add_student_writes_joined_event(self, _mock_sync):
        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.post(
                f"/api/v1/courses/{self.course.id}/students",
                {"user_id": self.student.id},
                format="json",
            )
            self.assertEqual(resp.status_code, 200)
            self.assertTrue(
                CourseMembershipEvent.objects.filter(
                    course_id=self.course.id,
                    user_id=self.student.id,
                    event_type="joined",
                    actor_id=self.admin.id,
                ).exists()
            )

    @patch("app_course.views.tenant_syncs_course_team_roster", return_value=False)
    def test_remove_student_writes_removed_event(self, _mock_sync):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.delete(
                f"/api/v1/courses/{self.course.id}/students/{self.student.id}",
            )
            self.assertEqual(resp.status_code, 200)
            self.assertTrue(
                CourseMembershipEvent.objects.filter(
                    course_id=self.course.id,
                    user_id=self.student.id,
                    event_type="removed",
                    actor_id=self.admin.id,
                ).exists()
            )
            self.assertFalse(
                UserCourse.objects.filter(
                    course_id=self.course.id, user_id=self.student.id
                ).exists()
            )

    @patch("app_course.views.tenant_syncs_course_team_roster", return_value=False)
    def test_remove_student_preserves_user_events(self, _mock_sync):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            ev = Event.objects.create(
                title="Session 1",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(date(2026, 3, 1), datetime.min.time())
                ),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            UserEvent.objects.create(
                user=self.student,
                event=ev,
                attendance_status=UserEvent.AttendanceStatus.PRESENT,
            )
            self.assertEqual(
                UserEvent.objects.filter(
                    user_id=self.student.id, event__course_id=self.course.id
                ).count(),
                1,
            )

        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.delete(
                f"/api/v1/courses/{self.course.id}/students/{self.student.id}",
            )
            self.assertEqual(resp.status_code, 200)
            self.assertFalse(
                UserCourse.objects.filter(
                    course_id=self.course.id, user_id=self.student.id
                ).exists()
            )
            self.assertEqual(
                UserEvent.objects.filter(
                    user_id=self.student.id, event__course_id=self.course.id
                ).count(),
                1,
            )

    @patch("app_course.views.tenant_syncs_course_team_roster", return_value=False)
    def test_user_course_delete_student_preserves_user_events(self, _mock_sync):
        with schema_context(self.schema_name):
            uc = UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            ev = Event.objects.create(
                title="Session 2",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(date(2026, 3, 2), datetime.min.time())
                ),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            UserEvent.objects.create(
                user=self.student,
                event=ev,
                attendance_status=UserEvent.AttendanceStatus.LATE,
            )

        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.delete(f"/api/v1/user-courses/{uc.id}")
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(
                UserEvent.objects.filter(
                    user_id=self.student.id, event__course_id=self.course.id
                ).count(),
                1,
            )

    @patch("app_course.views.tenant_syncs_course_team_roster", return_value=False)
    def test_user_course_delete_teacher_soft_deletes_empty_preserves_checkins(self, _mock_sync):
        with schema_context(self.schema_name):
            uc = UserCourse.objects.get(
                user=self.course_teacher, course=self.course
            )
            ev_empty = Event.objects.create(
                title="Empty session",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(date(2026, 3, 3), datetime.min.time())
                ),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            ev_checkin = Event.objects.create(
                title="Checked-in session",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(date(2026, 3, 4), datetime.min.time())
                ),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            empty_ue = UserEvent.objects.create(
                user=self.course_teacher,
                event=ev_empty,
                attendance_status=UserEvent.AttendanceStatus.PRESENT,
            )
            checkin_ue = UserEvent.objects.create(
                user=self.course_teacher,
                event=ev_checkin,
                checkin_time=timezone.now(),
            )

        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.delete(f"/api/v1/user-courses/{uc.id}")
            self.assertEqual(resp.status_code, 200)
            self.assertFalse(UserEvent.objects.filter(pk=empty_ue.pk).exists())
            self.assertTrue(
                UserEvent.all_objects.filter(pk=empty_ue.pk, is_deleted=True).exists()
            )
            self.assertTrue(UserEvent.objects.filter(pk=checkin_ue.pk).exists())

    def test_student_cannot_view_membership_history(self):
        client = self._client(self.student)
        with schema_context(self.schema_name):
            resp = client.get(
                f"/api/v1/courses/{self.course.id}/students/membership-history"
            )
            self.assertEqual(resp.status_code, 403)

    def test_admin_can_view_membership_history(self):
        with schema_context(self.schema_name):
            record_membership_event(
                course_id=self.course.id,
                user_id=self.student.id,
                event_type=CourseMembershipEvent.EventType.JOINED,
                actor_id=self.admin.id,
            )
        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.get(
                f"/api/v1/courses/{self.course.id}/students/membership-history"
            )
            self.assertEqual(resp.status_code, 200)
            payload = resp.json()["data"]
            self.assertEqual(payload["count"], 1)
            self.assertEqual(payload["results"][0]["event_type"], "joined")
            self.assertEqual(payload["results"][0]["user"]["id"], self.student.id)

    def test_teacher_not_on_course_cannot_view_membership_history(self):
        client = self._client(self.other_teacher)
        with schema_context(self.schema_name):
            resp = client.get(
                f"/api/v1/courses/{self.course.id}/students/membership-history"
            )
            self.assertEqual(resp.status_code, 403)

    def test_course_teacher_can_view_membership_history(self):
        with schema_context(self.schema_name):
            record_membership_event(
                course_id=self.course.id,
                user_id=self.student.id,
                event_type=CourseMembershipEvent.EventType.JOINED,
                actor_id=self.course_teacher.id,
            )
        client = self._client(self.course_teacher)
        with schema_context(self.schema_name):
            resp = client.get(
                f"/api/v1/courses/{self.course.id}/students/membership-history"
            )
            self.assertEqual(resp.status_code, 200)

    @patch("app_course.join_request_approval.async_task")
    @patch("app_course.views.tenant_syncs_course_team_roster", return_value=False)
    def test_join_request_approval_writes_joined_event(self, _mock_sync, _mock_mail):
        with schema_context(self.schema_name):
            join_request = CourseJoinRequest.objects.create(
                course=self.course,
                user=self.student,
                status=CourseJoinRequest.Status.PENDING,
            )
        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.put(
                f"/api/v1/course-join-requests/{join_request.id}",
                {"status": "approved"},
                format="json",
            )
            self.assertEqual(resp.status_code, 200)
            self.assertTrue(
                CourseMembershipEvent.objects.filter(
                    course_id=self.course.id,
                    user_id=self.student.id,
                    event_type="joined",
                    actor_id=self.admin.id,
                ).exists()
            )

    @patch("app_course.join_request_approval.async_task")
    def test_join_request_approval_skips_duplicate_joined_event(self, _mock_mail):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            join_request = CourseJoinRequest.objects.create(
                course=self.course,
                user=self.student,
                status=CourseJoinRequest.Status.PENDING,
            )
        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.put(
                f"/api/v1/course-join-requests/{join_request.id}",
                {"status": "approved"},
                format="json",
            )
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(
                CourseMembershipEvent.objects.filter(
                    course_id=self.course.id,
                    user_id=self.student.id,
                    event_type="joined",
                ).count(),
                0,
            )

    @patch("app_course.views.tenant_syncs_course_team_roster", return_value=False)
    def test_bulk_roster_management_writes_events(self, _mock_sync):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            other_student = User.objects.create_user(
                email=f"student2-hist-{uuid4().hex[:6]}@hist.example",
                password="pw-test-123",
                phone_number="5",
                communication_email=f"student2-hist-{uuid4().hex[:6]}@hist.example",
                name="Student Two",
                date_of_birth=date(1990, 1, 1),
                code=f"hist-student2-{uuid4().hex[:6]}",
                roles=[User.UserRole.STUDENT],
            )
        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.post(
                "/api/v1/user-courses/management",
                [
                    {
                        "user": self.student.id,
                        "course": self.course.id,
                        "isRemoved": True,
                    },
                    {
                        "user": other_student.id,
                        "course": self.course.id,
                        "assigned_as": UserCourse.AssignedAs.STUDENT,
                    },
                ],
                format="json",
            )
            self.assertEqual(resp.status_code, 200)
            self.assertTrue(
                CourseMembershipEvent.objects.filter(
                    course_id=self.course.id,
                    user_id=self.student.id,
                    event_type="removed",
                ).exists()
            )
            self.assertTrue(
                CourseMembershipEvent.objects.filter(
                    course_id=self.course.id,
                    user_id=other_student.id,
                    event_type="joined",
                ).exists()
            )

    def test_analytics_removals_series_counts_membership_events(self):
        today = timezone.localdate()
        start = datetime.combine(today, datetime.min.time(), tzinfo=dt_timezone.utc)
        with schema_context(self.schema_name):
            record_membership_event(
                course_id=self.course.id,
                user_id=self.student.id,
                event_type=CourseMembershipEvent.EventType.REMOVED,
                occurred_at=start,
            )
            org = Organization.objects.get(schema_name=self.schema_name)
            series = build_time_series(today, today, org)
        day_row = next(row for row in series if row["date"] == today.isoformat())
        self.assertEqual(day_row["removals"], 1)

    def test_membership_history_can_re_enroll_removed_not_enrolled(self):
        with schema_context(self.schema_name):
            record_membership_event(
                course_id=self.course.id,
                user_id=self.student.id,
                event_type=CourseMembershipEvent.EventType.REMOVED,
                actor_id=self.admin.id,
            )
        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.get(
                f"/api/v1/courses/{self.course.id}/students/membership-history"
            )
            self.assertEqual(resp.status_code, 200)
            row = resp.json()["data"]["results"][0]
            self.assertEqual(row["event_type"], "removed")
            self.assertTrue(row["can_re_enroll"])

    def test_membership_history_can_re_enroll_false_when_still_enrolled(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            record_membership_event(
                course_id=self.course.id,
                user_id=self.student.id,
                event_type=CourseMembershipEvent.EventType.REMOVED,
                actor_id=self.admin.id,
            )
        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.get(
                f"/api/v1/courses/{self.course.id}/students/membership-history"
            )
            self.assertEqual(resp.status_code, 200)
            row = resp.json()["data"]["results"][0]
            self.assertEqual(row["event_type"], "removed")
            self.assertFalse(row["can_re_enroll"])

    def test_membership_history_joined_event_can_re_enroll_false(self):
        with schema_context(self.schema_name):
            record_membership_event(
                course_id=self.course.id,
                user_id=self.student.id,
                event_type=CourseMembershipEvent.EventType.JOINED,
                actor_id=self.admin.id,
            )
        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.get(
                f"/api/v1/courses/{self.course.id}/students/membership-history"
            )
            self.assertEqual(resp.status_code, 200)
            row = resp.json()["data"]["results"][0]
            self.assertEqual(row["event_type"], "joined")
            self.assertFalse(row["can_re_enroll"])

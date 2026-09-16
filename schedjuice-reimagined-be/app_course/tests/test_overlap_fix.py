"""Tests for overlapping session fix preview/apply."""

import unittest
from datetime import date, datetime, time, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_attendance.models import UserEvent
from app_auth.models import User
from app_course.models import AssignedAsRole, Category, Course, DailyNote, Event, Program, UserCourse
from app_course.overlap_fix_services import (
    apply_overlap_fix,
    build_overlap_fix_preview,
    merge_cluster_user_events_batch,
    _load_user_events_by_event,
)
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _aware(day: date, hour: int, minute: int = 0) -> datetime:
    return timezone.make_aware(datetime.combine(day, time(hour, minute)))


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class OverlapFixServicesTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.today = timezone.localdate()
        self.suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.org = Organization.objects.get(schema_name=self.schema_name)
            self.org.timezone = "UTC"
            self.org.save(update_fields=["timezone"])
            self.admin = User.objects.create_user(
                email=f"admin-of-{self.suffix}@example.com",
                password="pw",
                phone_number="1",
                communication_email=f"admin-of-{self.suffix}@example.com",
                name="Admin OF",
                date_of_birth=date(1990, 1, 1),
                code=f"admin-of-{self.suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.cat = Category.objects.create(name=f"Cat {self.suffix}")
            self.prog = Program.objects.create(
                name=f"P {self.suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.student_a = User.objects.create_user(
                email=f"stu-a-{self.suffix}@example.com",
                password="pw",
                phone_number="2",
                communication_email=f"stu-a-{self.suffix}@example.com",
                name="Student A",
                date_of_birth=date(2010, 1, 1),
                code=f"stu-a-{self.suffix}",
                roles=[User.UserRole.STUDENT],
            )
            self.student_b = User.objects.create_user(
                email=f"stu-b-{self.suffix}@example.com",
                password="pw",
                phone_number="3",
                communication_email=f"stu-b-{self.suffix}@example.com",
                name="Student B",
                date_of_birth=date(2010, 1, 1),
                code=f"stu-b-{self.suffix}",
                roles=[User.UserRole.STUDENT],
            )
        self._telegram_patch = patch("app_telegram.signals.dm_invite_link_to_teacher.delay")
        self._telegram_patch.start()

    def tearDown(self):
        self._telegram_patch.stop()
        super().tearDown()

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _create_course_with_overlaps(self):
        # Must be future: overlap clustering ignores past sessions (time_to < now).
        day = self.today + timedelta(days=2)
        course = Course.objects.create(
            title=f"Overlap {self.suffix}",
            category=self.cat,
            program=self.prog,
            start_date=self.today - timedelta(days=10),
            end_date=self.today + timedelta(days=10),
        )
        ev_a = Event.objects.create(
            title="A",
            course=course,
            date=_aware(day, 9),
            time_from=time(9, 0),
            time_to=time(10, 30),
        )
        ev_b = Event.objects.create(
            title="B",
            course=course,
            date=_aware(day, 9, 30),
            time_from=time(9, 30),
            time_to=time(11, 0),
        )
        ev_c = Event.objects.create(
            title="C",
            course=course,
            date=_aware(day, 10),
            time_from=time(10, 0),
            time_to=time(11, 0),
        )
        for student in (self.student_a, self.student_b):
            UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
        UserEvent.objects.create(
            user=self.student_a,
            event=ev_b,
            attendance_status=UserEvent.AttendanceStatus.PRESENT,
        )
        UserEvent.objects.create(
            user=self.student_b,
            event=ev_b,
            attendance_status=UserEvent.AttendanceStatus.PRESENT,
        )
        return course, ev_a, ev_b, ev_c, day

    def test_preview_picks_session_with_marked_attendance(self):
        with schema_context(self.schema_name):
            course, _ev_a, ev_b, _ev_c, _day = self._create_course_with_overlaps()
            preview = build_overlap_fix_preview(course, self.org)
            self.assertTrue(preview["has_overlaps"])
            self.assertEqual(len(preview["clusters"]), 1)
            self.assertEqual(preview["clusters"][0]["survivor"]["event_id"], ev_b.id)

    def test_apply_removes_duplicates_and_preserves_attendance(self):
        with schema_context(self.schema_name):
            course, ev_a, ev_b, ev_c, _day = self._create_course_with_overlaps()
            result = apply_overlap_fix(course, self.org)
            self.assertTrue(result["applied"])
            self.assertEqual(result["clusters_fixed"], 1)
            self.assertIn(ev_b.id, result["events_kept"])
            self.assertIn(ev_a.id, result["events_removed"])
            self.assertIn(ev_c.id, result["events_removed"])
            self.assertFalse(Event.objects.filter(id=ev_a.id).exists())
            self.assertFalse(Event.objects.filter(id=ev_c.id).exists())
            ue_a = UserEvent.objects.get(user=self.student_a, event_id=ev_b.id)
            self.assertEqual(ue_a.attendance_status, UserEvent.AttendanceStatus.PRESENT)

    def test_apply_idempotent(self):
        with schema_context(self.schema_name):
            course, *_ = self._create_course_with_overlaps()
            apply_overlap_fix(course, self.org)
            second = apply_overlap_fix(course, self.org)
            self.assertFalse(second["applied"])

    def test_checkin_copied_to_survivor(self):
        with schema_context(self.schema_name):
            course, ev_a, ev_b, _ev_c, day = self._create_course_with_overlaps()
            UserEvent.objects.filter(user=self.student_a, event=ev_b).delete()
            UserEvent.objects.create(
                user=self.student_a,
                event=ev_a,
                checkin_time=timezone.now(),
            )
            apply_overlap_fix(course, self.org)
            ue = UserEvent.objects.get(user=self.student_a, event_id=ev_b.id)
            self.assertIsNotNone(ue.checkin_time)

    def test_daily_note_moved_to_survivor(self):
        with schema_context(self.schema_name):
            course, ev_a, ev_b, _ev_c, _day = self._create_course_with_overlaps()
            DailyNote.objects.create(event=ev_a, note={"text": "hello"})
            apply_overlap_fix(course, self.org)
            self.assertTrue(DailyNote.objects.filter(event_id=ev_b.id).exists())
            self.assertFalse(DailyNote.objects.filter(event_id=ev_a.id).exists())

    def test_absent_with_leave_wins_over_unregistered_on_merge(self):
        with schema_context(self.schema_name):
            course, ev_a, ev_b, _ev_c, _day = self._create_course_with_overlaps()
            UserEvent.objects.update_or_create(
                user=self.student_a,
                event=ev_a,
                defaults={
                    "attendance_status": UserEvent.AttendanceStatus.UNREGISTERED
                },
            )
            UserEvent.objects.update_or_create(
                user=self.student_a,
                event=ev_b,
                defaults={
                    "attendance_status": UserEvent.AttendanceStatus.ABSENT_WITH_LEAVE
                },
            )
            apply_overlap_fix(course, self.org)
            ue = UserEvent.objects.get(user=self.student_a, event_id=ev_b.id)
            self.assertEqual(
                ue.attendance_status,
                UserEvent.AttendanceStatus.ABSENT_WITH_LEAVE,
            )

    def test_preview_and_apply_via_api(self):
        with schema_context(self.schema_name):
            course, *_ = self._create_course_with_overlaps()
            client = self._client(self.admin)
            preview = client.post(
                f"/api/v1/courses/{course.id}/data-health/fix-overlapping-events/preview",
                {},
                format="json",
            )
            self.assertEqual(preview.status_code, 200)
            self.assertTrue(preview.data["data"]["has_overlaps"])
            apply_resp = client.post(
                f"/api/v1/courses/{course.id}/data-health/fix-overlapping-events/apply",
                {},
                format="json",
            )
            self.assertEqual(apply_resp.status_code, 200)
            self.assertTrue(apply_resp.data["data"]["applied"])

    def test_teacher_without_course_access_forbidden(self):
        with schema_context(self.schema_name):
            course, *_ = self._create_course_with_overlaps()
            teacher = User.objects.create_user(
                email=f"teacher-of-{self.suffix}@example.com",
                password="pw",
                phone_number="9",
                communication_email=f"teacher-of-{self.suffix}@example.com",
                name="Teacher OF",
                date_of_birth=date(1990, 1, 1),
                code=f"teacher-of-{self.suffix}",
                roles=[User.UserRole.TEACHER],
            )
            client = self._client(teacher)

        with self.settings(RBAC_ENFORCE="enforce"):
            preview = client.post(
                f"/api/v1/courses/{course.id}/data-health/fix-overlapping-events/preview",
                {},
                format="json",
            )
            apply_resp = client.post(
                f"/api/v1/courses/{course.id}/data-health/fix-overlapping-events/apply",
                {},
                format="json",
            )
        self.assertEqual(preview.status_code, 403)
        self.assertEqual(apply_resp.status_code, 403)

    def test_merge_cluster_user_events_batch_query_budget(self):
        with schema_context(self.schema_name):
            day = self.today + timedelta(days=2)
            course = Course.objects.create(
                title=f"Batch {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=10),
                end_date=self.today + timedelta(days=10),
            )
            ev_a = Event.objects.create(
                title="A",
                course=course,
                date=_aware(day, 9),
                time_from=time(9, 0),
                time_to=time(10, 30),
            )
            ev_b = Event.objects.create(
                title="B",
                course=course,
                date=_aware(day, 9, 30),
                time_from=time(9, 30),
                time_to=time(11, 0),
            )
            for idx, student in enumerate(
                [self.student_a, self.student_b], start=1
            ):
                UserCourse.objects.get_or_create(
                    user=student,
                    course=course,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                )
                UserEvent.objects.create(
                    user=student,
                    event=ev_b,
                    attendance_status=UserEvent.AttendanceStatus.PRESENT,
                )
            ue_map = _load_user_events_by_event([ev_a.id, ev_b.id])
            with CaptureQueriesContext(connection) as ctx:
                merged = merge_cluster_user_events_batch([ev_a, ev_b], ev_a, ue_map)
            self.assertEqual(merged, 2)
            self.assertLessEqual(len(ctx.captured_queries), 3)

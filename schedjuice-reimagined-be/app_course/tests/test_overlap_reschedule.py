"""Tests for overlapping session reschedule (Fix) preview/apply."""

import unittest
from datetime import date, datetime, time, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_attendance.models import UserEvent
from app_auth.models import User
from app_course.models import Category, Course, Event, Program, UserCourse
from app_course.overlap_reschedule_services import (
    apply_overlap_reschedule,
    build_overlap_reschedule_preview,
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
class OverlapRescheduleServicesTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.today = timezone.localdate()
        self.future_day = self.today + timedelta(days=2)
        self.suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.org = Organization.objects.get(schema_name=self.schema_name)
            self.org.timezone = "UTC"
            self.org.save(update_fields=["timezone"])
            self.admin = User.objects.create_user(
                email=f"admin-rs-{self.suffix}@example.com",
                password="pw",
                phone_number="1",
                communication_email=f"admin-rs-{self.suffix}@example.com",
                name="Admin RS",
                date_of_birth=date(1990, 1, 1),
                code=f"admin-rs-{self.suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.cat = Category.objects.create(name=f"Cat RS {self.suffix}")
            self.prog = Program.objects.create(
                name=f"P RS {self.suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.student = User.objects.create_user(
                email=f"stu-rs-{self.suffix}@example.com",
                password="pw",
                phone_number="2",
                communication_email=f"stu-rs-{self.suffix}@example.com",
                name="Student RS",
                date_of_birth=date(2010, 1, 1),
                code=f"stu-rs-{self.suffix}",
                roles=[User.UserRole.STUDENT],
            )
        self._telegram_patch = patch(
            "app_telegram.signals.dm_invite_link_to_teacher.delay"
        )
        self._telegram_patch.start()

    def tearDown(self):
        self._telegram_patch.stop()
        super().tearDown()

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _create_future_overlap_pair(self):
        course = Course.objects.create(
            title=f"Reschedule {self.suffix}",
            category=self.cat,
            program=self.prog,
            start_date=self.today - timedelta(days=10),
            end_date=self.today + timedelta(days=30),
        )
        day = self.future_day
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
        UserCourse.objects.create(
            user=self.student,
            course=course,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        ue = UserEvent.objects.create(
            user=self.student,
            event=ev_b,
            attendance_status=UserEvent.AttendanceStatus.PRESENT,
        )
        return course, ev_a, ev_b, ue

    def test_preview_lists_future_clusters(self):
        with schema_context(self.schema_name):
            course, ev_a, ev_b, _ue = self._create_future_overlap_pair()
            preview = build_overlap_reschedule_preview(course, self.org)
            self.assertTrue(preview["has_overlaps"])
            self.assertEqual(preview["summary"]["clusters_count"], 1)
            ids = {e["id"] for e in preview["clusters"][0]["events"]}
            self.assertEqual(ids, {ev_a.id, ev_b.id})

    def test_apply_reschedule_updates_times_keeps_user_events(self):
        with schema_context(self.schema_name):
            course, ev_a, ev_b, ue = self._create_future_overlap_pair()
            # Move only B away from A so both can keep distinct slots.
            result = apply_overlap_reschedule(
                course,
                self.org,
                event_ids=[ev_b.id],
                time_from=time(14, 0),
                time_to=time(15, 0),
            )
            self.assertTrue(result["applied"])
            ev_a.refresh_from_db()
            ev_b.refresh_from_db()
            self.assertEqual(ev_a.time_from, time(9, 0))
            self.assertEqual(ev_b.time_from, time(14, 0))
            self.assertEqual(ev_b.time_to, time(15, 0))
            ue.refresh_from_db()
            self.assertEqual(ue.event_id, ev_b.id)
            self.assertEqual(ue.attendance_status, UserEvent.AttendanceStatus.PRESENT)
            preview = build_overlap_reschedule_preview(course, self.org)
            self.assertFalse(preview["has_overlaps"])

    def test_apply_reschedule_rejects_invalid_range(self):
        with schema_context(self.schema_name):
            course, _ev_a, ev_b, ue = self._create_future_overlap_pair()
            with self.assertRaises(ValidationError):
                apply_overlap_reschedule(
                    course,
                    self.org,
                    event_ids=[ev_b.id],
                    time_from=time(10, 0),
                    time_to=time(10, 0),
                )
            ev_b.refresh_from_db()
            self.assertEqual(ev_b.time_from, time(9, 30))
            ue.refresh_from_db()
            self.assertEqual(ue.attendance_status, UserEvent.AttendanceStatus.PRESENT)

    def test_apply_reschedule_allows_overnight_when_no_conflict(self):
        with schema_context(self.schema_name):
            course, _ev_a, ev_b, ue = self._create_future_overlap_pair()
            apply_overlap_reschedule(
                course,
                self.org,
                event_ids=[ev_b.id],
                time_from=time(22, 30),
                time_to=time(0, 0),
            )
            ev_b.refresh_from_db()
            self.assertEqual(ev_b.time_from, time(22, 30))
            self.assertEqual(ev_b.time_to, time(0, 0))
            ue.refresh_from_db()
            self.assertEqual(ue.event_id, ev_b.id)

    def test_apply_reschedule_rejects_when_still_overlapping(self):
        with schema_context(self.schema_name):
            course, ev_a, ev_b, _ue = self._create_future_overlap_pair()
            with self.assertRaises(ValidationError) as ctx:
                apply_overlap_reschedule(
                    course,
                    self.org,
                    event_ids=[ev_a.id, ev_b.id],
                    time_from=time(10, 0),
                    time_to=time(11, 0),
                )
            self.assertIn("conflicts", ctx.exception.detail)
            ev_a.refresh_from_db()
            ev_b.refresh_from_db()
            self.assertEqual(ev_a.time_from, time(9, 0))
            self.assertEqual(ev_b.time_from, time(9, 30))

    def test_apply_reschedule_multi_day_same_clock_times(self):
        with schema_context(self.schema_name):
            course = Course.objects.create(
                title=f"Multi {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=10),
                end_date=self.today + timedelta(days=30),
            )
            day1 = self.future_day
            day2 = self.future_day + timedelta(days=1)
            ev1 = Event.objects.create(
                title="D1",
                course=course,
                date=_aware(day1, 9),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            ev1b = Event.objects.create(
                title="D1b",
                course=course,
                date=_aware(day1, 9, 30),
                time_from=time(9, 30),
                time_to=time(10, 30),
            )
            ev2 = Event.objects.create(
                title="D2",
                course=course,
                date=_aware(day2, 9),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            ev2b = Event.objects.create(
                title="D2b",
                course=course,
                date=_aware(day2, 9, 30),
                time_from=time(9, 30),
                time_to=time(10, 30),
            )
            # Reschedule the "b" conflicts on each day to the same afternoon slot.
            result = apply_overlap_reschedule(
                course,
                self.org,
                event_ids=[ev1b.id, ev2b.id],
                time_from="14:00:00",
                time_to="15:00:00",
            )
            self.assertTrue(result["applied"])
            ev1b.refresh_from_db()
            ev2b.refresh_from_db()
            self.assertEqual(ev1b.time_from, time(14, 0))
            self.assertEqual(ev2b.time_from, time(14, 0))
            self.assertEqual(ev1.time_from, time(9, 0))
            self.assertEqual(ev2.time_from, time(9, 0))

    def test_reschedule_apply_api(self):
        with schema_context(self.schema_name):
            course, _ev_a, ev_b, _ue = self._create_future_overlap_pair()
            client = self._client(self.admin)
            response = client.post(
                f"/api/v1/courses/{course.id}/data-health/reschedule-overlapping-events/apply",
                {
                    "event_ids": [ev_b.id],
                    "time_from": "14:00:00",
                    "time_to": "15:00:00",
                },
                format="json",
            )
            self.assertEqual(response.status_code, 200, response.content)
            ev_b.refresh_from_db()
            self.assertEqual(ev_b.time_from, time(14, 0))

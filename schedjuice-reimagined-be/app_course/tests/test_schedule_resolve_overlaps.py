"""Tests for calendar schedule overlap resolve."""

import unittest
from datetime import date, datetime, time, timedelta, timezone as dt_timezone
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_attendance.models import UserEvent
from app_auth.models import User
from app_course.models import Category, Course, Event, Program, UserCourse
from app_course.program_helpers import get_default_program
from app_course.schedule_resolve_services import (
    build_simulated_schedule_events,
    resolve_schedule_overlaps,
)
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
class ScheduleResolveOverlapsTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=cls.schema_name).update(timezone="UTC")

    def setUp(self):
        self.suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.org = Organization.objects.get(schema_name=self.schema_name)
            self.admin = User.objects.create_user(
                email=f"admin-sro-{self.suffix}@example.com",
                password="pw",
                phone_number="1",
                communication_email=f"admin-sro-{self.suffix}@example.com",
                name="Admin SRO",
                date_of_birth=date(1990, 1, 1),
                code=f"admin-sro-{self.suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.student = User.objects.create_user(
                email=f"stu-sro-{self.suffix}@example.com",
                password="pw",
                phone_number="2",
                communication_email=f"stu-sro-{self.suffix}@example.com",
                name="Student SRO",
                date_of_birth=date(2010, 1, 1),
                code=f"stu-sro-{self.suffix}",
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.first() or Category.objects.create(name=f"Cat-{self.suffix}")
            self.course = Course.objects.create(
                title=f"SRO Course {self.suffix}",
                description="d",
                code=f"SRO-{self.suffix}",
                category=cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            # Must be future: overlap clustering ignores past sessions.
            future_day = timezone.localdate() + timedelta(days=2)
            self.session_date = datetime(
                future_day.year,
                future_day.month,
                future_day.day,
                0,
                0,
                tzinfo=dt_timezone.utc,
            )
            self.session_local_date = future_day.isoformat()

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_build_simulated_schedule_excludes_deleted_persisted(self):
        with schema_context(self.schema_name):
            ev = Event.objects.create(
                title="Old",
                date=self.session_date,
                time_from=time(9, 0),
                time_to=time(10, 0),
                course=self.course,
            )
            draft = [
                {"id": ev.id, "is_deleted": True},
                {
                    "id": "new-b",
                    "title": "New",
                    "date": self.session_date.isoformat(),
                    "time_from": "09:30:00",
                    "time_to": "11:00:00",
                },
            ]
            simulated = build_simulated_schedule_events(
                course_id=self.course.id,
                draft_events=draft,
            )
            persisted_ids = {event.id for event in simulated if event.id}
            self.assertNotIn(ev.id, persisted_ids)
            self.assertEqual(len(simulated), 1)

    def test_resolve_auto_global_all_draft_client_deletes_only(self):
        with schema_context(self.schema_name):
            draft = [
                {
                    "id": "new-a",
                    "title": "A",
                    "date": self.session_date.isoformat(),
                    "time_from": "09:00:00",
                    "time_to": "10:30:00",
                },
                {
                    "id": "new-b",
                    "title": "B",
                    "date": self.session_date.isoformat(),
                    "time_from": "09:30:00",
                    "time_to": "11:00:00",
                },
            ]
            result = resolve_schedule_overlaps(
                course=self.course,
                org=self.org,
                mode="auto_global",
                draft_events=draft,
            )
            self.assertEqual(result["client_deletes"], ["new-b"])
            self.assertEqual(result["applied"]["events_removed"], [])
            self.assertEqual(Event.objects.filter(course=self.course).count(), 0)

    def test_resolve_auto_global_persisted_cluster_merges(self):
        with schema_context(self.schema_name):
            ev_a = Event.objects.create(
                title="A",
                date=self.session_date,
                time_from=time(9, 0),
                time_to=time(10, 30),
                course=self.course,
            )
            ev_b = Event.objects.create(
                title="B",
                date=self.session_date,
                time_from=time(9, 30),
                time_to=time(11, 0),
                course=self.course,
            )
            UserEvent.objects.create(
                user=self.student,
                event=ev_b,
                attendance_status=UserEvent.AttendanceStatus.PRESENT,
            )
            draft = [
                {
                    "id": ev_a.id,
                    "title": ev_a.title,
                    "date": ev_a.date.isoformat(),
                    "time_from": "09:00:00",
                    "time_to": "10:30:00",
                },
                {
                    "id": ev_b.id,
                    "title": ev_b.title,
                    "date": ev_b.date.isoformat(),
                    "time_from": "09:30:00",
                    "time_to": "11:00:00",
                },
            ]
            result = resolve_schedule_overlaps(
                course=self.course,
                org=self.org,
                mode="auto_global",
                draft_events=draft,
            )
            self.assertIn(ev_b.id, result["applied"]["events_kept"])
            self.assertIn(ev_a.id, result["applied"]["events_removed"])
            self.assertFalse(Event.objects.filter(id=ev_a.id).exists())
            ue = UserEvent.objects.get(user=self.student, event_id=ev_b.id)
            self.assertEqual(ue.attendance_status, UserEvent.AttendanceStatus.PRESENT)

    def test_resolve_pin_survivor_deferred_merge(self):
        with schema_context(self.schema_name):
            ev_old = Event.objects.create(
                title="Old",
                date=self.session_date,
                time_from=time(9, 0),
                time_to=time(10, 30),
                course=self.course,
            )
            UserEvent.objects.create(
                user=self.student,
                event=ev_old,
                checkin_time=timezone.now(),
            )
            draft = [
                {
                    "id": ev_old.id,
                    "title": ev_old.title,
                    "date": ev_old.date.isoformat(),
                    "time_from": "09:00:00",
                    "time_to": "10:30:00",
                },
                {
                    "id": "new-survivor",
                    "title": "New",
                    "date": self.session_date.isoformat(),
                    "time_from": "09:30:00",
                    "time_to": "11:00:00",
                },
            ]
            result = resolve_schedule_overlaps(
                course=self.course,
                org=self.org,
                mode="pin_survivor",
                draft_events=draft,
                pin={
                    "survivor": {"draft_id": "new-survivor"},
                    "local_date": self.session_local_date,
                    "remove_event_ids": [ev_old.id],
                    "remove_draft_ids": [],
                },
            )
            self.assertEqual(len(result["deferred_merges"]), 1)
            self.assertEqual(
                result["deferred_merges"][0]["source_event_ids"],
                [ev_old.id],
            )
            self.assertTrue(Event.objects.filter(id=ev_old.id).exists())

    def test_resolve_overlaps_api_auto_global(self):
        with schema_context(self.schema_name):
            draft = [
                {
                    "id": "new-a",
                    "title": "A",
                    "date": self.session_date.isoformat(),
                    "time_from": "09:00:00",
                    "time_to": "10:30:00",
                },
                {
                    "id": "new-b",
                    "title": "B",
                    "date": self.session_date.isoformat(),
                    "time_from": "09:30:00",
                    "time_to": "11:00:00",
                },
            ]
            client = self._client(self.admin)
            resp = client.post(
                f"/api/v1/courses/{self.course.id}/schedule/resolve-overlaps",
                {"mode": "auto_global", "draft_events": draft},
                format="json",
            )
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.data["data"]["client_deletes"], ["new-b"])

    def test_edit_events_overlap_merges_draft_survivor(self):
        with schema_context(self.schema_name):
            ev_old = Event.objects.create(
                title="Old",
                date=self.session_date,
                time_from=time(9, 0),
                time_to=time(10, 30),
                course=self.course,
            )
            UserEvent.objects.create(
                user=self.student,
                event=ev_old,
                checkin_time=timezone.now(),
            )
            payload = {
                "overlap_merges": [
                    {
                        "survivor_draft_id": "new-survivor",
                        "source_event_ids": [ev_old.id],
                    }
                ],
                "course": {"id": self.course.id, "title": self.course.title},
                "events": [
                    {"id": ev_old.id, "is_deleted": True},
                    {
                        "id": "new-survivor",
                        "title": "New session",
                        "date": self.session_date.isoformat(),
                        "time_from": "09:30:00",
                        "time_to": "11:00:00",
                        "course": self.course.id,
                    },
                ],
            }
            client = self._client(self.admin)
            resp = client.post(
                f"/api/v1/courses/{self.course.id}/edit-events",
                payload,
                format="json",
            )
            self.assertEqual(resp.status_code, 200)
            self.assertFalse(Event.objects.filter(id=ev_old.id).exists())
            new_event = Event.objects.get(course=self.course, time_from=time(9, 30))
            ue = UserEvent.objects.get(user=self.student, event=new_event)
            self.assertIsNotNone(ue.checkin_time)

"""Tests for CourseEventEditView."""

import unittest
from datetime import date, datetime, time, timezone as dt_timezone
from unittest import mock
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_attendance.models import UserEvent
from app_auth.models import User
from app_course.models import Category, Course, Event, UserCourse
from app_course.program_helpers import get_default_program
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
class CourseEventEditViewTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpClass(cls):
        cls._telegram_invite_patch = mock.patch(
            "app_telegram.signals.dm_invite_link_to_teacher.delay"
        )
        cls._telegram_remove_patch = mock.patch(
            "app_telegram.signals.remove_telegram_member.delay"
        )
        cls._telegram_invite_patch.start()
        cls._telegram_remove_patch.start()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        cls._telegram_remove_patch.stop()
        cls._telegram_invite_patch.stop()
        super().tearDownClass()

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=cls.schema_name).update(
                is_microsoft_on=False,
                is_teams_creation_enabled=False,
                timezone="UTC",
            )

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"admin-cee-{suffix}@example.com",
                password="pw",
                phone_number="1",
                communication_email=f"admin-cee-{suffix}@example.com",
                name="Admin CEE",
                date_of_birth=date(1990, 1, 1),
                code=f"admin-cee-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"teacher-cee-{suffix}@example.com",
                password="pw",
                phone_number="2",
                communication_email=f"teacher-cee-{suffix}@example.com",
                name="Teacher CEE",
                date_of_birth=date(1990, 1, 1),
                code=f"teacher-cee-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            cat = Category.objects.first() or Category.objects.create(name=f"Cat-{suffix}")
            self.course = Course.objects.create(
                title=f"CEE Course {suffix}",
                description="d",
                code=f"CEE-{suffix}",
                category=cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            session_date = datetime(2026, 7, 6, 9, 0, tzinfo=dt_timezone.utc)
            self.event = Event.objects.create(
                title="Session",
                date=session_date,
                time_from=time(9, 0),
                time_to=time(10, 0),
                course=self.course,
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _edit_events_payload(self, *, delete_event_id: int) -> dict:
        return {
            "course": {
                "id": self.course.id,
                "title": self.course.title,
            },
            "events": [{"id": delete_event_id, "is_deleted": True}],
        }

    def test_delete_event_blocked_when_checkin_exists(self):
        with schema_context(self.schema_name):
            UserEvent.objects.create(
                user=self.teacher,
                event=self.event,
                checkin_time=timezone.now(),
            )

        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.post(
                f"/api/v1/courses/{self.course.id}/edit-events",
                self._edit_events_payload(delete_event_id=self.event.id),
                format="json",
            )
            self.assertEqual(resp.status_code, 400)
            self.assertIn(
                "Cannot delete sessions that have check-in records",
                resp.data["details"]["message"],
            )
            self.assertEqual(
                resp.data["details"]["event_ids"],
                [self.event.id],
            )
            self.assertTrue(Event.objects.filter(id=self.event.id).exists())

    def test_checkin_guard_blocks_before_create_writes(self):
        """Create + delete-with-checkin must not leave a new event or course title change."""
        with schema_context(self.schema_name):
            UserEvent.objects.create(
                user=self.teacher,
                event=self.event,
                checkin_time=timezone.now(),
            )
            event_count_before = Event.objects.filter(course=self.course).count()
            title_before = self.course.title

        client = self._client(self.admin)
        payload = {
            "course": {
                "id": self.course.id,
                "title": "ShouldNotPersist",
            },
            "events": [
                {
                    "id": "new-1",
                    "title": "New Session",
                    "date": datetime(2026, 8, 1, 9, 0, tzinfo=dt_timezone.utc).isoformat(),
                    "time_from": "09:00:00",
                    "time_to": "10:00:00",
                    "course": self.course.id,
                },
                {"id": self.event.id, "is_deleted": True},
            ],
            "overlap_merges": [],
        }
        with schema_context(self.schema_name):
            resp = client.post(
                f"/api/v1/courses/{self.course.id}/edit-events",
                payload,
                format="json",
            )
            self.assertEqual(resp.status_code, 400, resp.content)
            self.course.refresh_from_db()
            self.assertEqual(self.course.title, title_before)
            self.assertEqual(
                Event.objects.filter(course=self.course).count(),
                event_count_before,
            )
            self.assertTrue(Event.objects.filter(id=self.event.id).exists())

    def _base_payload(self) -> dict:
        return {
            "course": {
                "id": self.course.id,
                "title": self.course.title,
            },
            "events": [],
        }

    def test_create_overlapping_event_rejected(self):
        client = self._client(self.admin)
        payload = self._base_payload()
        payload["events"] = [
            {
                "id": "new-1",
                "title": "Overlap",
                "date": self.event.date.isoformat(),
                "time_from": "09:30:00",
                "time_to": "11:00:00",
                "course": self.course.id,
            }
        ]
        with schema_context(self.schema_name):
            resp = client.post(
                f"/api/v1/courses/{self.course.id}/edit-events",
                payload,
                format="json",
            )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("conflicts", resp.data["details"])

    def test_update_event_to_overlap_rejected(self):
        with schema_context(self.schema_name):
            second = Event.objects.create(
                title="Later",
                date=self.event.date,
                time_from=time(11, 0),
                time_to=time(12, 0),
                course=self.course,
            )
        client = self._client(self.admin)
        payload = self._base_payload()
        payload["events"] = [
            {
                "id": second.id,
                "is_edit": True,
                "title": second.title,
                "date": second.date.isoformat(),
                "time_from": "09:30:00",
                "time_to": "11:00:00",
            }
        ]
        with schema_context(self.schema_name):
            resp = client.post(
                f"/api/v1/courses/{self.course.id}/edit-events",
                payload,
                format="json",
            )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("conflicts", resp.data["details"])

    def test_delete_one_of_three_overlapping_allowed(self):
        with schema_context(self.schema_name):
            middle = Event.objects.create(
                title="Middle",
                date=self.event.date,
                time_from=time(9, 30),
                time_to=time(10, 30),
                course=self.course,
            )
            third = Event.objects.create(
                title="Third",
                date=self.event.date,
                time_from=time(10, 0),
                time_to=time(11, 0),
                course=self.course,
            )
        client = self._client(self.admin)
        payload = self._base_payload()
        payload["events"] = [{"id": middle.id, "is_deleted": True}]
        with schema_context(self.schema_name):
            resp = client.post(
                f"/api/v1/courses/{self.course.id}/edit-events",
                payload,
                format="json",
            )
            self.assertEqual(resp.status_code, 200)
            self.assertFalse(Event.objects.filter(id=middle.id).exists())
            self.assertTrue(Event.objects.filter(id=self.event.id).exists())
            self.assertTrue(Event.objects.filter(id=third.id).exists())

    def test_full_payload_delete_one_session_persists(self):
        """FE posts the full event list with one row flagged is_deleted."""
        with schema_context(self.schema_name):
            keep = Event.objects.create(
                title="Keep",
                date=datetime(2026, 7, 24, 9, 30, tzinfo=dt_timezone.utc),
                time_from=time(9, 30),
                time_to=time(11, 0),
                course=self.course,
            )
            delete_me = Event.objects.create(
                title="Delete me",
                date=datetime(2026, 7, 24, 10, 30, tzinfo=dt_timezone.utc),
                time_from=time(10, 30),
                time_to=time(12, 0),
                course=self.course,
            )

        client = self._client(self.admin)
        payload = self._base_payload()
        payload["events"] = [
            {
                "id": keep.id,
                "title": keep.title,
                "date": keep.date.isoformat(),
                "time_from": keep.time_from.isoformat(),
                "time_to": keep.time_to.isoformat(),
            },
            {
                "id": delete_me.id,
                "title": delete_me.title,
                "date": delete_me.date.isoformat(),
                "time_from": delete_me.time_from.isoformat(),
                "time_to": delete_me.time_to.isoformat(),
                "is_deleted": True,
            },
        ]
        with schema_context(self.schema_name):
            resp = client.post(
                f"/api/v1/courses/{self.course.id}/edit-events",
                payload,
                format="json",
            )
            self.assertEqual(resp.status_code, 200, resp.content)
            self.assertFalse(Event.objects.filter(id=delete_me.id).exists())
            self.assertTrue(Event.objects.filter(id=keep.id).exists())
            self.assertTrue(Event.objects.filter(id=self.event.id).exists())

    def test_edit_events_allows_schedule_save_without_exam_when_org_flag_on(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_exam_board_in_course_enabled=True
            )

        client = self._client(self.admin)
        payload = self._base_payload()
        payload["events"] = [
            {
                "id": self.event.id,
                "is_edit": True,
                "title": "Updated Session",
                "date": self.event.date.isoformat(),
                "time_from": "09:00:00",
                "time_to": "10:30:00",
            }
        ]
        with schema_context(self.schema_name):
            resp = client.post(
                f"/api/v1/courses/{self.course.id}/edit-events",
                payload,
                format="json",
            )
            self.assertEqual(resp.status_code, 200, resp.content)
            self.event.refresh_from_db()
            self.assertEqual(self.event.title, "Updated Session")

    def test_edit_events_event_validation_returns_400(self):
        client = self._client(self.admin)
        payload = self._base_payload()
        payload["events"] = [
            {
                "id": "new-1",
                "course": self.course.id,
            }
        ]
        with schema_context(self.schema_name):
            resp = client.post(
                f"/api/v1/courses/{self.course.id}/edit-events",
                payload,
                format="json",
            )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertTrue(resp.data["isError"])

    def test_teacher_cannot_delete_course(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            client = self._client(self.teacher)
            with schema_context(self.schema_name):
                resp = client.delete(f"/api/v1/courses/{self.course.id}")
                self.assertEqual(resp.status_code, 403, resp.content)
                self.assertTrue(Course.objects.filter(id=self.course.id).exists())

    def test_admin_can_delete_course(self):
        with schema_context(self.schema_name):
            cat = Category.objects.first()
            doomed = Course.objects.create(
                title="Doomed Course",
                description="d",
                code=f"DEL-{uuid4().hex[:6]}",
                category=cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )
            doomed_id = doomed.id

        with self.settings(RBAC_ENFORCE="enforce"):
            client = self._client(self.admin)
            with schema_context(self.schema_name):
                resp = client.delete(f"/api/v1/courses/{doomed_id}")
                self.assertEqual(resp.status_code, 200, resp.content)
                self.assertFalse(Course.objects.filter(id=doomed_id).exists())

"""Tests for Event.has_checkin annotation on list/search."""

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
class EventHasCheckinAnnotationTests(TestCase):
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
                email=f"admin-hck-{suffix}@example.com",
                password="pw",
                phone_number="1",
                communication_email=f"admin-hck-{suffix}@example.com",
                name="Admin HCK",
                date_of_birth=date(1990, 1, 1),
                code=f"admin-hck-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"teacher-hck-{suffix}@example.com",
                password="pw",
                phone_number="2",
                communication_email=f"teacher-hck-{suffix}@example.com",
                name="Teacher HCK",
                date_of_birth=date(1990, 1, 1),
                code=f"teacher-hck-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            cat = Category.objects.first() or Category.objects.create(name=f"Cat-{suffix}")
            self.course = Course.objects.create(
                title=f"HCK Course {suffix}",
                description="d",
                code=f"HCK-{suffix}",
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
            self.event_checked_in = Event.objects.create(
                title="Checked in",
                date=session_date,
                time_from=time(9, 0),
                time_to=time(10, 0),
                course=self.course,
            )
            self.event_absent = Event.objects.create(
                title="Absent",
                date=session_date,
                time_from=time(11, 0),
                time_to=time(12, 0),
                course=self.course,
            )
            UserEvent.objects.create(
                user=self.teacher,
                event=self.event_checked_in,
                checkin_time=timezone.now(),
            )
            UserEvent.objects.create(
                user=self.teacher,
                event=self.event_absent,
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_event_search_has_checkin_contract(self):
        client = self._client(self.admin)
        payload = {
            "filter_params": [
                {
                    "field_name": "course_id",
                    "operator": "exact",
                    "value": self.course.id,
                }
            ],
            "size": -1,
        }
        with schema_context(self.schema_name):
            resp = client.post("/api/v1/events/search", payload, format="json")
        self.assertEqual(resp.status_code, 200, resp.content)
        rows = {row["id"]: row for row in resp.data["data"]}
        self.assertTrue(rows[self.event_checked_in.id]["has_checkin"])
        self.assertFalse(rows[self.event_absent.id]["has_checkin"])

    def test_overlap_merge_preserves_checkin_past_guard(self):
        """Replacing a checked-in session via overlap_merges is allowed (not plain delete)."""
        with schema_context(self.schema_name):
            ev_old = self.event_checked_in
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
                        "title": "Replacement",
                        "date": ev_old.date.isoformat(),
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
            self.assertEqual(resp.status_code, 200, resp.content)
            self.assertFalse(Event.objects.filter(id=ev_old.id).exists())
            new_event = Event.objects.get(course=self.course, time_from=time(9, 30))
            ue = UserEvent.objects.get(user=self.teacher, event=new_event)
            self.assertIsNotNone(ue.checkin_time)

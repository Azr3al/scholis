"""Tests for event-centric class-starting-soon push cron."""

from __future__ import annotations

import unittest
from datetime import datetime, time, timezone
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import AssignedAsRole, Category, Course, Event, UserCourse
from app_course.program_helpers import get_default_program
from app_organization.models import Organization
from app_utility_notifications.class_starting_soon_cron import (
    send_class_starting_soon_reminder_pushes,
)
from app_utility_notifications.utility_notification_helpers import (
    class_starting_soon_push_rows_for_membership,
    class_starting_soon_push_targets_by_user,
    events_in_class_starting_soon_window,
)
from app_utility_notifications.utility_notification_kinds import UtilityNotificationKind

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

class EventsInClassStartingSoonWindowTest(SimpleTestCase):
    def test_filters_by_15_to_60_minute_window(self):
        now = datetime(2026, 5, 29, 9, 30, tzinfo=timezone.utc)
        in_window = SimpleNamespace(
            id=1,
            course_id=10,
            date="2026-05-29",
            time_from="10:00",
            time_to="11:00",
            course=SimpleNamespace(title="Algebra", meeting_link=None),
        )
        too_soon = SimpleNamespace(
            id=2,
            course_id=11,
            date="2026-05-29",
            time_from="09:40",
            time_to="10:40",
            course=SimpleNamespace(title="Biology", meeting_link=None),
        )
        too_far = SimpleNamespace(
            id=3,
            course_id=12,
            date="2026-05-29",
            time_from="11:00",
            time_to="12:00",
            course=SimpleNamespace(title="Chemistry", meeting_link=None),
        )

        with patch(
            "app_utility_notifications.utility_notification_helpers._events_on_ymd",
            return_value=[in_window, too_soon, too_far],
        ):
            matched = events_in_class_starting_soon_window(
                now=now,
                tenant_tz="UTC",
            )

        self.assertEqual([ev.id for ev in matched], [1])

class ClassStartingSoonPushRowsForMembershipTest(SimpleTestCase):
    def test_student_and_teacher_routes_differ(self):
        now = datetime(2026, 5, 29, 9, 30, tzinfo=timezone.utc)
        event = SimpleNamespace(
            id=7,
            course_id=3,
            date="2026-05-29",
            time_from="10:00",
            time_to="11:00",
            course=SimpleNamespace(title="Algebra", meeting_link=None),
        )

        student_rows = class_starting_soon_push_rows_for_membership(
            event,
            assigned_as="student",
            now=now,
            tenant_tz="UTC",
        )
        teacher_rows = class_starting_soon_push_rows_for_membership(
            event,
            assigned_as="teacher",
            now=now,
            tenant_tz="UTC",
        )

        self.assertEqual(len(student_rows), 1)
        self.assertEqual(len(teacher_rows), 1)
        self.assertEqual(student_rows[0]["route"], "/class/course/[id]")
        self.assertEqual(teacher_rows[0]["route"], "/shortcuts/todays-classes")
        self.assertEqual(
            student_rows[0]["kind"],
            UtilityNotificationKind.CLASS_STARTING_SOON.value,
        )

@unittest.skipUnless(
    _database_reachable(),
    "PostgreSQL not available (set DATABASE_URL, e.g. local Docker on 127.0.0.1:55432)",
)
class ClassStartingSoonCronDbTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        Organization.objects.filter(schema_name=cls.schema_name).update(timezone="UTC")

    def _create_course_with_event(
        self,
        *,
        event_date: datetime,
        time_from: time = time(10, 0),
        time_to: time = time(11, 0),
    ) -> Course:
        category = Category.objects.first()
        course = Course.objects.create(
            title=f"Class soon {uuid4()}",
            code=f"CS-{uuid4().hex[:8]}",
            category=category,
            program=get_default_program(),
            start_date="2024-01-01",
            end_date="2026-12-31",
        )
        Event.objects.create(
            title="Session",
            date=event_date,
            time_from=time_from,
            time_to=time_to,
            course=course,
        )
        return course

    def test_targets_only_enrolled_active_users_in_window(self):
        now = datetime(2026, 5, 29, 9, 30, tzinfo=timezone.utc)
        with schema_context(self.schema_name):
            student = User.objects.filter(
                roles__contains=[User.UserRole.STUDENT],
                is_active=True,
            ).first()
            inactive = User.objects.filter(
                roles__contains=[User.UserRole.STUDENT],
                is_active=True,
            ).exclude(id=student.id).first()
            self.assertIsNotNone(student)
            self.assertIsNotNone(inactive)

            in_window_course = self._create_course_with_event(
                event_date=datetime(2026, 5, 29, 10, 0, tzinfo=timezone.utc),
            )
            out_of_window_course = self._create_course_with_event(
                event_date=datetime(2026, 5, 29, 12, 0, tzinfo=timezone.utc),
                time_from=time(12, 0),
                time_to=time(13, 0),
            )

            UserCourse.objects.create(
                user=student,
                course=in_window_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=inactive,
                course=in_window_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=student,
                course=out_of_window_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            inactive.is_active = False
            inactive.save(update_fields=["is_active"])

            targets = class_starting_soon_push_targets_by_user(
                now=now,
                tenant_tz="UTC",
            )

        self.assertEqual(len(targets), 1)
        user, rows = targets[0]
        self.assertEqual(user.id, student.id)
        in_window_rows = [
            row for row in rows if row["params"]["courseId"] == in_window_course.id
        ]
        self.assertEqual(len(in_window_rows), 1)
        self.assertEqual(
            in_window_rows[0]["kind"],
            UtilityNotificationKind.CLASS_STARTING_SOON.value,
        )
        self.assertFalse(
            any(row["params"]["courseId"] == out_of_window_course.id for row in rows)
        )

    @patch("utilitas.async_tasks.async_task")
    def test_teacher_on_roster_gets_shortcut_route(self, _mock_async_task):
        now = datetime(2026, 5, 29, 9, 30, tzinfo=timezone.utc)
        with schema_context(self.schema_name):
            teacher = User.objects.filter(
                roles__contains=[User.UserRole.TEACHER],
                is_active=True,
            ).first()
            self.assertIsNotNone(teacher)
            main_role, _ = AssignedAsRole.objects.get_or_create(
                name="Main Teacher (class soon cron test)",
                defaults={"seniority": AssignedAsRole.Seniority.MAIN_TEACHER},
            )
            course = self._create_course_with_event(
                event_date=datetime(2026, 5, 29, 10, 0, tzinfo=timezone.utc),
            )
            UserCourse.objects.create(
                user=teacher,
                course=course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=main_role,
            )
            targets = class_starting_soon_push_targets_by_user(
                now=now,
                tenant_tz="UTC",
            )

        self.assertEqual(len(targets), 1)
        _user, rows = targets[0]
        course_rows = [row for row in rows if row["params"]["courseId"] == course.id]
        self.assertEqual(len(course_rows), 1)
        self.assertEqual(course_rows[0]["route"], "/shortcuts/todays-classes")

    @patch(
        "app_utility_notifications.class_starting_soon_cron.send_utility_pushes_for_user_rows"
    )
    @patch(
        "app_utility_notifications.utility_notification_helpers.utility_notifications_for_user"
    )
    def test_does_not_scan_full_user_catalog(
        self,
        mock_catalog,
        mock_send_rows,
    ):
        mock_send_rows.return_value = (0, 0)
        now = datetime(2026, 5, 29, 9, 30, tzinfo=timezone.utc)

        with schema_context(self.schema_name):
            send_class_starting_soon_reminder_pushes(
                now=now,
                tenant_tz="UTC",
            )

        mock_catalog.assert_not_called()
        mock_send_rows.assert_called_once()

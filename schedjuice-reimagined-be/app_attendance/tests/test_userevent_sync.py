import unittest
from datetime import date, datetime, time, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_attendance.models import UserEvent
from app_attendance.userevent_sync import ensure_teacher_userevents_for_events
from app_auth.models import User
from app_course.intake_services import _generate_recurring_events
from app_course.models import Category, Course, Event, Program, UserCourse
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class EnsureTeacherUserEventsTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.today = timezone.localdate()
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name), patch(
            "app_telegram.signals.dm_invite_link_to_teacher.delay"
        ), patch("app_telegram.signals.remove_telegram_member.delay"):
            seed_rbac()
            self.teacher = User.objects.create_user(
                email=f"sync-tch-{suffix}@example.com",
                password="x",
                name="Sync Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.cat = Category.objects.create(name=f"Cat {suffix}")
            self.prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"Sync Course {suffix}",
                code=f"SYNC-{suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            self.event = Event.objects.create(
                title="S1",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(self.today, time(9, 0)), timezone.utc
                ),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )

    def test_creates_missing_userevent_for_teacher(self):
        with schema_context(self.schema_name):
            created = ensure_teacher_userevents_for_events(
                course_id=self.course.id,
                event_ids=[self.event.id],
            )
            self.assertEqual(created, 1)
            self.assertTrue(
                UserEvent.objects.filter(
                    user=self.teacher, event=self.event
                ).exists()
            )

    def test_idempotent_second_call_creates_zero(self):
        with schema_context(self.schema_name):
            ensure_teacher_userevents_for_events(
                course_id=self.course.id,
                event_ids=[self.event.id],
            )
            created = ensure_teacher_userevents_for_events(
                course_id=self.course.id,
                event_ids=[self.event.id],
            )
            self.assertEqual(created, 0)
            self.assertEqual(
                UserEvent.objects.filter(
                    event=self.event, user=self.teacher
                ).count(),
                1,
            )

    def test_generate_recurring_events_creates_teacher_userevents(self):
        slots = [{"weekday": "Mon", "time_from": "09:00", "time_to": "10:00"}]
        with schema_context(self.schema_name):
            self.course.start_date = self.today - timedelta(days=7)
            self.course.end_date = self.today
            self.course.save(update_fields=["start_date", "end_date"])
            Event.objects.filter(course=self.course).delete()
            UserEvent.all_objects.filter(event__course=self.course).delete()

            _generate_recurring_events(self.course, slots)

            events = Event.objects.filter(course=self.course)
            self.assertGreater(events.count(), 0)
            self.assertEqual(
                UserEvent.objects.filter(
                    user=self.teacher,
                    event__course=self.course,
                ).count(),
                events.count(),
            )

import unittest
from datetime import date, datetime, time, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_attendance.marking_services import (
    build_marking_roster,
    resolve_preferred_event_id,
)
from app_attendance.models import UserEvent
from app_auth.models import User
from app_course.models import Category, Course, Event, Program, UserCourse
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

class ResolvePreferredEventIdTests(TestCase):
    def _event(self, pk: int, d: date, tf=time(9, 0), tt=time(10, 0)):
        return Event(
            id=pk,
            date=timezone.make_aware(datetime.combine(d, tf)),
            time_from=tf,
            time_to=tt,
        )

    def test_returns_today_when_session_exists(self):
        today = date(2026, 4, 9)
        events = [
            self._event(1, date(2026, 4, 8)),
            self._event(2, today),
            self._event(3, date(2026, 4, 10)),
        ]
        tenant = type("T", (), {"timezone": "UTC"})()
        result = resolve_preferred_event_id(events, tenant, today=today)
        self.assertEqual(result, 2)

    def test_returns_closest_past_when_no_today_session(self):
        today = date(2026, 4, 9)
        events = [
            self._event(1, date(2026, 4, 1)),
            self._event(2, date(2026, 4, 8)),
            self._event(3, date(2026, 4, 15)),
        ]
        tenant = type("T", (), {"timezone": "UTC"})()
        result = resolve_preferred_event_id(events, tenant, today=today)
        self.assertEqual(result, 2)

    def test_returns_last_when_all_future(self):
        today = date(2026, 4, 1)
        events = [
            self._event(1, date(2026, 4, 8)),
            self._event(2, date(2026, 4, 15)),
        ]
        tenant = type("T", (), {"timezone": "UTC"})()
        result = resolve_preferred_event_id(events, tenant, today=today)
        self.assertEqual(result, 2)

    def test_empty_events_returns_none(self):
        tenant = type("T", (), {"timezone": "UTC"})()
        self.assertIsNone(
            resolve_preferred_event_id([], tenant, today=date(2026, 4, 9))
        )

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class BuildMarkingRosterTests(TestCase):
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
                email=f"tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.students = []
            for i in range(3):
                self.students.append(
                    User.objects.create_user(
                        email=f"stu-{suffix}-{i}@example.com",
                        password="x",
                        name=f"Student {i}",
                        phone_number=f"0{i}",
                        date_of_birth=date(2010, 1, 1),
                        roles=[User.UserRole.STUDENT],
                    )
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
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            for student in self.students:
                UserCourse.objects.create(
                    user=student,
                    course=self.course,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                )
            UserCourse.objects.filter(
                user=self.students[0],
                course=self.course,
            ).delete()
            ev_date = timezone.make_aware(
                datetime.combine(self.today, datetime.min.time())
            )
            self.event = Event.objects.create(
                title="Session",
                course=self.course,
                date=ev_date,
                time_from=datetime.strptime("09:00", "%H:%M").time(),
                time_to=datetime.strptime("10:00", "%H:%M").time(),
            )

    def test_creates_missing_userevents_for_enrolled_students(self):
        with schema_context(self.schema_name):
            UserEvent.objects.filter(event_id=self.event.id).delete()
            roster = build_marking_roster(self.event.id)
        self.assertEqual(len(roster), 2)
        with schema_context(self.schema_name):
            self.assertEqual(
                UserEvent.objects.filter(event_id=self.event.id).count(), 2
            )

    def test_idempotent_on_second_call(self):
        with schema_context(self.schema_name):
            build_marking_roster(self.event.id)
            before = UserEvent.objects.filter(event_id=self.event.id).count()
            roster = build_marking_roster(self.event.id)
        self.assertEqual(len(roster), before)

    def test_query_count_bounded(self):
        with schema_context(self.schema_name):
            UserEvent.objects.filter(event_id=self.event.id).delete()
            with CaptureQueriesContext(connection) as ctx:
                build_marking_roster(self.event.id)
        self.assertLessEqual(len(ctx), 10)

    def test_excludes_removed_student_with_preserved_userevents(self):
        """Removed students must not appear on roster; UserEvent history stays in DB."""
        removed_student = self.students[0]
        with schema_context(self.schema_name), patch(
            "app_telegram.signals.dm_invite_link_to_teacher.delay"
        ), patch("app_telegram.signals.remove_telegram_member.delay"):
            UserCourse.objects.create(
                user=removed_student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserEvent.objects.filter(event_id=self.event.id).delete()
            first_roster = build_marking_roster(self.event.id)
            self.assertEqual(len(first_roster), 3)
            self.assertEqual(
                UserEvent.objects.filter(event_id=self.event.id).count(), 3
            )

            UserCourse.objects.filter(
                user=removed_student,
                course=self.course,
            ).delete()
            roster_after_removal = build_marking_roster(self.event.id)

        self.assertEqual(len(roster_after_removal), 2)
        removed_ids = {row["user"]["id"] for row in roster_after_removal}
        self.assertNotIn(removed_student.id, removed_ids)
        with schema_context(self.schema_name):
            self.assertEqual(
                UserEvent.objects.filter(event_id=self.event.id).count(), 3
            )

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class AttendanceMarkingEndpointTests(TestCase):
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
                email=f"tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.other_teacher = User.objects.create_user(
                email=f"oth-{suffix}@example.com",
                password="x",
                name="Other Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"stu-{suffix}@example.com",
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
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            UserCourse.objects.create(
                user=self.other_teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            ev_date = timezone.make_aware(
                datetime.combine(self.today, datetime.min.time())
            )
            self.event = Event.objects.create(
                title="Session",
                course=self.course,
                date=ev_date,
                time_from=datetime.strptime("09:00", "%H:%M").time(),
                time_to=datetime.strptime("10:00", "%H:%M").time(),
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_roster_matches_bootstrap_roster(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            bootstrap = self._client(self.teacher).get(
                f"/api/v1/courses/{self.course.id}/attendance-marking"
            ).json()["data"]
            roster = self._client(self.teacher).get(
                f"/api/v1/attendances/marking-roster/{self.event.id}"
            ).json()["data"]
        self.assertEqual(roster["event_id"], self.event.id)
        self.assertEqual(roster["roster"], bootstrap["roster"])

    def test_unassigned_teacher_forbidden_on_bootstrap(self):
        with schema_context(self.schema_name):
            UserCourse.objects.filter(
                user=self.other_teacher, course=self.course
            ).delete()
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.other_teacher).get(
                f"/api/v1/courses/{self.course.id}/attendance-marking"
            )
        self.assertEqual(resp.status_code, 403)

    def test_bootstrap_excludes_substitution_reserve_events(self):
        with schema_context(self.schema_name):
            reserve_event = Event.objects.create(
                title="Reserve",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(self.today + timedelta(days=1), datetime.min.time())
                ),
                time_from=datetime.strptime("11:00", "%H:%M").time(),
                time_to=datetime.strptime("12:00", "%H:%M").time(),
                is_substitution_reserve=True,
            )
        with self.settings(RBAC_ENFORCE="enforce"):
            bootstrap = self._client(self.teacher).get(
                f"/api/v1/courses/{self.course.id}/attendance-marking"
            ).json()["data"]
        event_ids = {row["id"] for row in bootstrap["events"]}
        self.assertIn(self.event.id, event_ids)
        self.assertNotIn(reserve_event.id, event_ids)


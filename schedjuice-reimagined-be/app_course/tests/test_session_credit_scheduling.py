import unittest
from datetime import date, datetime, time, timezone as dt_timezone
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.models import Category, Course, Event, Program
from app_course.serializers import CourseSerializer, ProgramSerializer
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
class SessionCreditSchedulingTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=cls.schema_name).update(
                timezone="UTC"
            )

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"admin-sc-{suffix}@example.com",
                password="pw",
                phone_number="1",
                communication_email=f"admin-sc-{suffix}@example.com",
                name="Admin SC",
                date_of_birth=date(1990, 1, 1),
                code=f"admin-sc-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"teacher-sc-{suffix}@example.com",
                password="pw",
                phone_number="2",
                communication_email=f"teacher-sc-{suffix}@example.com",
                name="Teacher SC",
                date_of_birth=date(1990, 1, 1),
                code=f"teacher-sc-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.program = Program.objects.create(
                name=f"SC Manual {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
            )
            self.intake_program = Program.objects.create(
                name=f"SC Intake {suffix}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _course(self, **kwargs):
        cat = Category.objects.first() or Category.objects.create(name="SC-cat")
        defaults = dict(
            title=f"SC {uuid4().hex[:6]}",
            description="d",
            category=cat,
            program=self.program,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 31),
        )
        defaults.update(kwargs)
        return Course.objects.create(**defaults)

    def test_credit_plus_intake_based_is_400(self):
        with schema_context(self.schema_name):
            ser = ProgramSerializer(
                instance=self.intake_program,
                data={"is_session_credit_scheduling": True},
                partial=True,
            )
            self.assertFalse(ser.is_valid())
            self.assertIn("is_session_credit_scheduling", ser.errors)

    def test_credit_plus_manual_is_valid(self):
        with schema_context(self.schema_name):
            ser = ProgramSerializer(
                instance=self.program,
                data={
                    "is_session_credit_scheduling": True,
                    "default_max_sessions": 8,
                },
                partial=True,
            )
            self.assertTrue(ser.is_valid(), ser.errors)

    def test_default_max_sessions_rejects_zero_and_366(self):
        with schema_context(self.schema_name):
            for value in (0, 366):
                ser = ProgramSerializer(
                    instance=self.program,
                    data={"default_max_sessions": value},
                    partial=True,
                )
                self.assertFalse(ser.is_valid())
                self.assertIn("default_max_sessions", ser.errors)

    def test_switching_credit_program_to_intake_based_is_400(self):
        with schema_context(self.schema_name):
            self.program.is_session_credit_scheduling = True
            self.program.save(update_fields=["is_session_credit_scheduling"])
            ser = ProgramSerializer(
                instance=self.program,
                data={
                    "course_creation_method": Program.CourseCreationMethod.INTAKE_BASED
                },
                partial=True,
            )
            self.assertFalse(ser.is_valid())
            self.assertIn("is_session_credit_scheduling", ser.errors)

    def test_teacher_cannot_patch_program_credit_fields(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            client = self._client(self.teacher)
            with schema_context(self.schema_name):
                resp = client.patch(
                    f"/api/v1/programs/{self.program.id}",
                    {"is_session_credit_scheduling": True},
                    format="json",
                )
        self.assertEqual(resp.status_code, 403)

    def test_credit_create_requires_max_sessions(self):
        with schema_context(self.schema_name):
            self.program.is_session_credit_scheduling = True
            self.program.save(update_fields=["is_session_credit_scheduling"])
            cat = Category.objects.first() or Category.objects.create(name="c")
            ser = CourseSerializer(
                data={
                    "title": f"Need max {uuid4().hex[:6]}",
                    "description": "desc",
                    "category": cat.id,
                    "program": self.program.id,
                    "start_date": "2026-08-03",
                    "end_date": "2026-08-24",
                }
            )
            self.assertFalse(ser.is_valid())
            self.assertIn("max_sessions", ser.errors)

    def test_weekly_create_clears_max_sessions(self):
        with schema_context(self.schema_name):
            cat = Category.objects.first() or Category.objects.create(name="c")
            ser = CourseSerializer(
                data={
                    "title": f"Weekly {uuid4().hex[:6]}",
                    "description": "desc",
                    "category": cat.id,
                    "program": self.program.id,
                    "start_date": "2026-08-03",
                    "end_date": "2026-08-24",
                    "max_sessions": 8,
                }
            )
            self.assertTrue(ser.is_valid(), ser.errors)
            self.assertIsNone(ser.validated_data.get("max_sessions"))

    def test_patch_max_below_event_count_is_400(self):
        with schema_context(self.schema_name):
            self.program.is_session_credit_scheduling = True
            self.program.save(update_fields=["is_session_credit_scheduling"])
            course = self._course(max_sessions=8)
            Event.objects.create(
                title="S",
                date=datetime(2026, 8, 3, 12, 0, tzinfo=dt_timezone.utc),
                time_from=time(19, 0),
                time_to=time(20, 30),
                course=course,
            )
            Event.objects.create(
                title="S2",
                date=datetime(2026, 8, 4, 12, 0, tzinfo=dt_timezone.utc),
                time_from=time(19, 0),
                time_to=time(20, 30),
                course=course,
            )
            ser = CourseSerializer(
                instance=course, data={"max_sessions": 1}, partial=True
            )
            self.assertFalse(ser.is_valid())
            self.assertIn("max_sessions", ser.errors)

    def test_patch_max_below_count_allowed_when_events_pending(self):
        with schema_context(self.schema_name):
            self.program.is_session_credit_scheduling = True
            self.program.save(update_fields=["is_session_credit_scheduling"])
            course = self._course(max_sessions=8)
            Event.objects.create(
                title="S",
                date=datetime(2026, 8, 3, 12, 0, tzinfo=dt_timezone.utc),
                time_from=time(19, 0),
                time_to=time(20, 30),
                course=course,
            )
            ser = CourseSerializer(
                instance=course,
                data={"max_sessions": 0},
                partial=True,
                context={"session_credit_events_pending": True},
            )
            self.assertTrue(ser.is_valid(), ser.errors)

    def test_flag_on_seeds_null_caps_from_event_count(self):
        with schema_context(self.schema_name):
            empty = self._course(max_sessions=None)
            two = self._course(max_sessions=None)
            Event.objects.create(
                title="A",
                date=datetime(2026, 8, 3, 12, 0, tzinfo=dt_timezone.utc),
                time_from=time(19, 0),
                time_to=time(20, 30),
                course=two,
            )
            Event.objects.create(
                title="B",
                date=datetime(2026, 8, 5, 12, 0, tzinfo=dt_timezone.utc),
                time_from=time(19, 0),
                time_to=time(20, 30),
                course=two,
            )
            kept = self._course(max_sessions=12)
            ser = ProgramSerializer(
                instance=self.program,
                data={"is_session_credit_scheduling": True},
                partial=True,
            )
            self.assertTrue(ser.is_valid(), ser.errors)
            ser.save()
            empty.refresh_from_db()
            two.refresh_from_db()
            kept.refresh_from_db()
            self.assertEqual(empty.max_sessions, 0)
            self.assertEqual(two.max_sessions, 2)
            self.assertEqual(kept.max_sessions, 12)

    def test_changing_default_max_does_not_rewrite_courses(self):
        with schema_context(self.schema_name):
            self.program.is_session_credit_scheduling = True
            self.program.save(update_fields=["is_session_credit_scheduling"])
            course = self._course(max_sessions=8)
            ser = ProgramSerializer(
                instance=self.program,
                data={"default_max_sessions": 10},
                partial=True,
            )
            self.assertTrue(ser.is_valid(), ser.errors)
            ser.save()
            course.refresh_from_db()
            self.assertEqual(course.max_sessions, 8)

    def _enable_credit(self, course, max_sessions=8):
        self.program.is_session_credit_scheduling = True
        self.program.save(update_fields=["is_session_credit_scheduling"])
        course.max_sessions = max_sessions
        course.save(update_fields=["max_sessions"])

    def _enable_multi_per_day(self):
        self.program.is_session_credit_scheduling = True
        self.program.allow_multiple_sessions_per_day = True
        self.program.save(
            update_fields=[
                "is_session_credit_scheduling",
                "allow_multiple_sessions_per_day",
            ]
        )

    def test_edit_events_rejects_over_max(self):
        with schema_context(self.schema_name):
            course = self._course(max_sessions=1)
            self._enable_credit(course, max_sessions=1)
            existing = Event.objects.create(
                title="Keep",
                date=datetime(2026, 8, 3, 12, 0, tzinfo=dt_timezone.utc),
                time_from=time(19, 0),
                time_to=time(20, 30),
                course=course,
            )
        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.post(
                f"/api/v1/courses/{course.id}/edit-events",
                {
                    "course": {
                        "id": course.id,
                        "title": course.title,
                        "max_sessions": 1,
                    },
                    "events": [
                        {
                            "id": "new1",
                            "title": course.title,
                            "date": datetime(
                                2026, 8, 10, 12, 0, tzinfo=dt_timezone.utc
                            ).isoformat(),
                            "time_from": "19:00:00",
                            "time_to": "20:30:00",
                            "course": course.id,
                        },
                    ],
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 400)
        with schema_context(self.schema_name):
            self.assertTrue(Event.objects.filter(id=existing.id).exists())

    def test_edit_events_allows_fewer_than_max(self):
        with schema_context(self.schema_name):
            course = self._course(max_sessions=8)
            self._enable_credit(course, 8)
            keep = Event.objects.create(
                title="Keep",
                date=datetime(2026, 8, 3, 12, 0, tzinfo=dt_timezone.utc),
                time_from=time(19, 0),
                time_to=time(20, 30),
                course=course,
            )
            drop = Event.objects.create(
                title="Drop",
                date=datetime(2026, 8, 10, 12, 0, tzinfo=dt_timezone.utc),
                time_from=time(19, 0),
                time_to=time(20, 30),
                course=course,
            )
        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.post(
                f"/api/v1/courses/{course.id}/edit-events",
                {
                    "course": {
                        "id": course.id,
                        "title": course.title,
                        "max_sessions": 8,
                    },
                    "events": [{"id": drop.id, "is_deleted": True}],
                },
                format="json",
            )
            self.assertEqual(resp.status_code, 200, resp.content)
            self.assertFalse(Event.objects.filter(id=drop.id).exists())
            self.assertTrue(Event.objects.filter(id=keep.id).exists())
            course.refresh_from_db()
            self.assertEqual(course.start_date, date(2026, 8, 3))
            self.assertGreater(course.end_date, course.start_date)

    def test_edit_events_rejects_duplicate_dates(self):
        with schema_context(self.schema_name):
            course = self._course(max_sessions=8)
            self._enable_credit(course, 8)
        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.post(
                f"/api/v1/courses/{course.id}/edit-events",
                {
                    "course": {
                        "id": course.id,
                        "title": course.title,
                        "max_sessions": 8,
                    },
                    "events": [
                        {
                            "id": "new1",
                            "title": course.title,
                            "date": datetime(
                                2026, 8, 3, 12, 0, tzinfo=dt_timezone.utc
                            ).isoformat(),
                            "time_from": "19:00:00",
                            "time_to": "20:30:00",
                            "course": course.id,
                        },
                        {
                            "id": "new2",
                            "title": course.title,
                            "date": datetime(
                                2026, 8, 3, 13, 0, tzinfo=dt_timezone.utc
                            ).isoformat(),
                            "time_from": "09:00:00",
                            "time_to": "10:00:00",
                            "course": course.id,
                        },
                    ],
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 400)

    def test_edit_events_allows_duplicate_dates_when_program_allows(self):
        with schema_context(self.schema_name):
            course = self._course(max_sessions=2)
            self._enable_multi_per_day()
            course.max_sessions = 2
            course.save(update_fields=["max_sessions"])
        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.post(
                f"/api/v1/courses/{course.id}/edit-events",
                {
                    "course": {
                        "id": course.id,
                        "title": course.title,
                        "max_sessions": 2,
                    },
                    "events": [
                        {
                            "id": "new1",
                            "title": course.title,
                            "date": datetime(
                                2026, 8, 3, 12, 0, tzinfo=dt_timezone.utc
                            ).isoformat(),
                            "time_from": "09:00:00",
                            "time_to": "10:00:00",
                            "course": course.id,
                        },
                        {
                            "id": "new2",
                            "title": course.title,
                            "date": datetime(
                                2026, 8, 3, 12, 0, tzinfo=dt_timezone.utc
                            ).isoformat(),
                            "time_from": "19:00:00",
                            "time_to": "20:30:00",
                            "course": course.id,
                        },
                    ],
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        with schema_context(self.schema_name):
            self.assertEqual(Event.objects.filter(course=course).count(), 2)

    def test_edit_events_still_rejects_overlapping_same_day_when_multi_allowed(
        self,
    ):
        with schema_context(self.schema_name):
            course = self._course(max_sessions=2)
            self._enable_multi_per_day()
            course.max_sessions = 2
            course.save(update_fields=["max_sessions"])
        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.post(
                f"/api/v1/courses/{course.id}/edit-events",
                {
                    "course": {
                        "id": course.id,
                        "title": course.title,
                        "max_sessions": 2,
                    },
                    "events": [
                        {
                            "id": "new1",
                            "title": course.title,
                            "date": datetime(
                                2026, 8, 3, 12, 0, tzinfo=dt_timezone.utc
                            ).isoformat(),
                            "time_from": "09:00:00",
                            "time_to": "10:30:00",
                            "course": course.id,
                        },
                        {
                            "id": "new2",
                            "title": course.title,
                            "date": datetime(
                                2026, 8, 3, 12, 0, tzinfo=dt_timezone.utc
                            ).isoformat(),
                            "time_from": "10:00:00",
                            "time_to": "11:00:00",
                            "course": course.id,
                        },
                    ],
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 400)
        body = resp.json()
        details = body.get("details") or body
        self.assertTrue(
            "overlap" in str(details).lower()
            or "same day" in str(details).lower()
        )

    def test_turning_off_session_credit_clears_allow_multiple_sessions_per_day(
        self,
    ):
        with schema_context(self.schema_name):
            self.program.is_session_credit_scheduling = True
            self.program.allow_multiple_sessions_per_day = True
            self.program.save(
                update_fields=[
                    "is_session_credit_scheduling",
                    "allow_multiple_sessions_per_day",
                ]
            )
            ser = ProgramSerializer(
                instance=self.program,
                data={"is_session_credit_scheduling": False},
                partial=True,
            )
            self.assertTrue(ser.is_valid(), ser.errors)
            program = ser.save()
            self.assertFalse(program.allow_multiple_sessions_per_day)

    def test_edit_events_empty_keeps_dates(self):
        with schema_context(self.schema_name):
            course = self._course(
                max_sessions=8,
                start_date=date(2026, 8, 1),
                end_date=date(2026, 8, 31),
            )
            self._enable_credit(course, 8)
            ev = Event.objects.create(
                title="Only",
                date=datetime(2026, 8, 10, 12, 0, tzinfo=dt_timezone.utc),
                time_from=time(19, 0),
                time_to=time(20, 30),
                course=course,
            )
        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.post(
                f"/api/v1/courses/{course.id}/edit-events",
                {
                    "course": {
                        "id": course.id,
                        "title": course.title,
                        "max_sessions": 8,
                    },
                    "events": [{"id": ev.id, "is_deleted": True}],
                },
                format="json",
            )
            self.assertEqual(resp.status_code, 200, resp.content)
            course.refresh_from_db()
            self.assertEqual(course.start_date, date(2026, 8, 1))
            self.assertEqual(course.end_date, date(2026, 8, 31))

    def test_edit_events_raise_max_and_add_same_request(self):
        with schema_context(self.schema_name):
            course = self._course(max_sessions=1)
            self._enable_credit(course, 1)
            existing = Event.objects.create(
                title="Keep",
                date=datetime(2026, 8, 3, 12, 0, tzinfo=dt_timezone.utc),
                time_from=time(19, 0),
                time_to=time(20, 30),
                course=course,
            )
        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.post(
                f"/api/v1/courses/{course.id}/edit-events",
                {
                    "course": {
                        "id": course.id,
                        "title": course.title,
                        "max_sessions": 2,
                    },
                    "events": [
                        {
                            "id": "new1",
                            "title": course.title,
                            "date": datetime(
                                2026, 8, 10, 12, 0, tzinfo=dt_timezone.utc
                            ).isoformat(),
                            "time_from": "19:00:00",
                            "time_to": "20:30:00",
                            "course": course.id,
                        },
                    ],
                },
                format="json",
            )
            self.assertEqual(resp.status_code, 200, resp.content)
            course.refresh_from_db()
            self.assertEqual(course.max_sessions, 2)
            self.assertEqual(Event.objects.filter(course=course).count(), 2)
            self.assertEqual(course.start_date, date(2026, 8, 3))
            self.assertEqual(course.end_date, date(2026, 8, 10))
            self.assertTrue(Event.objects.filter(id=existing.id).exists())

    def test_substitution_reserve_cap_defaults_to_zero(self):
        with schema_context(self.schema_name):
            from app_course.session_credit_services import substitution_reserve_cap

            self.assertEqual(substitution_reserve_cap(self.program), 0)

    def test_validate_teaching_and_reserve_within_program_cap(self):
        with schema_context(self.schema_name):
            from app_course.session_credit_services import (
                validate_session_credit_simulated_events,
            )

            self.program.is_session_credit_scheduling = True
            self.program.is_substitution_reserve_enabled = True
            self.program.default_substitution_reserve_days = 2
            self.program.save(
                update_fields=[
                    "is_session_credit_scheduling",
                    "is_substitution_reserve_enabled",
                    "default_substitution_reserve_days",
                ]
            )
            events = []
            for day in range(3, 11):
                events.append(
                    Event(
                        title="T",
                        date=datetime(2026, 8, day, 12, 0, tzinfo=dt_timezone.utc),
                        time_from=time(19, 0),
                        time_to=time(20, 30),
                        course_id=1,
                    )
                )
            for day in (11, 12):
                events.append(
                    Event(
                        title="R",
                        date=datetime(2026, 8, day, 12, 0, tzinfo=dt_timezone.utc),
                        time_from=time(19, 0),
                        time_to=time(20, 30),
                        course_id=1,
                        is_substitution_reserve=True,
                    )
                )
            validate_session_credit_simulated_events(
                events, 8, program=self.program
            )

    def test_validate_rejects_reserve_when_program_cap_zero(self):
        with schema_context(self.schema_name):
            from app_course.session_credit_services import (
                validate_session_credit_simulated_events,
            )

            self.program.is_session_credit_scheduling = True
            self.program.save(update_fields=["is_session_credit_scheduling"])
            events = [
                Event(
                    title="R",
                    date=datetime(2026, 8, 11, 12, 0, tzinfo=dt_timezone.utc),
                    time_from=time(19, 0),
                    time_to=time(20, 30),
                    course_id=1,
                    is_substitution_reserve=True,
                ),
            ]
            with self.assertRaises(ValidationError) as ctx:
                validate_session_credit_simulated_events(
                    events, 8, program=self.program
                )
            self.assertIn("events", ctx.exception.detail)

    def test_validate_rejects_reserve_above_program_cap(self):
        with schema_context(self.schema_name):
            from app_course.session_credit_services import (
                validate_session_credit_simulated_events,
            )

            self.program.is_session_credit_scheduling = True
            self.program.is_substitution_reserve_enabled = True
            self.program.default_substitution_reserve_days = 1
            self.program.save(
                update_fields=[
                    "is_session_credit_scheduling",
                    "is_substitution_reserve_enabled",
                    "default_substitution_reserve_days",
                ]
            )
            events = [
                Event(
                    title="R1",
                    date=datetime(2026, 8, 11, 12, 0, tzinfo=dt_timezone.utc),
                    time_from=time(19, 0),
                    time_to=time(20, 30),
                    course_id=1,
                    is_substitution_reserve=True,
                ),
                Event(
                    title="R2",
                    date=datetime(2026, 8, 12, 12, 0, tzinfo=dt_timezone.utc),
                    time_from=time(19, 0),
                    time_to=time(20, 30),
                    course_id=1,
                    is_substitution_reserve=True,
                ),
            ]
            with self.assertRaises(ValidationError) as ctx:
                validate_session_credit_simulated_events(
                    events, 8, program=self.program
                )
            self.assertIn("default_substitution_reserve_days", ctx.exception.detail)


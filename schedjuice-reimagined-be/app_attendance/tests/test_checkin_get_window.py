from datetime import datetime, time, timedelta
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from tenant_schemas.utils import schema_context

from app_attendance.models import UserEvent
from app_auth.models import User
from app_course.models import Category, Course, Event, UserCourse
from app_course.program_helpers import get_default_program
from app_organization.models import Organization


def _within_event_now(event_date, hour=9, minute=30):
    return timezone.make_aware(datetime.combine(event_date, time(hour, minute)), timezone.utc)


class TeacherCheckinGetWindowTest(APITestCase):
    schema_name = "xschedjuice"
    teacher_email = "teacher@schedjuice.com"
    teacher_password = "password123"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        Organization.objects.filter(schema_name=cls.schema_name).update(
            timezone="UTC",
            checkin_grace_period_minute=15,
        )
        with schema_context(cls.schema_name):
            User.objects.filter(email=cls.teacher_email).update(
                is_password_change_required=False,
                is_active=True,
                per_hour_rate=Decimal("1500.00"),
            )

    def _token(self):
        res = self.client.post(
            reverse("login"),
            {"email": self.teacher_email, "password": self.teacher_password},
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200)
        return res.data["access"]

    def _course_with_event(self, *, time_from, time_to):
        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            category = Category.objects.first()
            today = timezone.now().date()
            course = Course.objects.create(
                title=f"Window {uuid4()}",
                code=f"WN-{uuid4().hex[:6]}",
                category=category,
                program=get_default_program(),
                start_date=today,
                end_date=today + timedelta(days=1),
            )
            with patch("app_telegram.signals.dm_invite_link_to_teacher.delay"):
                UserCourse.objects.create(
                    user=teacher,
                    course=course,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                )
            Event.objects.create(
                title="Session",
                course=course,
                date=timezone.make_aware(datetime.combine(today, time(9, 0)), timezone.utc),
                time_from=time_from,
                time_to=time_to,
            )
            return course.id, today

    def _get_status(self, course_id, token):
        return self.client.get(
            reverse("teacher-checkin", kwargs={"course_id": course_id}),
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )

    def test_get_before_grace_window_returns_can_check_in_false(self):
        course_id, event_date = self._course_with_event(
            time_from=time(10, 0),
            time_to=time(11, 0),
        )
        token = self._token()
        with patch(
            "app_attendance.views.timezone.now",
            return_value=_within_event_now(event_date, hour=9, minute=30),
        ):
            resp = self._get_status(course_id, token)

        self.assertEqual(resp.status_code, 200)
        data = resp.data["data"]
        self.assertFalse(data["can_check_in"])
        self.assertFalse(data["can_check_out"])
        self.assertEqual(data["checkin_block_reason"], "checkin_too_early")
        self.assertIsNotNone(data["checkin_opens_at"])
        self.assertIsNotNone(data["checkin_closes_at"])

    def test_get_within_window_returns_can_check_in_true(self):
        course_id, event_date = self._course_with_event(
            time_from=time(10, 0),
            time_to=time(11, 0),
        )
        token = self._token()
        with patch(
            "app_attendance.views.timezone.now",
            return_value=_within_event_now(event_date, hour=9, minute=50),
        ):
            resp = self._get_status(course_id, token)

        self.assertEqual(resp.status_code, 200)
        data = resp.data["data"]
        self.assertTrue(data["can_check_in"])
        self.assertFalse(data["can_check_out"])
        self.assertIsNone(data["checkin_block_reason"])

    def test_get_after_event_end_returns_can_check_in_false(self):
        course_id, event_date = self._course_with_event(
            time_from=time(10, 0),
            time_to=time(11, 0),
        )
        token = self._token()
        with patch(
            "app_attendance.views.timezone.now",
            return_value=_within_event_now(event_date, hour=12, minute=0),
        ):
            resp = self._get_status(course_id, token)

        self.assertEqual(resp.status_code, 200)
        data = resp.data["data"]
        self.assertFalse(data["can_check_in"])
        self.assertFalse(data["can_check_out"])
        self.assertEqual(data["checkin_block_reason"], "checkin_after_event_end")

    def _course_with_two_events(self, *, first_from, first_to, second_from, second_to):
        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            category = Category.objects.first()
            today = timezone.now().date()
            course = Course.objects.create(
                title=f"Two sessions {uuid4()}",
                code=f"TS-{uuid4().hex[:6]}",
                category=category,
                program=get_default_program(),
                start_date=today,
                end_date=today + timedelta(days=1),
            )
            with patch("app_telegram.signals.dm_invite_link_to_teacher.delay"):
                UserCourse.objects.create(
                    user=teacher,
                    course=course,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                )
            morning = Event.objects.create(
                title="Morning",
                course=course,
                date=timezone.make_aware(datetime.combine(today, time(9, 0)), timezone.utc),
                time_from=first_from,
                time_to=first_to,
            )
            afternoon = Event.objects.create(
                title="Afternoon",
                course=course,
                date=timezone.make_aware(datetime.combine(today, time(9, 0)), timezone.utc),
                time_from=second_from,
                time_to=second_to,
            )
            return course.id, today, morning.id, afternoon.id

    def test_get_skips_ended_first_session_when_second_is_active(self):
        course_id, event_date, morning_id, afternoon_id = self._course_with_two_events(
            first_from=time(9, 0),
            first_to=time(10, 0),
            second_from=time(14, 0),
            second_to=time(15, 0),
        )
        token = self._token()
        with patch(
            "app_attendance.views.timezone.now",
            return_value=_within_event_now(event_date, hour=14, minute=30),
        ):
            resp = self._get_status(course_id, token)

        self.assertEqual(resp.status_code, 200)
        data = resp.data["data"]
        self.assertTrue(data["can_check_in"])
        self.assertFalse(data["can_check_out"])
        self.assertIsNone(data["checkin_block_reason"])
        self.assertEqual(data["current_event"]["event"]["id"], afternoon_id)
        self.assertEqual(data["total_events"], 2)
        self.assertEqual(data["completed_events"], 0)

    def test_get_provisions_missing_userevent_for_later_session(self):
        """When only the first session has a UserEvent row, GET still surfaces the active later session."""
        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            category = Category.objects.first()
            today = timezone.now().date()
            course = Course.objects.create(
                title=f"Late provision {uuid4()}",
                code=f"LP-{uuid4().hex[:6]}",
                category=category,
                program=get_default_program(),
                start_date=today,
                end_date=today + timedelta(days=1),
            )
            with patch("app_telegram.signals.dm_invite_link_to_teacher.delay"):
                UserCourse.objects.create(
                    user=teacher,
                    course=course,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                )
            morning = Event.objects.create(
                title="tdy",
                course=course,
                date=timezone.make_aware(datetime.combine(today, time(9, 0)), timezone.utc),
                time_from=time(13, 0),
                time_to=time(13, 30),
            )
            afternoon = Event.objects.create(
                title="test checkin",
                course=course,
                date=timezone.make_aware(datetime.combine(today, time(9, 0)), timezone.utc),
                time_from=time(14, 15),
                time_to=time(16, 30),
            )
            UserEvent.objects.create(user=teacher, event=morning)
            course_id = course.id
            afternoon_id = afternoon.id

        token = self._token()
        with patch(
            "app_attendance.views.timezone.now",
            return_value=_within_event_now(today, hour=14, minute=30),
        ):
            resp = self._get_status(course_id, token)

        self.assertEqual(resp.status_code, 200)
        data = resp.data["data"]
        self.assertTrue(data["can_check_in"])
        self.assertIsNone(data["checkin_block_reason"])
        self.assertEqual(data["current_event"]["event"]["id"], afternoon_id)
        self.assertEqual(data["total_events"], 2)

        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            self.assertTrue(
                UserEvent.objects.filter(user=teacher, event_id=afternoon_id).exists()
            )

    def test_get_returns_first_session_when_too_early_for_both(self):
        course_id, event_date, morning_id, _afternoon_id = self._course_with_two_events(
            first_from=time(9, 0),
            first_to=time(10, 0),
            second_from=time(14, 0),
            second_to=time(15, 0),
        )
        token = self._token()
        with patch(
            "app_attendance.views.timezone.now",
            return_value=_within_event_now(event_date, hour=8, minute=30),
        ):
            resp = self._get_status(course_id, token)

        self.assertEqual(resp.status_code, 200)
        data = resp.data["data"]
        self.assertFalse(data["can_check_in"])
        self.assertEqual(data["checkin_block_reason"], "checkin_too_early")
        self.assertEqual(data["current_event"]["event"]["id"], morning_id)

    def test_get_payroll_rate_missing_blocks_checkin(self):
        course_id, event_date = self._course_with_event(
            time_from=time(9, 0),
            time_to=time(10, 0),
        )
        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            teacher.per_hour_rate = None
            teacher.course_rates = {}
            teacher.save(update_fields=["per_hour_rate", "course_rates"])

        token = self._token()
        with patch(
            "app_attendance.views.timezone.now",
            return_value=_within_event_now(event_date),
        ):
            resp = self._get_status(course_id, token)

        self.assertEqual(resp.status_code, 200)
        data = resp.data["data"]
        self.assertFalse(data["can_check_in"])
        self.assertEqual(data["checkin_block_reason"], "payroll_rate_missing")
        self.assertIn(
            "inform your school admin",
            data["checkin_block_message"].lower(),
        )

    def test_get_session_based_payroll_allows_checkin_without_hourly_rate(self):
        Organization.objects.filter(schema_name=self.schema_name).update(
            payroll_calculation_strategy=Organization.PayrollCalculationStrategy.SESSION_BASED,
        )
        self.addCleanup(
            lambda: Organization.objects.filter(schema_name=self.schema_name).update(
                payroll_calculation_strategy=Organization.PayrollCalculationStrategy.TR_PHILLIPS,
            )
        )
        course_id, event_date = self._course_with_event(
            time_from=time(9, 0),
            time_to=time(10, 0),
        )
        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            teacher.per_hour_rate = None
            teacher.course_rates = {}
            teacher.save(update_fields=["per_hour_rate", "course_rates"])

        token = self._token()
        with patch(
            "app_attendance.views.timezone.now",
            return_value=_within_event_now(event_date),
        ):
            resp = self._get_status(course_id, token)

        self.assertEqual(resp.status_code, 200)
        data = resp.data["data"]
        self.assertTrue(data["can_check_in"])
        self.assertIsNone(data["checkin_block_reason"])

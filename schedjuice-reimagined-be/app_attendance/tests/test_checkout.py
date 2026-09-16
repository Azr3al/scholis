from datetime import date, datetime, time, timedelta
from unittest.mock import patch
from uuid import uuid4
from zoneinfo import ZoneInfo

from django.core.management import call_command
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from tenant_schemas.utils import schema_context

from app_attendance.models import UserEvent
from app_attendance.views import _get_event_end_utc
from app_auth.models import User
from app_course.models import Category, Course, Event, UserCourse
from app_course.program_helpers import get_default_program
from app_organization.models import Organization

YANGON_TZ = ZoneInfo("Asia/Yangon")


def _yangon_local_to_utc(local_date, local_time):
    return (
        datetime.combine(local_date, local_time)
        .replace(tzinfo=YANGON_TZ)
        .astimezone(timezone.utc)
    )


class TeacherCheckoutCappingTenantAwareTest(APITestCase):
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
        Organization.objects.filter(schema_name=cls.schema_name).update(timezone="UTC")
        with schema_context(cls.schema_name):
            User.objects.filter(email=cls.teacher_email).update(
                is_password_change_required=False,
                is_active=True,
            )

    def _get_access_token(self):
        res = self.client.post(
            reverse("login"),
            {"email": self.teacher_email, "password": self.teacher_password},
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEquals(res.status_code, 200)
        return res.data["access"]

    def _create_checked_in_teacher_event(self, event_time_from, event_time_to, checkin_time):
        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            category = Category.objects.first()
            today = checkin_time.date()
            course = Course.objects.create(
                title=f"Checkout Capping {uuid4()}",
                code=f"CAP-{uuid4().hex[:8]}",
                category=category,
                program=get_default_program(),
                start_date=today,
                end_date=today + timedelta(days=1),
            )
            with patch("app_telegram.signals.dm_invite_link_to_teacher.delay"):
                UserCourse.objects.create(                    user=teacher,
                    course=course,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                )
            event = Event.objects.create(
                title="Tenant-aware checkout event",
                course=course,
                date=checkin_time,
                time_from=event_time_from,
                time_to=event_time_to,
            )
            user_event = UserEvent.objects.create(
                user=teacher,
                event=event,
                checkin_time=checkin_time,
            )
            return course.id, user_event.id

    def _checkout(self, course_id, token):
        return self.client.put(
            reverse("teacher-checkin", kwargs={"course_id": course_id}),
            {},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )

    def _get_status(self, course_id, token):
        return self.client.get(
            reverse("teacher-checkin", kwargs={"course_id": course_id}),
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )

    def _create_after_midnight_checked_in_event(
        self,
        event_date_local,
        event_time_from,
        event_time_to,
        checkin_time,
        spans_midnight=False,
    ):
        """Create a checked-in teacher event for after-midnight checkout scenarios."""
        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            category = Category.objects.first()
            course = Course.objects.create(
                title=f"After midnight checkout {uuid4()}",
                code=f"AMC-{uuid4().hex[:8]}",
                category=category,
                program=get_default_program(),
                start_date=event_date_local,
                end_date=event_date_local + timedelta(days=1),
            )
            with patch("app_telegram.signals.dm_invite_link_to_teacher.delay"):
                UserCourse.objects.create(                    user=teacher,
                    course=course,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                )
            event_kwargs = {
                "title": "After-midnight checkout event",
                "course": course,
                "date": _yangon_local_to_utc(event_date_local, event_time_from),
                "time_from": event_time_from,
                "time_to": event_time_to,
            }
            if spans_midnight:
                event = Event(**event_kwargs)
                Event.objects.bulk_create([event])
                event = Event.objects.filter(course=course).latest("id")
            else:
                event = Event.objects.create(**event_kwargs)
            user_event = UserEvent.objects.create(
                user=teacher,
                event=event,
                checkin_time=checkin_time,
            )
            return course.id, user_event.id

    def test_checkout_uses_actual_time_when_before_event_end(self):
        today = datetime.utcnow().date()
        mocked_now_value = timezone.make_aware(
            datetime.combine(today, time(9, 30)),
            timezone.utc,
        )

        checkin_time = timezone.make_aware(
            datetime.combine(today, time(9, 0)),
            timezone.utc,
        )
        course_id, user_event_id = self._create_checked_in_teacher_event(
            event_time_from=time(9, 0),
            event_time_to=time(10, 0),
            checkin_time=checkin_time,
        )
        token = self._get_access_token()

        with patch("app_attendance.views.timezone.now", return_value=mocked_now_value):
            res = self._checkout(course_id, token)
        self.assertEquals(res.status_code, 200)

        with schema_context(self.schema_name):
            user_event = UserEvent.objects.get(id=user_event_id)
            expected_checkout = timezone.make_aware(
                datetime.combine(today, time(9, 30)),
                timezone.utc,
            )
            self.assertEquals(user_event.checkout_time, expected_checkout)

    def test_checkout_caps_at_event_end_when_after_event_end(self):
        today = datetime.utcnow().date()
        mocked_now_value = timezone.make_aware(
            datetime.combine(today, time(12, 0)),
            timezone.utc,
        )

        checkin_time = timezone.make_aware(
            datetime.combine(today, time(9, 0)),
            timezone.utc,
        )
        course_id, user_event_id = self._create_checked_in_teacher_event(
            event_time_from=time(9, 0),
            event_time_to=time(10, 0),
            checkin_time=checkin_time,
        )
        token = self._get_access_token()

        with patch("app_attendance.views.timezone.now", return_value=mocked_now_value):
            res = self._checkout(course_id, token)
        self.assertEquals(res.status_code, 200)

        with schema_context(self.schema_name):
            user_event = UserEvent.objects.get(id=user_event_id)
            expected_checkout = timezone.make_aware(
                datetime.combine(today, time(10, 0)),
                timezone.utc,
            )
            self.assertEquals(user_event.checkout_time, expected_checkout)

    def test_get_status_uses_tenant_local_day_window(self):
        Organization.objects.filter(schema_name=self.schema_name).update(timezone="Asia/Yangon")
        token = self._get_access_token()

        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            category = Category.objects.first()
            course = Course.objects.create(
                title=f"Tenant day boundary {uuid4()}",
                code=f"TDAY-{uuid4().hex[:8]}",
                category=category,
                program=get_default_program(),
                start_date=date(2026, 4, 27),
                end_date=date(2026, 4, 29),
            )
            with patch("app_telegram.signals.dm_invite_link_to_teacher.delay"):
                UserCourse.objects.create(                    user=teacher,
                    course=course,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                )

            # Local timezone is Asia/Yangon (UTC+06:30).
            # 2026-04-27 18:00 UTC -> 2026-04-28 00:30 local (included).
            in_window_event = Event.objects.create(
                title="Included event",
                course=course,
                date=timezone.make_aware(datetime(2026, 4, 27, 18, 0), timezone.utc),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            # 2026-04-28 18:00 UTC -> 2026-04-29 00:30 local (excluded).
            out_window_event = Event.objects.create(
                title="Excluded event",
                course=course,
                date=timezone.make_aware(datetime(2026, 4, 28, 18, 0), timezone.utc),
                time_from=time(11, 0),
                time_to=time(12, 0),
            )
            UserEvent.objects.create(user=teacher, event=in_window_event)
            UserEvent.objects.create(user=teacher, event=out_window_event)

        mocked_now_value = timezone.make_aware(datetime(2026, 4, 28, 5, 30), timezone.utc)
        with patch("app_attendance.views.timezone.now", return_value=mocked_now_value):
            res = self.client.get(
                reverse("teacher-checkin", kwargs={"course_id": course.id}),
                HTTP_AUTHORIZATION=f"Bearer {token}",
                HTTP_X_DTS_SCHEMA=self.schema_name,
            )

        self.assertEquals(res.status_code, 200)
        self.assertEquals(res.data["data"]["total_events"], 1)
        self.assertTrue(res.data["data"]["has_events_today"])

    def test_checkout_after_midnight_finds_open_session(self):
        Organization.objects.filter(schema_name=self.schema_name).update(
            timezone="Asia/Yangon"
        )
        token = self._get_access_token()

        event_date = date(2026, 3, 6)
        checkin_time = _yangon_local_to_utc(event_date, time(22, 30))
        mocked_now_value = _yangon_local_to_utc(event_date + timedelta(days=1), time(0, 15))

        course_id, user_event_id = self._create_after_midnight_checked_in_event(
            event_date_local=event_date,
            event_time_from=time(22, 30),
            event_time_to=time(23, 30),
            checkin_time=checkin_time,
        )

        with patch("app_attendance.views.timezone.now", return_value=mocked_now_value):
            res = self._checkout(course_id, token)
        self.assertEquals(res.status_code, 200)

        with schema_context(self.schema_name):
            user_event = UserEvent.objects.get(id=user_event_id)
            org = Organization.objects.get(schema_name=self.schema_name)
            expected_checkout = _get_event_end_utc(user_event.event, org)
            self.assertEquals(user_event.checkout_time, expected_checkout)

    def test_checkout_after_midnight_caps_at_event_end_when_class_ends_at_midnight(self):
        Organization.objects.filter(schema_name=self.schema_name).update(
            timezone="Asia/Yangon"
        )
        token = self._get_access_token()

        event_date = date(2026, 3, 6)
        checkin_time = _yangon_local_to_utc(event_date, time(22, 30))
        mocked_now_value = _yangon_local_to_utc(event_date + timedelta(days=1), time(0, 15))

        course_id, user_event_id = self._create_after_midnight_checked_in_event(
            event_date_local=event_date,
            event_time_from=time(22, 30),
            event_time_to=time(0, 0),
            checkin_time=checkin_time,
            spans_midnight=True,
        )

        with patch("app_attendance.views.timezone.now", return_value=mocked_now_value):
            res = self._checkout(course_id, token)
        self.assertEquals(res.status_code, 200)

        with schema_context(self.schema_name):
            user_event = UserEvent.objects.get(id=user_event_id)
            org = Organization.objects.get(schema_name=self.schema_name)
            expected_checkout = _get_event_end_utc(user_event.event, org)
            self.assertEquals(user_event.checkout_time, expected_checkout)
            self.assertGreater(user_event.checkout_time, user_event.checkin_time)

    def test_get_status_after_midnight_shows_open_session(self):
        Organization.objects.filter(schema_name=self.schema_name).update(
            timezone="Asia/Yangon"
        )
        token = self._get_access_token()

        event_date = date(2026, 3, 6)
        checkin_time = _yangon_local_to_utc(event_date, time(22, 30))
        mocked_now_value = _yangon_local_to_utc(event_date + timedelta(days=1), time(0, 15))

        course_id, _ = self._create_after_midnight_checked_in_event(
            event_date_local=event_date,
            event_time_from=time(22, 30),
            event_time_to=time(0, 0),
            checkin_time=checkin_time,
            spans_midnight=True,
        )

        with patch("app_attendance.views.timezone.now", return_value=mocked_now_value):
            res = self._get_status(course_id, token)

        self.assertEquals(res.status_code, 200)
        self.assertTrue(res.data["data"]["has_events_today"])
        self.assertTrue(res.data["data"]["can_check_out"])
        self.assertFalse(res.data["data"]["can_check_in"])
        self.assertEquals(res.data["data"]["checkin_status"], "checked_in")

    def test_open_session_on_ended_course_includes_effective_status(self):
        token = self._get_access_token()
        course_id = None

        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            category = Category.objects.first()
            today = timezone.now().date()
            course = Course.objects.create(
                title=f"Ended checkout {uuid4()}",
                code=f"END-{uuid4().hex[:8]}",
                category=category,
                program=get_default_program(),
                start_date=today - timedelta(days=30),
                end_date=today - timedelta(days=1),
                status_override=Course.StatusOverride.ENDED,
            )
            course_id = course.id
            with patch("app_telegram.signals.dm_invite_link_to_teacher.delay"):
                UserCourse.objects.create(
                    user=teacher,
                    course=course,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                )
            event = Event.objects.create(
                title="Final session",
                course=course,
                date=timezone.now(),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            UserEvent.objects.create(
                user=teacher,
                event=event,
                checkin_time=timezone.now() - timedelta(hours=2),
            )

        res = self.client.get(
            reverse("teacher-checkin-open-session"),
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )

        self.assertEquals(res.status_code, 200)
        open_session = res.data["data"]["open_checkin_session"]
        self.assertIsNotNone(open_session)
        self.assertEquals(open_session["course_id"], course_id)
        self.assertEquals(open_session["course_effective_status"], "ended")

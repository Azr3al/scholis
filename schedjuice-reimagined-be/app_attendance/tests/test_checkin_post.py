from datetime import datetime, time, timedelta
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.urls import reverse
from django.utils import timezone
from PIL import Image
from rest_framework.test import APITestCase
from tenant_schemas.utils import schema_context

from app_attendance.models import UserEvent
from app_auth.models import User
from app_course.models import Category, Course, Event, UserCourse
from app_course.program_helpers import get_default_program
from app_organization.models import Organization


def _tiny_jpeg():
    buf = BytesIO()
    Image.new("RGB", (8, 8), color="red").save(buf, format="JPEG")
    buf.seek(0)
    return SimpleUploadedFile("checkin.jpg", buf.read(), content_type="image/jpeg")


def _within_event_now(event_date, hour=9, minute=30):
    return timezone.make_aware(datetime.combine(event_date, time(hour, minute)), timezone.utc)


class TeacherCheckinPostTest(APITestCase):
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

    def _course_with_checked_out_event(self):
        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            category = Category.objects.first()
            today = timezone.now().date()
            course = Course.objects.create(
                title=f"Post gate {uuid4()}",
                code=f"PG-{uuid4().hex[:6]}",
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
            event = Event.objects.create(
                title="Done",
                course=course,
                date=timezone.make_aware(datetime.combine(today, time(9, 0)), timezone.utc),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            UserEvent.objects.create(
                user=teacher,
                event=event,
                checkin_time=timezone.make_aware(datetime.combine(today, time(9, 0)), timezone.utc),
                checkout_time=timezone.make_aware(datetime.combine(today, time(10, 0)), timezone.utc),
            )
            return course.id

    def test_post_no_remaining_events_returns_400(self):
        course_id = self._course_with_checked_out_event()
        token = self._token()
        resp = self.client.post(
            reverse("teacher-checkin", kwargs={"course_id": course_id}),
            {"checkin_image": _tiny_jpeg(), "is_extra_class": "false"},
            format="multipart",
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(resp.data["isError"])
        self.assertIn("No more events", resp.data["details"]["message"])

    def test_post_checkin_sets_checkin_time_and_image(self):
        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            category = Category.objects.first()
            today = timezone.now().date()
            course = Course.objects.create(
                title=f"Happy {uuid4()}",
                code=f"HP-{uuid4().hex[:6]}",
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
            event = Event.objects.create(
                title="Morning",
                course=course,
                date=timezone.make_aware(datetime.combine(today, time(9, 0)), timezone.utc),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            ue = UserEvent.objects.create(user=teacher, event=event)
            ue_id = ue.id
            course_id = course.id
            event_date = today

        token = self._token()
        with patch(
            "app_attendance.views.timezone.now",
            return_value=_within_event_now(event_date),
        ):
            resp = self.client.post(
                reverse("teacher-checkin", kwargs={"course_id": course_id}),
                {"checkin_image": _tiny_jpeg(), "is_extra_class": "true"},
                format="multipart",
                HTTP_AUTHORIZATION=f"Bearer {token}",
                HTTP_X_DTS_SCHEMA=self.schema_name,
            )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["isError"])
        self.assertEqual(resp.data["message"], "checked_in")

        with schema_context(self.schema_name):
            ue = UserEvent.objects.get(id=ue_id)
            self.assertIsNotNone(ue.checkin_time)
            self.assertTrue(ue.checkin_image.name)
            self.assertTrue(ue.is_extra_class)

    def test_get_status_auto_provisions_teacher_userevents(self):
        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            category = Category.objects.first()
            today = timezone.now().date()
            course = Course.objects.create(
                title=f"Auto provision {uuid4()}",
                code=f"AP-{uuid4().hex[:6]}",
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
                title="Today session",
                course=course,
                date=timezone.make_aware(datetime.combine(today, time(9, 0)), timezone.utc),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            self.assertFalse(
                UserEvent.objects.filter(user=teacher, event__course=course).exists()
            )
            course_id = course.id

        token = self._token()
        resp = self.client.get(
            reverse("teacher-checkin", kwargs={"course_id": course_id}),
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["isError"])
        self.assertTrue(resp.data["data"]["has_events_today"])

        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            self.assertTrue(
                UserEvent.objects.filter(user=teacher, event__course_id=course_id).exists()
            )

    def test_post_checkin_too_early_returns_400(self):
        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            category = Category.objects.first()
            today = timezone.now().date()
            course = Course.objects.create(
                title=f"Early {uuid4()}",
                code=f"ER-{uuid4().hex[:6]}",
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
                title="Morning",
                course=course,
                date=timezone.make_aware(datetime.combine(today, time(9, 0)), timezone.utc),
                time_from=time(10, 0),
                time_to=time(11, 0),
            )
            course_id = course.id
            event_date = today

        token = self._token()
        with patch(
            "app_attendance.views.timezone.now",
            return_value=_within_event_now(event_date, hour=9, minute=30),
        ):
            resp = self.client.post(
                reverse("teacher-checkin", kwargs={"course_id": course_id}),
                {"checkin_image": _tiny_jpeg(), "is_extra_class": "false"},
                format="multipart",
                HTTP_AUTHORIZATION=f"Bearer {token}",
                HTTP_X_DTS_SCHEMA=self.schema_name,
            )
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(resp.data["isError"])
        self.assertEqual(resp.data["message"], "checkin_too_early")

    @patch("app_attendance.views.get_hourly_rate_for_teacher_course", return_value=None)
    def test_post_payroll_rate_missing_returns_400(self, _mock_rate):
        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            category = Category.objects.first()
            today = timezone.now().date()
            course = Course.objects.create(
                title=f"No rate {uuid4()}",
                code=f"NR-{uuid4().hex[:6]}",
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
                title="Morning",
                course=course,
                date=timezone.make_aware(datetime.combine(today, time(9, 0)), timezone.utc),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            course_id = course.id
            event_date = today

        token = self._token()
        with patch(
            "app_attendance.views.timezone.now",
            return_value=_within_event_now(event_date),
        ):
            resp = self.client.post(
                reverse("teacher-checkin", kwargs={"course_id": course_id}),
                {"checkin_image": _tiny_jpeg(), "is_extra_class": "false"},
                format="multipart",
                HTTP_AUTHORIZATION=f"Bearer {token}",
                HTTP_X_DTS_SCHEMA=self.schema_name,
            )
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(resp.data["isError"])
        self.assertEqual(resp.data["message"], "payroll_rate_missing")
        self.assertIn(
            "inform your school admin",
            resp.data["details"]["message"].lower(),
        )

    def test_post_session_based_payroll_allows_checkin_without_hourly_rate(self):
        Organization.objects.filter(schema_name=self.schema_name).update(
            payroll_calculation_strategy=Organization.PayrollCalculationStrategy.SESSION_BASED,
        )
        self.addCleanup(
            lambda: Organization.objects.filter(schema_name=self.schema_name).update(
                payroll_calculation_strategy=Organization.PayrollCalculationStrategy.TR_PHILLIPS,
            )
        )
        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            teacher.per_hour_rate = None
            teacher.per_session_rate = None
            teacher.save(update_fields=["per_hour_rate", "per_session_rate"])

        def _restore_teacher_rates():
            with schema_context(self.schema_name):
                User.objects.filter(email=self.teacher_email).update(
                    per_hour_rate=Decimal("1500.00"),
                    per_session_rate=None,
                )

        self.addCleanup(_restore_teacher_rates)

        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            category = Category.objects.first()
            today = timezone.now().date()
            course = Course.objects.create(
                title=f"Session based {uuid4()}",
                code=f"SB-{uuid4().hex[:6]}",
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
            event = Event.objects.create(
                title="Morning",
                course=course,
                date=timezone.make_aware(datetime.combine(today, time(9, 0)), timezone.utc),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            ue = UserEvent.objects.create(user=teacher, event=event)
            ue_id = ue.id
            course_id = course.id
            event_date = today

        token = self._token()
        with patch(
            "app_attendance.views.timezone.now",
            return_value=_within_event_now(event_date),
        ):
            resp = self.client.post(
                reverse("teacher-checkin", kwargs={"course_id": course_id}),
                {"checkin_image": _tiny_jpeg(), "is_extra_class": "false"},
                format="multipart",
                HTTP_AUTHORIZATION=f"Bearer {token}",
                HTTP_X_DTS_SCHEMA=self.schema_name,
            )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["isError"])
        self.assertEqual(resp.data["message"], "checked_in")

        with schema_context(self.schema_name):
            ue = UserEvent.objects.get(id=ue_id)
            self.assertIsNotNone(ue.checkin_time)
            self.assertIsNone(ue.hourly_rate_at_calculation)

    def test_post_skips_ended_first_session_when_second_is_active(self):
        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            category = Category.objects.first()
            today = timezone.now().date()
            course = Course.objects.create(
                title=f"Two post {uuid4()}",
                code=f"TP-{uuid4().hex[:6]}",
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
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            afternoon = Event.objects.create(
                title="Afternoon",
                course=course,
                date=timezone.make_aware(datetime.combine(today, time(9, 0)), timezone.utc),
                time_from=time(14, 0),
                time_to=time(15, 0),
            )
            morning_ue = UserEvent.objects.create(user=teacher, event=morning)
            afternoon_ue = UserEvent.objects.create(user=teacher, event=afternoon)
            morning_ue_id = morning_ue.id
            afternoon_ue_id = afternoon_ue.id
            course_id = course.id
            event_date = today

        token = self._token()
        with patch(
            "app_attendance.views.timezone.now",
            return_value=_within_event_now(event_date, hour=14, minute=30),
        ):
            resp = self.client.post(
                reverse("teacher-checkin", kwargs={"course_id": course_id}),
                {"checkin_image": _tiny_jpeg(), "is_extra_class": "false"},
                format="multipart",
                HTTP_AUTHORIZATION=f"Bearer {token}",
                HTTP_X_DTS_SCHEMA=self.schema_name,
            )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["isError"])
        self.assertEqual(resp.data["message"], "checked_in")

        with schema_context(self.schema_name):
            morning_ue = UserEvent.objects.get(id=morning_ue_id)
            afternoon_ue = UserEvent.objects.get(id=afternoon_ue_id)
            self.assertIsNone(morning_ue.checkin_time)
            self.assertIsNotNone(afternoon_ue.checkin_time)

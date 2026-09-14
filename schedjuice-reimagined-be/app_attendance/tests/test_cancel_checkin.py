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

from app_attendance.models import AttendanceChangeEvent, UserEvent
from app_attendance.cancel_checkin import CancelReason
from app_auth.models import User
from app_course.models import Category, Course, Event, UserCourse
from app_course.program_helpers import get_default_program
from app_hr.payroll_funcs import session_billable_hours
from app_organization.models import Organization


def _tiny_jpeg():
    buf = BytesIO()
    Image.new("RGB", (8, 8), color="red").save(buf, format="JPEG")
    buf.seek(0)
    return SimpleUploadedFile("checkin.jpg", buf.read(), content_type="image/jpeg")


def _within_event_now(event_date, hour=9, minute=30):
    return timezone.make_aware(datetime.combine(event_date, time(hour, minute)), timezone.utc)


class CancelCheckinTest(APITestCase):
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
            allow_teacher_checkin_cancellation=True,
            use_teacher_session_checkin=True,
        )
        with schema_context(cls.schema_name):
            User.objects.filter(email=cls.teacher_email).update(
                is_password_change_required=False,
                is_active=True,
                per_hour_rate=Decimal("1500.00"),
            )

    def _token(self, email=None, password=None):
        res = self.client.post(
            reverse("login"),
            {
                "email": email or self.teacher_email,
                "password": password or self.teacher_password,
            },
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200)
        return res.data["access"]

    def _open_checkin_course(self):
        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            category = Category.objects.first()
            today = timezone.now().date()
            course = Course.objects.create(
                title=f"Cancel {uuid4()}",
                code=f"CN-{uuid4().hex[:6]}",
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
            checkin_at = _within_event_now(today)
            ue = UserEvent.objects.create(
                user=teacher,
                event=event,
                checkin_time=checkin_at,
                is_extra_class=True,
                hourly_rate_at_calculation=Decimal("1500.00"),
                student_bonus_rate_at_calculation=Decimal("100.00"),
                student_count_in_course_at_calculation=3,
                per_hour_price_at_calculation=Decimal("5000.0000"),
                event_time_from_at_calculation=checkin_at,
                event_time_to_at_calculation=checkin_at + timedelta(hours=1),
            )
            ue.checkin_image.save("checkin.jpg", _tiny_jpeg(), save=True)
            return course.id, ue.id, today

    def _cancel(self, course_id, token, payload=None, client=None):
        extra = {}
        if client:
            extra["HTTP_X_SCHEDJUICE_CLIENT"] = client
        return self.client.post(
            reverse("teacher-checkin-cancel", kwargs={"course_id": course_id}),
            payload or {"reason_code": CancelReason.STUDENT_NO_SHOW},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
            **extra,
        )

    def test_cancel_forbidden_when_org_flag_off(self):
        Organization.objects.filter(schema_name=self.schema_name).update(
            allow_teacher_checkin_cancellation=False,
        )
        course_id, _, _ = self._open_checkin_course()
        token = self._token()
        resp = self._cancel(course_id, token)
        self.assertEqual(resp.status_code, 403)
        Organization.objects.filter(schema_name=self.schema_name).update(
            allow_teacher_checkin_cancellation=True,
        )

    def test_cancel_forbidden_for_student(self):
        with schema_context(self.schema_name):
            student = User.objects.filter(roles__contains=["student"]).first()
            self.assertIsNotNone(student)
            student.set_password(self.teacher_password)
            student.is_password_change_required = False
            student.is_active = True
            student.save(update_fields=["password", "is_password_change_required", "is_active"])
            student_email = student.email

        course_id, _, _ = self._open_checkin_course()
        with schema_context(self.schema_name):
            course = Course.objects.get(id=course_id)
            UserCourse.objects.get_or_create(
                user=User.objects.get(email=student_email),
                course=course,
                defaults={"assigned_as": UserCourse.AssignedAs.STUDENT},
            )

        token = self._token(email=student_email)
        resp = self._cancel(course_id, token)
        self.assertEqual(resp.status_code, 403)

    def test_cancel_rejects_no_open_session(self):
        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            category = Category.objects.first()
            today = timezone.now().date()
            course = Course.objects.create(
                title=f"Empty {uuid4()}",
                code=f"EM-{uuid4().hex[:6]}",
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

        token = self._token()
        resp = self._cancel(course_id, token)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("No open check-in", resp.data["details"]["message"])

    def test_cancel_rejects_completed_session(self):
        course_id, ue_id, today = self._open_checkin_course()
        with schema_context(self.schema_name):
            ue = UserEvent.objects.get(id=ue_id)
            ue.checkout_time = _within_event_now(today, hour=10)
            ue.save(update_fields=["checkout_time"])

        token = self._token()
        resp = self._cancel(course_id, token)
        self.assertEqual(resp.status_code, 400)

    def test_cancel_rejects_unknown_reason(self):
        course_id, _, _ = self._open_checkin_course()
        token = self._token()
        resp = self._cancel(course_id, token, {"reason_code": "unknown"})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("reason_code", resp.data["details"])

    def test_cancel_other_requires_note(self):
        course_id, _, _ = self._open_checkin_course()
        token = self._token()
        resp = self._cancel(course_id, token, {"reason_code": CancelReason.OTHER})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("note", resp.data["details"])

    def test_cancel_success_clears_row_and_writes_audit(self):
        course_id, ue_id, _ = self._open_checkin_course()
        token = self._token()
        resp = self._cancel(
            course_id,
            token,
            {
                "reason_code": CancelReason.STUDENT_NO_SHOW,
                "note": "Waited 20 minutes",
            },
        )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["isError"])
        self.assertEqual(resp.data["message"], "checkin_cancelled")

        with schema_context(self.schema_name):
            ue = UserEvent.objects.get(id=ue_id)
            self.assertIsNone(ue.checkin_time)
            self.assertFalse(ue.checkin_image)
            self.assertFalse(ue.is_extra_class)
            self.assertIsNone(ue.hourly_rate_at_calculation)
            self.assertIsNone(ue.student_bonus_rate_at_calculation)
            self.assertIsNone(ue.student_count_in_course_at_calculation)
            self.assertIsNone(ue.per_hour_price_at_calculation)
            self.assertIsNone(ue.event_time_from_at_calculation)
            self.assertIsNone(ue.event_time_to_at_calculation)
            self.assertEqual(session_billable_hours(ue), 0.0)

            events = AttendanceChangeEvent.objects.filter(user_event_id=ue_id)
            self.assertEqual(events.count(), 1)
            entry = events.first()
            self.assertEqual(
                entry.event_type,
                AttendanceChangeEvent.EventType.CHECKIN_CANCELLED,
            )
            self.assertEqual(
                entry.source,
                AttendanceChangeEvent.Source.MOBILE_SESSION_CHECKIN,
            )
            self.assertEqual(entry.payload["reason_code"], CancelReason.STUDENT_NO_SHOW)
            self.assertEqual(entry.payload["note"], "Waited 20 minutes")

    def test_cancel_web_client_header_records_web_source(self):
        course_id, ue_id, _ = self._open_checkin_course()
        token = self._token()
        resp = self._cancel(
            course_id,
            token,
            {"reason_code": CancelReason.STUDENT_NO_SHOW},
            client="web",
        )
        self.assertEqual(resp.status_code, 200)

        with schema_context(self.schema_name):
            entry = AttendanceChangeEvent.objects.get(user_event_id=ue_id)
            self.assertEqual(
                entry.source,
                AttendanceChangeEvent.Source.WEB_SESSION_CHECKIN,
            )

    def test_recheckin_after_cancel(self):
        course_id, ue_id, event_date = self._open_checkin_course()
        token = self._token()
        cancel_resp = self._cancel(course_id, token)
        self.assertEqual(cancel_resp.status_code, 200)

        with patch(
            "app_attendance.views.timezone.now",
            return_value=_within_event_now(event_date),
        ):
            checkin_resp = self.client.post(
                reverse("teacher-checkin", kwargs={"course_id": course_id}),
                {"checkin_image": _tiny_jpeg(), "is_extra_class": "false"},
                format="multipart",
                HTTP_AUTHORIZATION=f"Bearer {token}",
                HTTP_X_DTS_SCHEMA=self.schema_name,
            )
        self.assertEqual(checkin_resp.status_code, 200)

        with schema_context(self.schema_name):
            ue = UserEvent.objects.get(id=ue_id)
            self.assertIsNotNone(ue.checkin_time)

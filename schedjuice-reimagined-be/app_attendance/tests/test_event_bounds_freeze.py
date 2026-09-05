from datetime import datetime, time, timedelta
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from PIL import Image
from rest_framework.test import APITestCase
from tenant_schemas.utils import schema_context

from app_attendance.models import UserEvent
from app_attendance.payroll_snapshots import (
    PayrollRateMissingError,
    _event_bounds_utc,
    freeze_teacher_payroll_snapshots,
)
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


class FreezeEventBoundsTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        Organization.objects.filter(schema_name=cls.schema_name).update(timezone="UTC")

    def _teacher_user_event(self, *, time_from, time_to, teacher=None):
        with schema_context(self.schema_name):
            if teacher is None:
                teacher = User.objects.filter(
                    roles__contains=[User.UserRole.TEACHER]
                ).first()
            category = Category.objects.first()
            today = timezone.now().date()
            course = Course.objects.create(
                title=f"Bounds {uuid4()}",
                code=f"EB-{uuid4().hex[:6]}",
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
                title="Session",
                course=course,
                date=timezone.make_aware(
                    datetime.combine(today, time(9, 0)), timezone.utc
                ),
                time_from=time_from,
                time_to=time_to,
            )
            org = Organization.objects.get(schema_name=self.schema_name)
            ue = UserEvent.objects.create(user=teacher, event=event)
            return ue, org

    def test_first_freeze_returns_event_bounds(self):
        with schema_context(self.schema_name):
            ue, org = self._teacher_user_event(
                time_from=time(9, 0), time_to=time(10, 30)
            )

        updates = freeze_teacher_payroll_snapshots(ue, org)

        start_utc, end_utc = _event_bounds_utc(ue.event, org)
        self.assertEqual(
            updates["event_time_from_at_calculation"], start_utc
        )
        self.assertEqual(updates["event_time_to_at_calculation"], end_utc)
        duration_hours = (
            updates["event_time_to_at_calculation"]
            - updates["event_time_from_at_calculation"]
        ).total_seconds() / 3600
        self.assertEqual(duration_hours, 1.5)

    def test_second_freeze_omits_event_bounds_when_already_set(self):
        with schema_context(self.schema_name):
            ue, org = self._teacher_user_event(
                time_from=time(9, 0), time_to=time(10, 30)
            )
            frozen_from = timezone.make_aware(
                datetime.combine(timezone.now().date(), time(9, 0)), timezone.utc
            )
            frozen_to = timezone.make_aware(
                datetime.combine(timezone.now().date(), time(10, 30)), timezone.utc
            )
            ue.event_time_from_at_calculation = frozen_from
            ue.event_time_to_at_calculation = frozen_to

        updates = freeze_teacher_payroll_snapshots(ue, org)

        self.assertNotIn("event_time_from_at_calculation", updates)
        self.assertNotIn("event_time_to_at_calculation", updates)

    def test_session_based_still_returns_event_bounds_without_rate_keys(self):
        Organization.objects.filter(schema_name=self.schema_name).update(
            payroll_calculation_strategy=Organization.PayrollCalculationStrategy.SESSION_BASED,
        )
        self.addCleanup(
            lambda: Organization.objects.filter(schema_name=self.schema_name).update(
                payroll_calculation_strategy=Organization.PayrollCalculationStrategy.TR_PHILLIPS,
            )
        )
        with schema_context(self.schema_name):
            teacher = User.objects.filter(
                roles__contains=[User.UserRole.TEACHER]
            ).first()
            teacher.per_hour_rate = None
            teacher.per_session_rate = Decimal("30000")
            teacher.save(update_fields=["per_hour_rate", "per_session_rate"])
            ue, org = self._teacher_user_event(
                time_from=time(9, 0),
                time_to=time(10, 0),
                teacher=teacher,
            )

        updates = freeze_teacher_payroll_snapshots(ue, org)

        self.assertIn("event_time_from_at_calculation", updates)
        self.assertIn("event_time_to_at_calculation", updates)
        self.assertNotIn("hourly_rate_at_calculation", updates)

    def test_missing_rate_without_require_rate_still_returns_event_bounds(self):
        with schema_context(self.schema_name):
            teacher = User.objects.filter(
                roles__contains=[User.UserRole.TEACHER]
            ).first()
            teacher.per_hour_rate = None
            teacher.course_rates = {}
            teacher.save(update_fields=["per_hour_rate", "course_rates"])
            ue, org = self._teacher_user_event(
                time_from=time(9, 0),
                time_to=time(10, 0),
                teacher=teacher,
            )

        updates = freeze_teacher_payroll_snapshots(ue, org, require_rate=False)

        self.assertIn("event_time_from_at_calculation", updates)
        self.assertIn("event_time_to_at_calculation", updates)
        self.assertNotIn("hourly_rate_at_calculation", updates)

    def test_missing_rate_with_require_rate_raises(self):
        with schema_context(self.schema_name):
            teacher = User.objects.filter(
                roles__contains=[User.UserRole.TEACHER]
            ).first()
            teacher.per_hour_rate = None
            teacher.course_rates = {}
            teacher.save(update_fields=["per_hour_rate", "course_rates"])
            ue, org = self._teacher_user_event(
                time_from=time(9, 0),
                time_to=time(10, 0),
                teacher=teacher,
            )

        with self.assertRaises(PayrollRateMissingError):
            freeze_teacher_payroll_snapshots(ue, org, require_rate=True)


class EventBoundsCheckinPostIntegrationTest(APITestCase):
    schema_name = "xschedjuice"
    teacher_email = "teacher@schedjuice.com"
    teacher_password = "password123"
    admin_email = "admin@schedjuice.com"
    admin_password = "password123"

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
            User.objects.filter(email=cls.admin_email).update(
                is_password_change_required=False,
                is_active=True,
            )

    def _token(self, email, password):
        res = self.client.post(
            reverse("login"),
            {"email": email, "password": password},
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200)
        return res.data["access"]

    def test_post_checkin_freezes_event_bounds_immune_to_event_and_admin_edits(self):
        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            category = Category.objects.first()
            today = timezone.now().date()
            course = Course.objects.create(
                title=f"Bounds POST {uuid4()}",
                code=f"BP-{uuid4().hex[:6]}",
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
                title="Session",
                course=course,
                date=timezone.make_aware(
                    datetime.combine(today, time(9, 0)), timezone.utc
                ),
                time_from=time(9, 0),
                time_to=time(10, 30),
            )
            ue = UserEvent.objects.create(user=teacher, event=event)
            ue_id = ue.id
            event_id = event.id
            course_id = course.id
            org = Organization.objects.get(schema_name=self.schema_name)

        teacher_token = self._token(self.teacher_email, self.teacher_password)
        with patch(
            "app_attendance.views.timezone.now",
            return_value=_within_event_now(today),
        ):
            resp = self.client.post(
                reverse("teacher-checkin", kwargs={"course_id": course_id}),
                {"checkin_image": _tiny_jpeg(), "is_extra_class": "false"},
                format="multipart",
                HTTP_AUTHORIZATION=f"Bearer {teacher_token}",
                HTTP_X_DTS_SCHEMA=self.schema_name,
            )
        self.assertEqual(resp.status_code, 200, resp.data)

        with schema_context(self.schema_name):
            ue = UserEvent.objects.get(id=ue_id)
            expected_from, expected_to = _event_bounds_utc(ue.event, org)
            self.assertEqual(ue.event_time_from_at_calculation, expected_from)
            self.assertEqual(ue.event_time_to_at_calculation, expected_to)
            frozen_from = ue.event_time_from_at_calculation
            frozen_to = ue.event_time_to_at_calculation

            event = Event.objects.get(id=event_id)
            event.time_from = time(8, 0)
            event.time_to = time(11, 0)
            event.save(update_fields=["time_from", "time_to"])

            ue.refresh_from_db()
            self.assertEqual(ue.event_time_from_at_calculation, frozen_from)
            self.assertEqual(ue.event_time_to_at_calculation, frozen_to)

        admin_token = self._token(self.admin_email, self.admin_password)
        checkout = timezone.make_aware(datetime.combine(today, time(10, 15)), timezone.utc)
        resp = self.client.put(
            reverse("attendance-details", kwargs={"obj_id": ue_id}),
            {"checkout_time": checkout.isoformat()},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {admin_token}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(resp.status_code, 200, resp.data)

        with schema_context(self.schema_name):
            ue = UserEvent.objects.get(id=ue_id)
            self.assertEqual(ue.event_time_from_at_calculation, frozen_from)
            self.assertEqual(ue.event_time_to_at_calculation, frozen_to)
            self.assertIsNotNone(ue.checkout_time)

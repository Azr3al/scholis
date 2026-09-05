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
from app_attendance.payroll_snapshots import _event_bounds_utc
from app_auth.models import User
from app_course.models import Category, Course, Event, UserCourse
from app_course.program_helpers import get_default_program
from app_organization.models import Organization


class UserEventSerializerUpdateTest(APITestCase):
    schema_name = "xschedjuice"
    admin_email = "admin@schedjuice.com"
    admin_password = "password123"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        Organization.objects.filter(schema_name=cls.schema_name).update(timezone="UTC")
        with schema_context(cls.schema_name):
            User.objects.filter(email=cls.admin_email).update(
                is_password_change_required=False,
                is_active=True,
            )

    def _token(self):
        res = self.client.post(
            reverse("login"),
            {"email": self.admin_email, "password": self.admin_password},
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200)
        return res.data["access"]

    def test_time_only_checkout_edit_preserves_hourly_rate_snapshot(self):
        with schema_context(self.schema_name):
            teacher = User.objects.filter(roles__contains=[User.UserRole.TEACHER]).first()
            category = Category.objects.first()
            today = timezone.now().date()
            course = Course.objects.create(
                title=f"Snapshot {uuid4()}",
                code=f"SN-{uuid4().hex[:6]}",
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
                date=timezone.make_aware(datetime.combine(today, time(9, 0)), timezone.utc),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            checkin = timezone.make_aware(datetime.combine(today, time(9, 0)), timezone.utc)
            checkout = timezone.make_aware(datetime.combine(today, time(9, 45)), timezone.utc)
            ue = UserEvent.objects.create(
                user=teacher,
                event=event,
                checkin_time=checkin,
                hourly_rate_at_calculation=Decimal("50.00"),
            )
            ue_id = ue.id

        token = self._token()
        resp = self.client.put(
            reverse("attendance-details", kwargs={"obj_id": ue_id}),
            {"checkout_time": checkout.isoformat()},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(resp.status_code, 200, resp.data)

        with schema_context(self.schema_name):
            ue = UserEvent.objects.get(id=ue_id)
            self.assertEqual(ue.hourly_rate_at_calculation, Decimal("50.00"))
            self.assertIsNotNone(ue.checkout_time)

    def test_checkout_before_checkin_returns_400(self):
        with schema_context(self.schema_name):
            teacher = User.objects.filter(roles__contains=[User.UserRole.TEACHER]).first()
            category = Category.objects.first()
            today = timezone.now().date()
            course = Course.objects.create(
                title=f"Invalid pair {uuid4()}",
                code=f"IP-{uuid4().hex[:6]}",
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
                date=timezone.make_aware(datetime.combine(today, time(9, 0)), timezone.utc),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            checkin = timezone.make_aware(datetime.combine(today, time(10, 0)), timezone.utc)
            checkout = timezone.make_aware(datetime.combine(today, time(9, 30)), timezone.utc)
            ue = UserEvent.objects.create(
                user=teacher,
                event=event,
                checkin_time=checkin,
            )
            ue_id = ue.id

        token = self._token()
        resp = self.client.put(
            reverse("attendance-details", kwargs={"obj_id": ue_id}),
            {"checkout_time": checkout.isoformat()},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(resp.status_code, 400)

    def test_first_checkin_skips_hourly_rate_freeze_for_session_based_payroll(self):
        Organization.objects.filter(schema_name=self.schema_name).update(
            payroll_calculation_strategy=Organization.PayrollCalculationStrategy.SESSION_BASED,
        )
        self.addCleanup(
            lambda: Organization.objects.filter(schema_name=self.schema_name).update(
                payroll_calculation_strategy=Organization.PayrollCalculationStrategy.TR_PHILLIPS,
            )
        )
        with schema_context(self.schema_name):
            teacher = User.objects.filter(roles__contains=[User.UserRole.TEACHER]).first()
            teacher.per_hour_rate = None
            teacher.per_session_rate = Decimal("30000")
            teacher.save(update_fields=["per_hour_rate", "per_session_rate"])
            category = Category.objects.first()
            today = timezone.now().date()
            course = Course.objects.create(
                title=f"Session freeze {uuid4()}",
                code=f"SF-{uuid4().hex[:6]}",
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
                date=timezone.make_aware(datetime.combine(today, time(9, 0)), timezone.utc),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            checkin = timezone.make_aware(datetime.combine(today, time(9, 15)), timezone.utc)
            ue = UserEvent.objects.create(user=teacher, event=event)
            ue_id = ue.id

        token = self._token()
        resp = self.client.put(
            reverse("attendance-details", kwargs={"obj_id": ue_id}),
            {"checkin_time": checkin.isoformat()},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(resp.status_code, 200, resp.data)

        with schema_context(self.schema_name):
            ue = UserEvent.objects.get(id=ue_id)
            org = Organization.objects.get(schema_name=self.schema_name)
            expected_from, expected_to = _event_bounds_utc(ue.event, org)
            self.assertIsNotNone(ue.checkin_time)
            self.assertIsNone(ue.hourly_rate_at_calculation)
            self.assertIsNone(ue.student_count_in_course_at_calculation)
            self.assertEqual(ue.event_time_from_at_calculation, expected_from)
            self.assertEqual(ue.event_time_to_at_calculation, expected_to)

    def _teacher_checkin_row(self, *, student_count_snapshot=2, student_user_count=2):
        with schema_context(self.schema_name):
            teacher = User.objects.filter(roles__contains=[User.UserRole.TEACHER]).first()
            students = list(
                User.objects.filter(roles__contains=[User.UserRole.STUDENT])[:student_user_count]
            )
            category = Category.objects.first()
            today = timezone.now().date()
            course = Course.objects.create(
                title=f"Student refresh {uuid4()}",
                code=f"SR-{uuid4().hex[:6]}",
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
                for student in students:
                    UserCourse.objects.create(
                        user=student,
                        course=course,
                        assigned_as=UserCourse.AssignedAs.STUDENT,
                    )
            event = Event.objects.create(
                title="Session",
                course=course,
                date=timezone.make_aware(datetime.combine(today, time(9, 0)), timezone.utc),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            checkin = timezone.make_aware(datetime.combine(today, time(9, 0)), timezone.utc)
            checkout = timezone.make_aware(datetime.combine(today, time(9, 45)), timezone.utc)
            ue = UserEvent.objects.create(
                user=teacher,
                event=event,
                checkin_time=checkin,
                hourly_rate_at_calculation=Decimal("50.00"),
                student_count_in_course_at_calculation=student_count_snapshot,
            )
            return ue.id, course.id, checkout

    def test_userevent_put_refreshes_student_count_on_time_only_edit(self):
        ue_id, course_id, checkout = self._teacher_checkin_row(
            student_count_snapshot=2,
            student_user_count=2,
        )

        with schema_context(self.schema_name):
            extra_student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).exclude(
                user_courses__course_id=course_id
            ).first()
            UserCourse.objects.create(
                user=extra_student,
                course_id=course_id,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

        token = self._token()
        resp = self.client.put(
            reverse("userevent-details", kwargs={"obj_id": ue_id}),
            {"checkout_time": checkout.isoformat()},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(resp.status_code, 200, resp.data)

        with schema_context(self.schema_name):
            ue = UserEvent.objects.get(id=ue_id)
            self.assertEqual(ue.student_count_in_course_at_calculation, 3)
            self.assertEqual(ue.hourly_rate_at_calculation, Decimal("50.00"))

    def test_userevent_put_ignores_manual_student_count_payload(self):
        ue_id, _course_id, checkout = self._teacher_checkin_row(
            student_count_snapshot=2,
            student_user_count=2,
        )

        token = self._token()
        resp = self.client.put(
            reverse("userevent-details", kwargs={"obj_id": ue_id}),
            {
                "checkout_time": checkout.isoformat(),
                "student_count": 99,
            },
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(resp.status_code, 200, resp.data)

        with schema_context(self.schema_name):
            ue = UserEvent.objects.get(id=ue_id)
            self.assertEqual(ue.student_count_in_course_at_calculation, 2)

    def test_attendance_put_does_not_refresh_student_count(self):
        ue_id, course_id, checkout = self._teacher_checkin_row(
            student_count_snapshot=2,
            student_user_count=2,
        )

        with schema_context(self.schema_name):
            extra_student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).exclude(
                user_courses__course_id=course_id
            ).first()
            UserCourse.objects.create(
                user=extra_student,
                course_id=course_id,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

        token = self._token()
        resp = self.client.put(
            reverse("attendance-details", kwargs={"obj_id": ue_id}),
            {"checkout_time": checkout.isoformat()},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(resp.status_code, 200, resp.data)

        with schema_context(self.schema_name):
            ue = UserEvent.objects.get(id=ue_id)
            self.assertEqual(ue.student_count_in_course_at_calculation, 2)

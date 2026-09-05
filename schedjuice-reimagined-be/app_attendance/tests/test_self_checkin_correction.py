from datetime import datetime, time, timedelta
import os
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
from app_attendance.views import _get_event_end_utc
from app_auth.models import User
from app_course.models import Category, Course, Event, UserCourse
from app_course.program_helpers import get_default_program
from app_organization.models import Organization, Organization as OrgModel
from app_rbac.seeding import seed_rbac

def _tiny_jpeg():
    buf = BytesIO()
    Image.new("RGB", (8, 8), color="red").save(buf, format="JPEG")
    buf.seek(0)
    return SimpleUploadedFile("checkin.jpg", buf.read(), content_type="image/jpeg")

class SelfCheckinCorrectionTest(APITestCase):
    schema_name = "xschedjuice"
    teacher_email = "teacher@schedjuice.com"
    other_teacher_email = "james@schedjuice.com"
    password = "password123"
    reason = "Missed check-in due to connectivity issues"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(cls.schema_name):
            seed_rbac()
            User.objects.filter(
                email__in=[cls.teacher_email, cls.other_teacher_email]
            ).update(
                is_password_change_required=False,
                is_active=True,
            )

    def setUp(self):
        self._set_org_flag(True)

    def _set_org_flag(self, enabled: bool):
        Organization.objects.filter(schema_name=self.schema_name).update(
            allow_teacher_checkin_history_correction=enabled,
            payroll_calculation_strategy=OrgModel.PayrollCalculationStrategy.SESSION_BASED,
        )

    def _token(self, email):
        res = self.client.post(
            reverse("login"),
            {"email": email, "password": self.password},
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200)
        return res.data["access"]

    def _auth(self, email):
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {self._token(email)}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )

    def _create_teacher_session(self, *, email=None, ended=True):
        with schema_context(self.schema_name):
            user = User.objects.get(email=email or self.teacher_email)
            category = Category.objects.first()
            today = timezone.now().date()
            if ended:
                session_date = today - timedelta(days=1)
            else:
                session_date = today
            course = Course.objects.create(
                title=f"Correction {uuid4()}",
                code=f"CC-{uuid4().hex[:6]}",
                category=category,
                program=get_default_program(),
                start_date=session_date,
                end_date=session_date + timedelta(days=30),
            )
            with patch("app_telegram.signals.dm_invite_link_to_teacher.delay"):
                UserCourse.objects.create(
                    user=user,
                    course=course,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                )
            event = Event.objects.create(
                title="Session",
                course=course,
                date=timezone.make_aware(
                    datetime.combine(session_date, time(9, 0)), timezone.utc
                ),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            user_event = UserEvent.objects.create(user=user, event=event)
            return course.id, event.id, user_event.id

    def _patch_correction(self, user_event_id, payload):
        return self.client.patch(
            reverse("attendance-self-correction", args=[user_event_id]),
            payload,
            format="multipart",
        )

    def test_org_flag_off_returns_403(self):
        self._set_org_flag(False)
        _, _, user_event_id = self._create_teacher_session()
        self._auth(self.teacher_email)
        res = self._patch_correction(
            user_event_id,
            {
                "checkin_time": timezone.now().isoformat(),
                "checkin_image": _tiny_jpeg(),
                "correction_reason": self.reason,
            },
        )
        self.assertEqual(res.status_code, 403)

    def test_backfill_creates_audit_and_sets_times(self):
        course_id, event_id, user_event_id = self._create_teacher_session()
        self._auth(self.teacher_email)

        with schema_context(self.schema_name):
            user_event = UserEvent.objects.get(id=user_event_id)
            session_date = user_event.event.date.date()
            checkin = timezone.make_aware(
                datetime.combine(session_date, time(9, 5)), timezone.utc
            )
            checkout = timezone.make_aware(
                datetime.combine(session_date, time(10, 0)), timezone.utc
            )

        res = self._patch_correction(
            user_event_id,
            {
                "checkin_time": checkin.isoformat(),
                "checkout_time": checkout.isoformat(),
                "checkin_image": _tiny_jpeg(),
                "correction_reason": self.reason,
            },
        )
        self.assertEqual(res.status_code, 200, res.data)

        with schema_context(self.schema_name):
            user_event.refresh_from_db()
            self.assertIsNotNone(user_event.checkin_time)
            self.assertIsNotNone(user_event.checkout_time)
            self.assertTrue(user_event.checkin_image.name)
            event = AttendanceChangeEvent.objects.get(user_event_id=user_event_id)
            self.assertEqual(
                event.event_type,
                AttendanceChangeEvent.EventType.SELF_CHECKIN_BACKFILLED,
            )
            self.assertEqual(event.payload["reason"], self.reason)
            image_change = next(
                change
                for change in event.payload["changes"]
                if change["field"] == "checkin_image"
            )
            self.assertIsNone(image_change["from"])
            self.assertEqual(image_change["to"], "checkin.jpg")

        bootstrap_res = self.client.post(
            reverse("course-checkin-history-bootstrap", args=[course_id]),
            {"event_ids": [event_id]},
            format="json",
        )
        self.assertEqual(bootstrap_res.status_code, 200, bootstrap_res.data)

    def test_checkout_after_event_end_caps_to_session_end(self):
        course_id, event_id, user_event_id = self._create_teacher_session()
        self._auth(self.teacher_email)

        with schema_context(self.schema_name):
            user_event = UserEvent.objects.get(id=user_event_id)
            session_date = user_event.event.date.date()
            org = Organization.objects.get(schema_name=self.schema_name)
            checkin = timezone.make_aware(
                datetime.combine(session_date, time(9, 5)), timezone.utc
            )
            checkout_after_end = timezone.make_aware(
                datetime.combine(session_date, time(10, 30)), timezone.utc
            )
            expected_checkout = _get_event_end_utc(user_event.event, org)

        res = self._patch_correction(
            user_event_id,
            {
                "checkin_time": checkin.isoformat(),
                "checkout_time": checkout_after_end.isoformat(),
                "checkin_image": _tiny_jpeg(),
                "correction_reason": self.reason,
            },
        )
        self.assertEqual(res.status_code, 200, res.data)

        with schema_context(self.schema_name):
            user_event.refresh_from_db()
            self.assertEqual(user_event.checkout_time, expected_checkout)

    def test_missing_image_returns_400_when_correcting_checkin(self):
        _, _, user_event_id = self._create_teacher_session()
        self._auth(self.teacher_email)

        with schema_context(self.schema_name):
            user_event = UserEvent.objects.get(id=user_event_id)
            session_date = user_event.event.date.date()
            checkin = timezone.make_aware(
                datetime.combine(session_date, time(9, 5)), timezone.utc
            )

        res = self._patch_correction(
            user_event_id,
            {
                "checkin_time": checkin.isoformat(),
                "correction_reason": self.reason,
            },
        )
        self.assertEqual(res.status_code, 400)

    def test_checkout_only_correction_without_image_succeeds(self):
        _, _, user_event_id = self._create_teacher_session()
        self._auth(self.teacher_email)

        with schema_context(self.schema_name):
            user_event = UserEvent.objects.get(id=user_event_id)
            session_date = user_event.event.date.date()
            checkin = timezone.make_aware(
                datetime.combine(session_date, time(9, 5)), timezone.utc
            )
            checkout = timezone.make_aware(
                datetime.combine(session_date, time(10, 0)), timezone.utc
            )

        setup = self._patch_correction(
            user_event_id,
            {
                "checkin_time": checkin.isoformat(),
                "checkout_time": checkout.isoformat(),
                "checkin_image": _tiny_jpeg(),
                "correction_reason": self.reason,
            },
        )
        self.assertEqual(setup.status_code, 200, setup.data)

        with schema_context(self.schema_name):
            user_event.refresh_from_db()
            user_event.checkout_time = None
            user_event.save(update_fields=["checkout_time"])

        res = self._patch_correction(
            user_event_id,
            {
                "checkout_time": checkout.isoformat(),
                "correction_reason": "Adding missed checkout time only",
            },
        )
        self.assertEqual(res.status_code, 200, res.data)

    def test_today_activities_correction_records_audit(self):
        _, _, user_event_id = self._create_teacher_session()
        self._auth(self.teacher_email)

        with schema_context(self.schema_name):
            user_event = UserEvent.objects.get(id=user_event_id)
            session_date = user_event.event.date.date()
            checkin = timezone.make_aware(
                datetime.combine(session_date, time(9, 5)), timezone.utc
            )
            checkout = timezone.make_aware(
                datetime.combine(session_date, time(10, 0)), timezone.utc
            )

        setup = self._patch_correction(
            user_event_id,
            {
                "checkin_time": checkin.isoformat(),
                "checkout_time": checkout.isoformat(),
                "checkin_image": _tiny_jpeg(),
                "correction_reason": self.reason,
            },
        )
        self.assertEqual(setup.status_code, 200, setup.data)

        res = self._patch_correction(
            user_event_id,
            {
                "today_activities": "Reviewed chapter 3 and group discussion",
                "correction_reason": "Adding session notes I forgot at checkout",
            },
        )
        self.assertEqual(res.status_code, 200, res.data)

        with schema_context(self.schema_name):
            user_event.refresh_from_db()
            self.assertEqual(
                user_event.today_activities,
                "Reviewed chapter 3 and group discussion",
            )
            event = AttendanceChangeEvent.objects.filter(
                user_event_id=user_event_id
            ).order_by("-id").first()
            activities_change = next(
                change
                for change in event.payload["changes"]
                if change["field"] == "today_activities"
            )
            self.assertIsNone(activities_change["from"])
            self.assertEqual(
                activities_change["to"],
                "Reviewed chapter 3 and group discussion",
            )

    def test_today_activities_update_records_before_and_after_text(self):
        _, _, user_event_id = self._create_teacher_session()
        self._auth(self.teacher_email)

        with schema_context(self.schema_name):
            user_event = UserEvent.objects.get(id=user_event_id)
            session_date = user_event.event.date.date()
            checkin = timezone.make_aware(
                datetime.combine(session_date, time(9, 5)), timezone.utc
            )
            checkout = timezone.make_aware(
                datetime.combine(session_date, time(10, 0)), timezone.utc
            )

        setup = self._patch_correction(
            user_event_id,
            {
                "checkin_time": checkin.isoformat(),
                "checkout_time": checkout.isoformat(),
                "checkin_image": _tiny_jpeg(),
                "today_activities": "Introduced unit 2",
                "correction_reason": self.reason,
            },
        )
        self.assertEqual(setup.status_code, 200, setup.data)

        res = self._patch_correction(
            user_event_id,
            {
                "today_activities": "Introduced unit 2 and practice drills",
                "correction_reason": "Expanded session notes after class",
            },
        )
        self.assertEqual(res.status_code, 200, res.data)

        with schema_context(self.schema_name):
            event = AttendanceChangeEvent.objects.filter(
                user_event_id=user_event_id
            ).order_by("-id").first()
            activities_change = next(
                change
                for change in event.payload["changes"]
                if change["field"] == "today_activities"
            )
            self.assertEqual(activities_change["from"], "Introduced unit 2")
            self.assertEqual(
                activities_change["to"],
                "Introduced unit 2 and practice drills",
            )

    def test_replace_image_records_audit(self):
        _, _, user_event_id = self._create_teacher_session()
        self._auth(self.teacher_email)

        with schema_context(self.schema_name):
            user_event = UserEvent.objects.get(id=user_event_id)
            session_date = user_event.event.date.date()
            checkin = timezone.make_aware(
                datetime.combine(session_date, time(9, 5)), timezone.utc
            )
            checkout = timezone.make_aware(
                datetime.combine(session_date, time(10, 0)), timezone.utc
            )

        first = self._patch_correction(
            user_event_id,
            {
                "checkin_time": checkin.isoformat(),
                "checkout_time": checkout.isoformat(),
                "checkin_image": _tiny_jpeg(),
                "correction_reason": self.reason,
            },
        )
        self.assertEqual(first.status_code, 200, first.data)

        with schema_context(self.schema_name):
            user_event.refresh_from_db()
            old_basename = os.path.basename(user_event.checkin_image.name)

        second = self._patch_correction(
            user_event_id,
            {
                "checkin_image": _tiny_jpeg(),
                "correction_reason": "Replacing screenshot with clearer photo",
            },
        )
        self.assertEqual(second.status_code, 200, second.data)

        with schema_context(self.schema_name):
            events = AttendanceChangeEvent.objects.filter(
                user_event_id=user_event_id
            ).order_by("id")
            self.assertEqual(events.count(), 2)
            image_change = next(
                change
                for change in events.last().payload["changes"]
                if change["field"] == "checkin_image"
            )
            self.assertEqual(image_change["from"], old_basename)
            self.assertEqual(image_change["to"], "checkin.jpg")

    def test_image_only_correction_succeeds(self):
        _, _, user_event_id = self._create_teacher_session()
        self._auth(self.teacher_email)

        with schema_context(self.schema_name):
            user_event = UserEvent.objects.get(id=user_event_id)
            session_date = user_event.event.date.date()
            checkin = timezone.make_aware(
                datetime.combine(session_date, time(9, 5)), timezone.utc
            )
            checkout = timezone.make_aware(
                datetime.combine(session_date, time(10, 0)), timezone.utc
            )

        setup = self._patch_correction(
            user_event_id,
            {
                "checkin_time": checkin.isoformat(),
                "checkout_time": checkout.isoformat(),
                "checkin_image": _tiny_jpeg(),
                "correction_reason": self.reason,
            },
        )
        self.assertEqual(setup.status_code, 200, setup.data)

        with schema_context(self.schema_name):
            user_event.refresh_from_db()
            original_checkin = user_event.checkin_time
            original_checkout = user_event.checkout_time

        res = self._patch_correction(
            user_event_id,
            {
                "checkin_image": _tiny_jpeg(),
                "correction_reason": "Uploading clearer screenshot only",
            },
        )
        self.assertEqual(res.status_code, 200, res.data)

        with schema_context(self.schema_name):
            user_event.refresh_from_db()
            self.assertEqual(user_event.checkin_time, original_checkin)
            self.assertEqual(user_event.checkout_time, original_checkout)
            event = AttendanceChangeEvent.objects.filter(
                user_event_id=user_event_id
            ).order_by("-id").first()
            self.assertEqual(
                event.event_type,
                AttendanceChangeEvent.EventType.SELF_CHECKIN_CORRECTED,
            )
            time_changes = [
                change
                for change in event.payload["changes"]
                if change["field"] in ("checkin_time", "checkout_time")
            ]
            self.assertEqual(time_changes, [])

    def test_admin_corrects_other_teacher_row(self):
        _, _, user_event_id = self._create_teacher_session()
        self._auth(self.other_teacher_email)

        with schema_context(self.schema_name):
            user_event = UserEvent.objects.get(id=user_event_id)
            session_date = user_event.event.date.date()
            checkin = timezone.make_aware(
                datetime.combine(session_date, time(9, 5)), timezone.utc
            )
            checkout = timezone.make_aware(
                datetime.combine(session_date, time(10, 0)), timezone.utc
            )

        res = self._patch_correction(
            user_event_id,
            {
                "checkin_time": checkin.isoformat(),
                "checkout_time": checkout.isoformat(),
                "checkin_image": _tiny_jpeg(),
                "today_activities": "Admin added session notes for teacher",
                "correction_reason": "Teacher missed check-in; admin backfill",
            },
        )
        self.assertEqual(res.status_code, 200, res.data)

        with schema_context(self.schema_name):
            user_event.refresh_from_db()
            self.assertIsNotNone(user_event.checkin_time)
            self.assertEqual(
                user_event.today_activities,
                "Admin added session notes for teacher",
            )

    def test_wrong_user_row_returns_403(self):
        _, _, user_event_id = self._create_teacher_session(email=self.other_teacher_email)
        self._auth(self.teacher_email)
        res = self._patch_correction(
            user_event_id,
            {
                "checkin_time": timezone.now().isoformat(),
                "checkin_image": _tiny_jpeg(),
                "correction_reason": "Trying to edit someone else record",
            },
        )
        self.assertEqual(res.status_code, 403)

    def test_short_reason_returns_400(self):
        _, _, user_event_id = self._create_teacher_session()
        self._auth(self.teacher_email)
        res = self._patch_correction(
            user_event_id,
            {
                "checkin_time": timezone.now().isoformat(),
                "checkin_image": _tiny_jpeg(),
                "correction_reason": "too short",
            },
        )
        self.assertEqual(res.status_code, 400)

    def test_in_progress_session_returns_400(self):
        _, _, user_event_id = self._create_teacher_session(ended=False)
        self._auth(self.teacher_email)
        res = self._patch_correction(
            user_event_id,
            {
                "checkin_time": timezone.now().isoformat(),
                "checkin_image": _tiny_jpeg(),
                "correction_reason": self.reason,
            },
        )
        self.assertEqual(res.status_code, 400)

    def test_backfill_without_hourly_rate_returns_payroll_rate_missing(self):
        Organization.objects.filter(schema_name=self.schema_name).update(
            payroll_calculation_strategy=OrgModel.PayrollCalculationStrategy.TR_PHILLIPS,
        )
        _, _, user_event_id = self._create_teacher_session()
        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            teacher.per_hour_rate = None
            teacher.course_rates = {}
            teacher.save(update_fields=["per_hour_rate", "course_rates"])

        self._auth(self.teacher_email)
        with schema_context(self.schema_name):
            user_event = UserEvent.objects.get(id=user_event_id)
            session_date = user_event.event.date.date()
            checkin = timezone.make_aware(
                datetime.combine(session_date, time(9, 5)), timezone.utc
            )
            checkout = timezone.make_aware(
                datetime.combine(session_date, time(10, 0)), timezone.utc
            )

        res = self._patch_correction(
            user_event_id,
            {
                "checkin_time": checkin.isoformat(),
                "checkout_time": checkout.isoformat(),
                "checkin_image": _tiny_jpeg(),
                "correction_reason": self.reason,
            },
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["message"], "payroll_rate_missing")
        self.assertIn(
            "inform your school admin",
            res.data["details"]["message"].lower(),
        )


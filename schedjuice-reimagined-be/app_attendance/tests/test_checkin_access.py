from datetime import datetime, time, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Event, UserCourse
from app_course.program_helpers import get_default_program
from app_organization.models import Organization

class CheckinAccessTest(APITestCase):
    schema_name = "xschedjuice"
    teacher_email = "teacher@schedjuice.com"
    student_email = "student@schedjuice.com"
    password = "password123"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(cls.schema_name):
            User.objects.filter(
                email__in=[cls.teacher_email, cls.student_email]
            ).update(
                is_password_change_required=False,
                is_active=True,
            )

    def _set_org_flags(self, *, use_teacher_session_checkin, use_student_checkin):
        Organization.objects.filter(schema_name=self.schema_name).update(
            use_teacher_session_checkin=use_teacher_session_checkin,
            use_student_checkin=use_student_checkin,
        )

    def _token(self, email):
        res = self.client.post(
            reverse("login"),
            {"email": email, "password": self.password},
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200)
        return res.data["access"]

    def _course_with_event(self, user, assigned_as):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            today = timezone.now().date()
            course = Course.objects.create(
                title=f"Access {uuid4()}",
                code=f"AC-{uuid4().hex[:6]}",
                category=category,
                program=get_default_program(),
                start_date=today,
                end_date=today + timedelta(days=1),
            )
            patch_target = (
                "app_telegram.signals.dm_invite_link_to_teacher.delay"
                if assigned_as == UserCourse.AssignedAs.TEACHER
                else None
            )
            if patch_target:
                with patch(patch_target):
                    UserCourse.objects.create(
                        user=user,
                        course=course,
                        assigned_as=assigned_as,
                    )
            else:
                UserCourse.objects.create(
                    user=user,
                    course=course,
                    assigned_as=assigned_as,
                )
            Event.objects.create(
                title="Today session",
                course=course,
                date=timezone.make_aware(datetime.combine(today, time(9, 0)), timezone.utc),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            return course.id

    def test_student_forbidden_when_only_teacher_checkin_enabled(self):
        self._set_org_flags(
            use_teacher_session_checkin=True,
            use_student_checkin=False,
        )
        with schema_context(self.schema_name):
            student = User.objects.get(email=self.student_email)
            course_id = self._course_with_event(
                student, UserCourse.AssignedAs.STUDENT
            )

        token = self._token(self.student_email)
        resp = self.client.get(
            reverse("teacher-checkin", kwargs={"course_id": course_id}),
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data["message"], "session_checkin_not_allowed")

    def test_get_forbidden_when_feature_disabled_for_role(self):
        self._set_org_flags(
            use_teacher_session_checkin=False,
            use_student_checkin=False,
        )
        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            course_id = self._course_with_event(
                teacher, UserCourse.AssignedAs.TEACHER
            )

        token = self._token(self.teacher_email)
        resp = self.client.get(
            reverse("teacher-checkin", kwargs={"course_id": course_id}),
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data["message"], "session_checkin_disabled")

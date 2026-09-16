from datetime import date, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.urls import reverse
from rest_framework.test import APITestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, UserCourse
from app_course.program_helpers import get_default_program
from app_organization.models import Organization


class SessionCheckinGateTest(APITestCase):
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
        with schema_context(cls.schema_name):
            User.objects.filter(email=cls.teacher_email).update(
                is_password_change_required=False,
                is_active=True,
            )

    def test_post_blocked_when_session_checkin_disabled(self):
        Organization.objects.filter(schema_name=self.schema_name).update(
            use_teacher_session_checkin=False,
        )
        with schema_context(self.schema_name):
            teacher = User.objects.get(email=self.teacher_email)
            category = Category.objects.first()
            today = date.today()
            course = Course.objects.create(
                title=f"Gate {uuid4()}",
                code=f"G-{uuid4().hex[:6]}",
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
            course_id = course.id

        token = self.client.post(
            reverse("login"),
            {"email": self.teacher_email, "password": self.teacher_password},
            HTTP_X_DTS_SCHEMA=self.schema_name,
        ).data["access"]

        resp = self.client.post(
            f"/api/v1/attendances/user-checkin/{course_id}",
            {},
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data["message"], "session_checkin_disabled")

import unittest
from datetime import date
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_announcement.models import Announcement, PostType
from app_announcement.push_helpers import send_announcement_push_notifications
from app_announcement.serializers import AnnouncementSerializer
from app_auth.models import User
from app_course.models import Course, UserCourse


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class AnnouncementPushSchedulingTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            self.user = User.objects.create_user(
                email=f"teacher-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.course = Course.objects.first()

    def _serializer(self):
        class Tenant:
            schema_name = self.schema_name

        class Req:
            user = type("U", (), {"id": self.user.email})()
            tenant = Tenant()

        return AnnouncementSerializer(context={"request": Req()})

    @patch("django.db.transaction.on_commit", side_effect=lambda fn, **kw: fn())
    @patch("app_announcement.serializers.send_announcement_push_notifications_task.delay")
    def test_course_announcement_create_schedules_push(self, mock_delay, _mock_on_commit):
        with schema_context(self.schema_name):
            ser = self._serializer()
            validated_data = ser.validate(
                {
                    "post_type": PostType.ANNOUNCEMENT,
                    "title": "Course update",
                    "finished_unit": None,
                    "course": self.course,
                }
            )
            instance = ser.create(validated_data)

        mock_delay.assert_called_once_with(instance.id, self.schema_name)

    @patch("django.db.transaction.on_commit", side_effect=lambda fn, **kw: fn())
    @patch("app_announcement.serializers.send_announcement_push_notifications_task.delay")
    def test_org_wide_announcement_create_schedules_push(self, mock_delay, _mock_on_commit):
        with schema_context(self.schema_name):
            ser = self._serializer()
            validated_data = ser.validate(
                {
                    "post_type": PostType.ANNOUNCEMENT,
                    "title": "School-wide update",
                    "finished_unit": None,
                }
            )
            instance = ser.create(validated_data)

        mock_delay.assert_called_once_with(instance.id, self.schema_name)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class AnnouncementPushRecipientTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            self.course = Course.objects.first()
            self.member = User.objects.create_user(
                email=f"member-{suffix}@example.com",
                password="x",
                name="Member",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.outsider = User.objects.create_user(
                email=f"outsider-{suffix}@example.com",
                password="x",
                name="Outsider",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=self.member,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            self.announcement = Announcement.objects.create(
                title="Per-course notice",
                data="Hello class",
                post_type=PostType.ANNOUNCEMENT,
                course=self.course,
            )

    @patch("app_announcement.push_helpers.enqueue_push_for_user_ids")
    def test_course_announcement_push_targets_course_members_only(self, mock_enqueue):
        send_announcement_push_notifications(self.announcement.id, self.schema_name)

        mock_enqueue.assert_called_once()
        recipient_ids = mock_enqueue.call_args[0][0]
        self.assertIn(self.member.id, recipient_ids)
        self.assertNotIn(self.outsider.id, recipient_ids)
        push_data = mock_enqueue.call_args.kwargs["data"]
        self.assertEqual(push_data["courseId"], self.course.id)
        self.assertEqual(push_data["announcementId"], self.announcement.id)

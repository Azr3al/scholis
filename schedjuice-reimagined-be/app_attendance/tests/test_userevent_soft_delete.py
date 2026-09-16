import unittest
from datetime import date, datetime, time, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_attendance.models import UserEvent
from app_attendance.userevent_lifecycle import restore_userevent, soft_delete_userevents
from app_attendance.userevent_sync import ensure_teacher_userevents_for_events
from app_auth.models import User
from app_course.models import AssignedAsRole, Category, Course, Event, Program, UserCourse
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class UserEventSoftDeleteTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.today = timezone.localdate()
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name), patch(
            "app_telegram.signals.dm_invite_link_to_teacher.delay"
        ), patch("app_telegram.signals.remove_telegram_member.delay"):
            seed_rbac()
            self.admin = User.objects.filter(email="admin@schedjuice.com").first()
            self.teacher = User.objects.create_user(
                email=f"soft-tch-{suffix}@example.com",
                password="x",
                name="Soft Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.cat = Category.objects.create(name=f"Cat {suffix}")
            self.prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"Soft Course {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            self.role = AssignedAsRole.objects.create(
                name=f"Role {suffix}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.role,
            )
            self.event = Event.objects.create(
                title="Session",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(self.today, time(9, 0)), timezone.utc
                ),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )

    def test_soft_delete_hides_empty_row_from_default_manager(self):
        with schema_context(self.schema_name):
            ue = UserEvent.objects.create(user=self.teacher, event=self.event)
            soft_delete_userevents(UserEvent.objects.filter(pk=ue.pk))
            self.assertFalse(UserEvent.objects.filter(pk=ue.pk).exists())
            self.assertTrue(
                UserEvent.all_objects.filter(pk=ue.pk, is_deleted=True).exists()
            )

    def test_soft_delete_preserves_row_with_checkin(self):
        checkin = timezone.now()
        with schema_context(self.schema_name):
            ue = UserEvent.objects.create(
                user=self.teacher,
                event=self.event,
                checkin_time=checkin,
            )
            soft_delete_userevents(UserEvent.objects.filter(pk=ue.pk))
            self.assertTrue(UserEvent.objects.filter(pk=ue.pk, is_deleted=False).exists())
            self.assertEqual(
                UserEvent.objects.get(pk=ue.pk).checkin_time,
                checkin,
            )

    def test_restore_soft_deleted_row(self):
        with schema_context(self.schema_name):
            ue = UserEvent.all_objects.create(
                user=self.teacher,
                event=self.event,
                is_deleted=True,
            )
            restored = restore_userevent(user_id=self.teacher.id, event_id=self.event.id)
            self.assertIsNotNone(restored)
            self.assertFalse(restored.is_deleted)
            self.assertEqual(restored.id, ue.id)

    def test_ensure_teacher_userevents_restores_soft_deleted_row(self):
        with schema_context(self.schema_name):
            ue = UserEvent.all_objects.create(
                user=self.teacher,
                event=self.event,
                is_deleted=True,
            )
            created = ensure_teacher_userevents_for_events(
                course_id=self.course.id,
                event_ids=[self.event.id],
            )
            self.assertEqual(created, 1)
            self.assertTrue(UserEvent.objects.filter(pk=ue.pk, is_deleted=False).exists())

    def test_assign_events_soft_deletes_empty_removed_row(self):
        with schema_context(self.schema_name):
            ue = UserEvent.objects.create(user=self.teacher, event=self.event)
            uc = UserCourse.objects.get(user=self.teacher, course=self.course)

        client = APIClient()
        with schema_context(self.schema_name):
            from rest_framework_simplejwt.tokens import AccessToken
            from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM

            token = AccessToken.for_user(self.admin)
            token[JWT_TENANT_SCHEMA_CLAIM] = self.schema_name
            client.credentials(
                HTTP_AUTHORIZATION=f"Bearer {token}",
                HTTP_TENANT=self.schema_name,
            )
            resp = client.post(
                f"/api/v1/courses/{self.course.id}/assign-events",
                {
                    "user_id": self.teacher.id,
                    "assigned_as_role_id": self.role.id,
                    "new_events": [],
                    "removed_events": [{"id": self.event.id}],
                },
                format="json",
            )
            self.assertEqual(resp.status_code, 200, resp.content)
            self.assertFalse(UserEvent.objects.filter(pk=ue.pk).exists())
            self.assertTrue(
                UserEvent.all_objects.filter(pk=ue.pk, is_deleted=True).exists()
            )

    def test_assign_events_preserves_row_with_checkin(self):
        checkin = timezone.now()
        with schema_context(self.schema_name):
            ue = UserEvent.objects.create(
                user=self.teacher,
                event=self.event,
                checkin_time=checkin,
            )

        client = APIClient()
        with schema_context(self.schema_name):
            from rest_framework_simplejwt.tokens import AccessToken
            from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM

            token = AccessToken.for_user(self.admin)
            token[JWT_TENANT_SCHEMA_CLAIM] = self.schema_name
            client.credentials(
                HTTP_AUTHORIZATION=f"Bearer {token}",
                HTTP_TENANT=self.schema_name,
            )
            resp = client.post(
                f"/api/v1/courses/{self.course.id}/assign-events",
                {
                    "user_id": self.teacher.id,
                    "assigned_as_role_id": self.role.id,
                    "new_events": [],
                    "removed_events": [{"id": self.event.id}],
                },
                format="json",
            )
            self.assertEqual(resp.status_code, 200, resp.content)
            self.assertTrue(UserEvent.objects.filter(pk=ue.pk, is_deleted=False).exists())

    def test_api_delete_blocked_when_checkin_exists(self):
        with schema_context(self.schema_name):
            ue = UserEvent.objects.create(
                user=self.teacher,
                event=self.event,
                checkin_time=timezone.now(),
            )

        client = APIClient()
        with schema_context(self.schema_name):
            from rest_framework_simplejwt.tokens import AccessToken
            from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM

            token = AccessToken.for_user(self.admin)
            token[JWT_TENANT_SCHEMA_CLAIM] = self.schema_name
            client.credentials(
                HTTP_AUTHORIZATION=f"Bearer {token}",
                HTTP_TENANT=self.schema_name,
            )
            resp = client.delete(f"/api/v1/attendances/{ue.id}")
            self.assertEqual(resp.status_code, 400, resp.content)
            self.assertTrue(UserEvent.objects.filter(pk=ue.pk).exists())

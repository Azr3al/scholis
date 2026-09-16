import unittest
from datetime import date, datetime, time, timedelta
from unittest import mock
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_attendance.models import UserEvent
from app_attendance.userevent_lifecycle import soft_delete_userevents
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
class TeacherAssignEventsIdempotencyTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpClass(cls):
        cls._telegram_invite_patch = mock.patch(
            "app_telegram.signals.dm_invite_link_to_teacher.delay"
        )
        cls._telegram_remove_patch = mock.patch(
            "app_telegram.signals.remove_telegram_member.delay"
        )
        cls._telegram_invite_patch.start()
        cls._telegram_remove_patch.start()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        cls._telegram_remove_patch.stop()
        cls._telegram_invite_patch.stop()
        super().tearDownClass()

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.today = timezone.localdate()
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.manager = User.objects.create_user(
                email=f"mgr-idem-{suffix}@example.com",
                password="x",
                name="Manager",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.MANAGER],
            )
            self.teacher = User.objects.create_user(
                email=f"tch-idem-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.cat = Category.objects.create(name=f"Cat idem {suffix}")
            self.prog = Program.objects.create(
                name=f"P idem {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C idem {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            self.other_course = Course.objects.create(
                title=f"C other idem {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            self.mt_role = AssignedAsRole.objects.create(
                name=f"MT idem {suffix}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
                is_collision_enabled=True,
            )
            self.sub_at_role = AssignedAsRole.objects.create(
                name=f"Sub AT idem {suffix}",
                seniority=AssignedAsRole.Seniority.ASSISTANT_TEACHER,
                is_collision_enabled=False,
                is_substitute=True,
            )
            session_date = timezone.make_aware(datetime.combine(self.today, time(9, 0)))
            self.event = Event.objects.create(
                title=f"Session {suffix}",
                date=session_date,
                time_from=time(9, 0),
                time_to=time(10, 30),
                course=self.course,
            )
            self.other_event = Event.objects.create(
                title=f"Other session {suffix}",
                date=session_date,
                time_from=time(9, 0),
                time_to=time(10, 30),
                course=self.other_course,
            )
            self.teacher_id = self.teacher.id
            self.course_id = self.course.id
            self.event_id = self.event.id

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _assign(self, *, role_id, event_ids=None):
        if event_ids is None:
            event_ids = [self.event_id]
        return self._client(self.manager).post(
            f"/api/v1/courses/{self.course_id}/assign-events",
            {
                "user_id": self.teacher_id,
                "assigned_as_role_id": role_id,
                "new_events": [{"id": eid} for eid in event_ids],
                "removed_events": [],
            },
            format="json",
        )

    def test_reassign_after_soft_delete_restores_row(self):
        with schema_context(self.schema_name):
            ue = UserEvent.objects.create(user=self.teacher, event=self.event)
            soft_delete_userevents(UserEvent.objects.filter(pk=ue.pk))

        resp = self._assign(role_id=self.sub_at_role.id)
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertFalse(resp.json().get("isError"), resp.content)

        with schema_context(self.schema_name):
            self.assertTrue(
                UserEvent.objects.filter(
                    user_id=self.teacher_id,
                    event_id=self.event_id,
                    is_deleted=False,
                ).exists()
            )

    def test_idempotent_assign_when_active_row_exists(self):
        with schema_context(self.schema_name):
            UserEvent.objects.create(user=self.teacher, event=self.event)
            before_count = UserEvent.objects.filter(
                user_id=self.teacher_id,
                event_id=self.event_id,
            ).count()

        resp = self._assign(role_id=self.sub_at_role.id)
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertFalse(resp.json().get("isError"), resp.content)

        with schema_context(self.schema_name):
            after_count = UserEvent.objects.filter(
                user_id=self.teacher_id,
                event_id=self.event_id,
                is_deleted=False,
            ).count()
            self.assertEqual(before_count, after_count)
            self.assertEqual(after_count, 1)

    def test_reassign_after_roster_delete_with_checked_in_sessions(self):
        resp = self._assign(role_id=self.sub_at_role.id)
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertFalse(resp.json().get("isError"), resp.content)

        with schema_context(self.schema_name):
            user_course = UserCourse.objects.get(
                user_id=self.teacher_id,
                course_id=self.course_id,
            )
            ue = UserEvent.objects.get(user_id=self.teacher_id, event_id=self.event_id)
            ue.checkin_time = timezone.now()
            ue.save(update_fields=["checkin_time", "updated_at"])
            user_course_id = user_course.id
            active_count_before = UserEvent.objects.filter(
                user_id=self.teacher_id,
                event_id=self.event_id,
                is_deleted=False,
            ).count()

        delete_resp = self._client(self.manager).delete(
            f"/api/v1/user-courses/{user_course_id}",
        )
        self.assertEqual(delete_resp.status_code, 200, delete_resp.content)

        with schema_context(self.schema_name):
            self.assertFalse(
                UserCourse.objects.filter(
                    user_id=self.teacher_id,
                    course_id=self.course_id,
                ).exists()
            )
            self.assertTrue(
                UserEvent.objects.filter(
                    user_id=self.teacher_id,
                    event_id=self.event_id,
                    is_deleted=False,
                    checkin_time__isnull=False,
                ).exists()
            )

        resp = self._assign(role_id=self.sub_at_role.id)
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertFalse(resp.json().get("isError"), resp.content)

        with schema_context(self.schema_name):
            self.assertTrue(
                UserCourse.objects.filter(
                    user_id=self.teacher_id,
                    course_id=self.course_id,
                ).exists()
            )
            active_count_after = UserEvent.objects.filter(
                user_id=self.teacher_id,
                event_id=self.event_id,
                is_deleted=False,
            ).count()
            self.assertEqual(active_count_before, active_count_after)

    def test_sub_at_assign_succeeds_with_cross_course_overlap(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.teacher,
                course=self.other_course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.mt_role,
            )
            UserEvent.objects.create(user=self.teacher, event=self.other_event)

        resp = self._assign(role_id=self.sub_at_role.id)
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertFalse(resp.json().get("isError"), resp.content)

        with schema_context(self.schema_name):
            self.assertTrue(
                UserEvent.objects.filter(
                    user_id=self.teacher_id,
                    event_id=self.event_id,
                    is_deleted=False,
                ).exists()
            )

    def test_collision_disabled_oversight_role_assigns_roster_only(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            coordinator_role = AssignedAsRole.objects.create(
                name=f"Coordinator idem {suffix}",
                seniority=AssignedAsRole.Seniority.OTHER,
                is_collision_enabled=False,
                is_substitute=False,
            )
            role_id = coordinator_role.id

        resp = self._client(self.manager).post(
            f"/api/v1/courses/{self.course_id}/assign-events",
            {
                "user_id": self.teacher_id,
                "assigned_as_role_id": role_id,
                "new_events": [],
                "removed_events": [],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertFalse(resp.json().get("isError"), resp.content)

        with schema_context(self.schema_name):
            user_course = UserCourse.objects.get(
                user_id=self.teacher_id,
                course_id=self.course_id,
            )
            self.assertEqual(user_course.assigned_as_role_id, role_id)
            self.assertFalse(
                UserEvent.objects.filter(
                    user_id=self.teacher_id,
                    event__course_id=self.course_id,
                    is_deleted=False,
                ).exists()
            )

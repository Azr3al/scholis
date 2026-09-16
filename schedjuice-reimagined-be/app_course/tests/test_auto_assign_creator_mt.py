import unittest
from datetime import date, datetime, time, timedelta, timezone as dt_timezone
from types import SimpleNamespace
from unittest import mock
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_attendance.models import UserEvent
from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM
from app_auth.models import User
from app_course.course_scoping import assign_creator_as_teacher_if_applicable
from app_course.models import AssignedAsRole, Category, Course, Event, Program, UserCourse
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class AutoAssignCreatorMtTests(TestCase):
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

    def setUp(self):
        self.today = timezone.localdate()
        self.suffix = uuid4().hex[:6]
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                auto_assign_creator_as_main_teacher=False,
                can_teacher_create_course=True,
                is_microsoft_on=False,
                is_teams_creation_enabled=False,
            )
        with schema_context(self.schema_name):
            seed_rbac()
            self.cat = Category.objects.create(name=f"Cat {self.suffix}")
            self.prog = Program.objects.create(
                name=f"P {self.suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.exclusive_teacher = User.objects.create_user(
                email=f"ex-t-{self.suffix}@example.com",
                password="x",
                name="Exclusive Teacher",
                phone_number="1",
                communication_email=f"ex-t-{self.suffix}@example.com",
                date_of_birth=date(1990, 1, 1),
                code=f"ex-t-{self.suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.multi_role_teacher = User.objects.create_user(
                email=f"multi-{self.suffix}@example.com",
                password="x",
                name="Multi Role Teacher",
                phone_number="2",
                communication_email=f"multi-{self.suffix}@example.com",
                date_of_birth=date(1990, 1, 1),
                code=f"multi-{self.suffix}",
                roles=[User.UserRole.TEACHER, User.UserRole.ADMIN],
            )
            self.mt_role = AssignedAsRole.objects.filter(
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER
            ).order_by("id").first()
            if self.mt_role is None:
                self.mt_role = AssignedAsRole.objects.create(
                    name=f"MT-{self.suffix}",
                    seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
                )

    def _tenant(self, *, auto_assign: bool):
        return SimpleNamespace(auto_assign_creator_as_main_teacher=auto_assign)

    def _make_course(self, creator: User) -> Course:
        return Course.objects.create(
            title=f"Course {uuid4().hex[:4]}",
            category=self.cat,
            program=self.prog,
            start_date=self.today,
            end_date=self.today + timedelta(days=30),
            created_by=creator,
        )

    def _make_event(self, course: Course) -> Event:
        return Event.objects.create(
            title=f"Ev {uuid4().hex[:4]}",
            date=datetime(2026, 7, 6, 9, 0, tzinfo=dt_timezone.utc),
            time_from=time(9, 0),
            time_to=time(10, 0),
            course=course,
        )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        token = AccessToken.for_user(user)
        token[JWT_TENANT_SCHEMA_CLAIM] = self.schema_name
        client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_TENANT=self.schema_name,
        )
        return client

    def _course_payload(self, title: str):
        return {
            "title": title,
            "category": self.cat.id,
            "program": self.prog.id,
            "start_date": self.today.isoformat(),
            "end_date": (self.today + timedelta(days=30)).isoformat(),
            "create_microsoft_team": False,
        }

    def test_auto_assign_sets_mt_and_userevents_when_flag_on(self):
        with schema_context(self.schema_name):
            course = self._make_course(self.exclusive_teacher)
            event = self._make_event(course)

            assign_creator_as_teacher_if_applicable(
                self.exclusive_teacher,
                course,
                tenant=self._tenant(auto_assign=True),
            )

            uc = UserCourse.objects.get(
                user=self.exclusive_teacher,
                course=course,
            )
            self.assertEqual(uc.assigned_as, UserCourse.AssignedAs.TEACHER)
            self.assertIsNotNone(uc.assigned_as_role_id)
            self.assertEqual(
                uc.assigned_as_role.seniority,
                AssignedAsRole.Seniority.MAIN_TEACHER,
            )
            self.assertTrue(
                UserEvent.objects.filter(
                    user=self.exclusive_teacher,
                    event=event,
                ).exists()
            )

    def test_auto_assign_skips_multi_role_teacher(self):
        with schema_context(self.schema_name):
            course = self._make_course(self.multi_role_teacher)

            assign_creator_as_teacher_if_applicable(
                self.multi_role_teacher,
                course,
                tenant=self._tenant(auto_assign=True),
            )

            self.assertFalse(
                UserCourse.objects.filter(
                    user=self.multi_role_teacher,
                    course=course,
                ).exists()
            )

    def test_auto_assign_missing_mt_role_returns_400(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                auto_assign_creator_as_main_teacher=True,
            )
        with schema_context(self.schema_name):
            AssignedAsRole.objects.filter(
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER
            ).delete()

            title = f"NoMT {self.suffix}"
            resp = self._client(self.exclusive_teacher).post(
                "/api/v1/courses",
                self._course_payload(title),
                format="json",
            )
            self.assertEqual(resp.status_code, 400, resp.content)
            body = resp.json()
            detail = body.get("detail") or body.get("details") or body
            self.assertTrue(detail)
            self.assertFalse(Course.objects.filter(title=title).exists())

    def test_auto_assign_idempotent_keeps_single_mt_usercourse(self):
        with schema_context(self.schema_name):
            course = self._make_course(self.exclusive_teacher)
            tenant = self._tenant(auto_assign=True)

            assign_creator_as_teacher_if_applicable(
                self.exclusive_teacher, course, tenant=tenant
            )
            assign_creator_as_teacher_if_applicable(
                self.exclusive_teacher, course, tenant=tenant
            )

            self.assertEqual(
                UserCourse.objects.filter(
                    user=self.exclusive_teacher,
                    course=course,
                ).count(),
                1,
            )
            uc = UserCourse.objects.get(
                user=self.exclusive_teacher,
                course=course,
            )
            self.assertEqual(
                uc.assigned_as_role.seniority,
                AssignedAsRole.Seniority.MAIN_TEACHER,
            )

    def test_flag_off_keeps_legacy_roster_only(self):
        with schema_context(self.schema_name):
            course = self._make_course(self.exclusive_teacher)

            assign_creator_as_teacher_if_applicable(
                self.exclusive_teacher,
                course,
                tenant=self._tenant(auto_assign=False),
            )

            uc = UserCourse.objects.get(
                user=self.exclusive_teacher,
                course=course,
            )
            self.assertEqual(uc.assigned_as, UserCourse.AssignedAs.TEACHER)
            self.assertIsNone(uc.assigned_as_role_id)

import unittest
from datetime import date, timedelta
from unittest.mock import MagicMock, patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.actor_context import build_actor_context
from app_ai.client import AIResult
from app_ai.prompts import build_platform_base_prompt
from app_ai.service import AIService
from app_ai.tools.list_user_courses import run_list_user_courses
from app_ai.tools.resolve import resolve_user
from app_ai.tools.search_users import run_search_users
from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class BuildActorContextUnitTests(SimpleTestCase):
    def test_returns_empty_when_user_none(self):
        self.assertEqual(build_actor_context(None, org=None), "")


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class BuildActorContextIntegrationTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_includes_name_email_roles_and_user_id(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            user = User.objects.create_user(
                email=f"actor-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Thiha Swan Htet",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER, User.UserRole.MANAGER],
            )
            block = build_actor_context(user, org=org)
        self.assertIn("Thiha Swan Htet", block)
        self.assertIn(user.email, block)
        self.assertIn("teacher", block.lower())
        self.assertIn(f"user_id: {user.id}", block)
        self.assertIn("never show numeric ids", block.lower())


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class SelfReferenceToolTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(self.schema_name):
            self.actor = User.objects.create_user(
                email=f"me-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Actor User",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            User.objects.create_user(
                email=f"meme-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Me Me Win Shwe",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )

    def test_resolve_user_me_returns_actor(self):
        with schema_context(self.schema_name):
            result = resolve_user(actor=self.actor, user_id=None, query="me")
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["user"].id, self.actor.id)

    def test_resolve_user_my_classes_returns_actor(self):
        with schema_context(self.schema_name):
            result = resolve_user(actor=self.actor, user_id=None, query="my classes")
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["user"].id, self.actor.id)

    def test_search_users_me_returns_single_actor_row(self):
        with schema_context(self.schema_name):
            rows = run_search_users({"query": "me"}, self.actor)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], self.actor.id)
        self.assertEqual(rows[0]["name"], "Actor User")


class PlatformPromptActorRulesTests(SimpleTestCase):
    def test_prompt_mentions_current_user_and_first_person(self):
        org = MagicMock()
        org.name = "Test School"
        text = build_platform_base_prompt(org)
        self.assertIn("Current user", text)
        self.assertIn("user_id", text)
        self.assertIn("search_users", text)
        self.assertIn('"me"', text)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class AIServiceActorContextTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    @patch("app_ai.tasks.judge_request_log_capability_gap")
    @patch("app_ai.service.OpenAIClient.generate_with_tools")
    def test_system_context_includes_actor_block(self, mock_gen, mock_judge):
        mock_judge.delay = MagicMock()
        mock_gen.return_value = AIResult(
            text="ok", tool_calls=[], model="test", iterations=0
        )
        with schema_context(self.schema_name):
            user = User.objects.create_user(
                email=f"svc-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Telegram Actor",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
                telegram_user_id=88001,
            )
            AIService().run(
                "what are my classes?",
                user,
                feature="telegram_query",
                channel_key="telegram:88001",
            )
        kwargs = mock_gen.call_args.kwargs
        ctx = kwargs["dynamic_context"]
        self.assertIn("Current user (the person asking)", ctx)
        self.assertIn("Telegram Actor", ctx)
        self.assertIn(f"user_id: {user.id}", ctx)
        self.assertIn("Current date/time context", ctx)
        self.assertIn("Current year:", ctx)
        self.assertNotIn("Current user (the person asking)", kwargs["system_context"])
        self.assertNotIn("Current date/time context", kwargs["system_context"])


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class ListUserCoursesSelfReferenceTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_query_me_returns_actor_courses_not_ambiguous(self):
        today = timezone.localdate()
        with schema_context(self.schema_name):
            actor = User.objects.create_user(
                email=f"luc-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Teacher One",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER, User.UserRole.ADMIN],
            )
            User.objects.create_user(
                email=f"other-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Me Me Win Shwe",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            cat = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            prog = Program.objects.create(
                name=f"P {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            course = Course.objects.create(
                title="KET 152 WE",
                category=cat,
                program=prog,
                start_date=today,
                end_date=today + timedelta(days=30),
                status=Course.CourseStatus.ACTIVE,
                created_by=actor,
            )
            UserCourse.objects.create(
                user=actor,
                course=course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            result = run_list_user_courses({"query": "me"}, actor)
        self.assertNotIn("error", result)
        self.assertEqual(result["user"]["id"], actor.id)
        self.assertEqual(len(result["courses"]), 1)
        self.assertEqual(result["courses"][0]["title"], "KET 152 WE")

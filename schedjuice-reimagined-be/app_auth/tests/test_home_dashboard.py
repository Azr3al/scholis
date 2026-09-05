import unittest
from datetime import date, time, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from tenant_schemas.utils import schema_context

from app_auth.home_dashboard_services import build_home_dashboard, resolve_home_variant
from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM
from app_auth.models import User
from app_organization.models import Organization
from app_course.models import (
    AssignedAsRole,
    Assignment,
    Category,
    Course,
    Event,
    Program,
    Submission,
    UserCourse,
)
from app_quiz_v3.models import Quiz, QuizAttempt
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class HomeDashboardVariantTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        today = timezone.localdate()
        with schema_context(self.schema_name):
            seed_rbac()
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"Prog {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"Course {suffix}",
                category=cat,
                program=prog,
                start_date=today,
                end_date=today + timedelta(days=30),
            )
            self.mt_role = AssignedAsRole.objects.create(
                name=f"MT {suffix}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
            )
            self.finance_teacher = User.objects.create_user(
                email=f"fin-tch-{suffix}@example.com",
                password="x",
                name="Finance Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE, User.UserRole.TEACHER],
            )
            self.teacher_mt = User.objects.create_user(
                email=f"mt-{suffix}@example.com",
                password="x",
                name="Main Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"stu-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.connected_unpaid_teacher = User.objects.create_user(
                email=f"conn-unpaid-{suffix}@example.com",
                password="x",
                name="Connected Unpaid Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            with patch("app_telegram.signals.dm_invite_link_to_teacher.delay"):
                UserCourse.objects.create(
                    user=self.finance_teacher,
                    course=self.course,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                    assigned_as_role=self.mt_role,
                )
                UserCourse.objects.create(
                    user=self.teacher_mt,
                    course=self.course,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                    assigned_as_role=self.mt_role,
                )
                UserCourse.objects.create(
                    user=self.connected_unpaid_teacher,
                    course=self.course,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                    assigned_as_role=self.mt_role,
                )
                UserCourse.objects.create(
                    user=self.student,
                    course=self.course,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                )
        self.org = Organization.objects.get(schema_name=self.schema_name)

    def _client(self, user: User) -> APIClient:
        token = AccessToken.for_user(user)
        token[JWT_TENANT_SCHEMA_CLAIM] = self.org.schema_name
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_DTS_SCHEMA=self.org.schema_name,
        )
        return client

    def _resolve(self, user: User) -> str:
        with schema_context(self.schema_name):
            return resolve_home_variant(user)

    def test_finance_beats_teacher(self):
        self.assertEqual(self._resolve(self.finance_teacher), "finance")

    def test_teacher_when_no_finance_breadth(self):
        self.assertEqual(self._resolve(self.teacher_mt), "teacher")

    def test_student_variant(self):
        self.assertEqual(self._resolve(self.student), "student")

    def test_connected_unpaid_only_is_not_finance(self):
        self.assertEqual(self._resolve(self.connected_unpaid_teacher), "teacher")

    def test_finance_hero_points_to_unpaid_shortcut(self):
        with schema_context(self.schema_name):
            data = build_home_dashboard(
                self.finance_teacher,
                year=None,
                month=None,
            )
        self.assertEqual(data["home_variant"], "finance")
        self.assertEqual(
            data["hero"]["primary_action"]["deeplink"],
            "/shortcuts/unpaid-course-counts",
        )
        self.assertNotIn("send_reminder", data["hero"]["primary_action"])

    def test_finance_todos_exclude_grading_types(self):
        with schema_context(self.schema_name):
            now = timezone.now()
            assignment = Assignment.objects.create(
                title="Needs grading",
                instructions={},
                available_datetime=now - timedelta(days=1),
                due_datetime=now + timedelta(days=1),
                available_score=10,
                course=self.course,
            )
            Submission.objects.create(
                description={},
                assignment=assignment,
                created_by=self.student,
                is_graded=False,
            )
            data = build_home_dashboard(
                self.finance_teacher,
                year=None,
                month=None,
            )
        self.assertEqual(data["home_variant"], "finance")
        types = {item["type"] for item in data["todos"]["items"]}
        self.assertNotIn("teacher_ungraded_assignment", types)
        self.assertTrue(types.isdisjoint({"grade_assignment", "grade_quiz", "grading"}))
        self.assertEqual(data["todos"]["badge_count"], len(data["todos"]["items"]))
        if data["todos"]["badge_count"] == 1:
            expected_footer = "1 task needs your attention"
        elif data["todos"]["badge_count"]:
            expected_footer = (
                f"{data['todos']['badge_count']} tasks need your attention"
            )
        else:
            expected_footer = ""
        self.assertEqual(data["todos"]["footer_label"], expected_footer)

    def test_teacher_hero_uses_next_future_class_when_today_is_empty(self):
        with schema_context(self.schema_name):
            future_event = Event.objects.create(
                title="Future class",
                date=timezone.now() + timedelta(days=2),
                time_from=time(9, 0),
                time_to=time(10, 0),
                course=self.course,
            )
            data = build_home_dashboard(
                self.teacher_mt,
                year=None,
                month=None,
            )

        self.assertEqual(data["schedule_today"]["items"], [])
        self.assertEqual(data["hero"]["title"], future_event.title)
        self.assertEqual(
            data["hero"]["primary_action"]["params"]["event_id"],
            future_event.id,
        )

    def test_student_due_quizzes_exclude_only_submitted_attempts(self):
        with schema_context(self.schema_name):
            now = timezone.now()
            in_progress_quiz = Quiz.objects.create(
                title="In progress quiz",
                status=Quiz.QuizStatus.OPEN,
                expiry_date=now + timedelta(days=1),
                course=self.course,
                created_by=self.teacher_mt,
            )
            submitted_quiz = Quiz.objects.create(
                title="Submitted quiz",
                status=Quiz.QuizStatus.OPEN,
                expiry_date=now + timedelta(days=2),
                course=self.course,
                created_by=self.teacher_mt,
            )
            QuizAttempt.objects.create(
                quiz=in_progress_quiz,
                user=self.student,
                started_at=now,
            )
            QuizAttempt.objects.create(
                quiz=submitted_quiz,
                user=self.student,
                started_at=now,
                submitted_at=now,
            )

            data = build_home_dashboard(
                self.student,
                year=None,
                month=None,
            )

        due_quizzes = {
            item["id"]: item
            for item in data["todos"]["items"]
            if item["type"] == "student_due_quiz"
        }
        in_progress_id = f"student_due_quiz:{in_progress_quiz.id}"
        self.assertIn(in_progress_id, due_quizzes)
        self.assertNotIn(f"student_due_quiz:{submitted_quiz.id}", due_quizzes)
        self.assertEqual(
            due_quizzes[in_progress_id]["params"],
            {
                "assessment_id": in_progress_quiz.id,
                "course_id": self.course.id,
            },
        )
        self.assertEqual(
            data["hero"]["primary_action"]["params"]["course_id"],
            self.course.id,
        )
        self.assertEqual(data["todos"]["badge_count"], len(data["todos"]["items"]))
        count = len(data["todos"]["items"])
        expected_footer = (
            f"{count} assignment due this week"
            if count == 1
            else f"{count} assignments due this week"
        )
        self.assertEqual(data["todos"]["footer_label"], expected_footer)

    def test_teacher_assignment_todo_includes_navigation_params(self):
        with schema_context(self.schema_name):
            now = timezone.now()
            assignment = Assignment.objects.create(
                title="Needs grading",
                instructions={},
                available_datetime=now - timedelta(days=1),
                due_datetime=now + timedelta(days=1),
                available_score=10,
                course=self.course,
            )
            submission = Submission.objects.create(
                description={},
                assignment=assignment,
                created_by=self.student,
                is_graded=False,
            )
            data = build_home_dashboard(
                self.teacher_mt,
                year=None,
                month=None,
            )

        todo = next(
            item
            for item in data["todos"]["items"]
            if item["id"] == f"teacher_ungraded_assignment:{submission.id}"
        )
        self.assertEqual(
            todo["params"],
            {
                "assessment_id": assignment.id,
                "course_id": self.course.id,
            },
        )

    def test_todos_shape_includes_badge_count_and_footer_label(self):
        with schema_context(self.schema_name):
            data = build_home_dashboard(
                self.teacher_mt,
                year=None,
                month=None,
            )
        todos = data["todos"]
        self.assertIn("items", todos)
        self.assertIn("badge_count", todos)
        self.assertIn("footer_label", todos)
        self.assertEqual(todos["badge_count"], len(todos["items"]))
        if todos["badge_count"]:
            self.assertIn("need your attention", todos["footer_label"])
        else:
            self.assertEqual(todos["footer_label"], "")

    def test_home_dashboard_ok_for_authenticated_user(self):
        resp = self._client(self.teacher_mt).get("/api/v1/home/dashboard")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        data = body.get("data", body)
        self.assertIn(
            data["home_variant"],
            {"finance", "teacher", "student", "staff"},
        )
        self.assertIn("schedule_today", data)
        self.assertIn("todos", data)

    def test_home_dashboard_unauthenticated(self):
        client = APIClient()
        client.credentials(HTTP_X_DTS_SCHEMA=self.org.schema_name)
        resp = client.get("/api/v1/home/dashboard")
        self.assertIn(resp.status_code, {401, 403})

    def test_home_dashboard_rejects_invalid_month(self):
        resp = self._client(self.teacher_mt).get(
            "/api/v1/home/dashboard",
            {"month": "13"},
        )
        self.assertEqual(resp.status_code, 400)

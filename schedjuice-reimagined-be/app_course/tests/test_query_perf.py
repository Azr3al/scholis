import unittest
from datetime import date, datetime, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.course_search_queryset import (
    annotate_program_queryset_intake_count,
    prime_id_card_class_cache,
    prime_user_course_roster_id_card_cache,
)
from app_auth.models import User
from app_course.models import Category, Course, Event, Intake, Program, UserCourse
from app_course.serializers import CourseSerializer, ProgramSerializer, UserCourseSerializer
from app_course.views import CourseDetailsView, CourseSearchView, ProgramDetailsView, UserCourseSearchView
from app_finance.models import UserPayment
from app_finance.serializers import UserPaymentSerializer
from app_finance.views import UserPaymentSearchView
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(
    _database_reachable(),
    "PostgreSQL not available",
)
class CourseQueryPerfTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        ensure_public_schema()
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        Organization.objects.filter(schema_name=cls.schema_name).update(timezone="UTC")
        with schema_context(cls.schema_name):
            if not UserCourse.objects.exists():
                course = Course.objects.first()
                user = User.objects.filter(
                    roles__contains=[User.UserRole.STUDENT]
                ).first()
                if course and user:
                    UserCourse.objects.create(
                        user=user,
                        course=course,
                        assigned_as=UserCourse.AssignedAs.STUDENT,
                    )

    def test_program_list_intake_count_bounded_queries(self):
        with schema_context(self.schema_name):
            start = date.today()
            end = start + timedelta(days=30)
            program_ids = []
            for i in range(5):
                program = Program.objects.create(
                    name=f"PerfProg {uuid4().hex[:8]}",
                    course_creation_method=Program.CourseCreationMethod.MANUAL,
                    subject_strategy=Program.SubjectStrategy.OPTIONAL,
                )
                program_ids.append(program.id)
                Intake.objects.create(
                    program=program,
                    name=f"intake-{i}",
                    start_date=start,
                    end_date=end,
                )

            base_qs = Program.objects.filter(id__in=program_ids)

            with CaptureQueriesContext(connection) as ctx_unoptimized:
                ProgramSerializer(base_qs, many=True).data
            unoptimized_count = len(ctx_unoptimized.captured_queries)

            with CaptureQueriesContext(connection) as ctx_optimized:
                optimized_qs = annotate_program_queryset_intake_count(base_qs)
                ProgramSerializer(optimized_qs, many=True).data
            optimized_count = len(ctx_optimized.captured_queries)

            self.assertLess(optimized_count, unoptimized_count)
            self.assertLessEqual(optimized_count, 5)

    def test_course_detail_bounded_queries(self):
        with schema_context(self.schema_name):
            course = Course.objects.first()
            self.assertIsNotNone(course)

            Event.objects.get_or_create(
                course=course,
                title="Perf event",
                defaults={
                    "date": timezone.make_aware(datetime.combine(date.today(), datetime.min.time())),
                    "time_from": "09:00",
                    "time_to": "10:00",
                },
            )

            view = CourseDetailsView()
            with CaptureQueriesContext(connection) as ctx:
                obj = view.get_object(course.id)
                self.assertIsNotNone(obj)
                CourseSerializer(obj).data
            self.assertLessEqual(len(ctx.captured_queries), 15)

    HUB_EXPAND = ["user_courses.user", "category", "created_by", "intake"]

    def test_course_detail_hub_expand_bounded_queries(self):
        with schema_context(self.schema_name):
            course = Course.objects.first()
            self.assertIsNotNone(course)

            students = list(
                User.objects.filter(roles__contains=[User.UserRole.STUDENT])[:5]
            )
            for user in students:
                UserCourse.objects.get_or_create(
                    user=user,
                    course=course,
                    defaults={"assigned_as": UserCourse.AssignedAs.STUDENT},
                )

            Event.objects.get_or_create(
                course=course,
                title="Perf hub event",
                defaults={
                    "date": timezone.make_aware(
                        datetime.combine(date.today(), datetime.min.time())
                    ),
                    "time_from": "09:00",
                    "time_to": "10:00",
                },
            )

            view = CourseDetailsView()
            expand = view.translate_expand_params(self.HUB_EXPAND)
            factory = APIRequestFactory()
            request = factory.get("/")
            request.query_params = type(
                "Params",
                (),
                {
                    "get": lambda self, key, default=None: default,
                    "getlist": lambda self, key: [],
                },
            )()

            with CaptureQueriesContext(connection) as ctx:
                obj = view.get_object(course.id, expand)
                self.assertIsNotNone(obj)
                prime_id_card_class_cache(
                    request, (uc.user for uc in obj.user_courses.all())
                )
                CourseSerializer(
                    obj,
                    expand=self.HUB_EXPAND,
                    context={"request": request},
                ).data
            self.assertLessEqual(len(ctx.captured_queries), 20)

    def test_course_details_hub_expand_no_prefetch_collision(self):
        with schema_context(self.schema_name):
            view = CourseDetailsView()
            translated = view.translate_expand_params(self.HUB_EXPAND)
            view.get_object(999_999_999, translated)

    def test_course_search_user_courses_expand_bounded_queries(self):
        with schema_context(self.schema_name):
            courses = list(Course.objects.all()[:3])
            self.assertGreater(len(courses), 0)

            factory = APIRequestFactory()
            request = factory.post("/")
            request.query_params = type(
                "Params",
                (),
                {
                    "get": lambda self, key, default=None: default,
                    "getlist": lambda self, key: [],
                },
            )()
            view = CourseSearchView()
            view.request = request

            expand = ["user_courses.user"]
            base_qs = Course.objects.filter(id__in=[c.id for c in courses])

            with CaptureQueriesContext(connection) as ctx:
                optimized_qs = view.augment_search_queryset(base_qs, expand, False)
                rows = list(optimized_qs)
                from app_course.course_search_queryset import (
                    prime_course_roster_id_card_cache,
                )

                prime_course_roster_id_card_cache(request, rows, expand)
                CourseSerializer(
                    rows,
                    many=True,
                    expand=expand,
                    context={"request": request},
                ).data
            self.assertLessEqual(len(ctx.captured_queries), 25)

    SEARCH_HUB_EXPAND = [
        "category",
        "subject",
        "level",
        "section",
        "program",
        "intake",
        "course_subjects",
        "course_subjects.subject",
        "created_by",
    ]

    def test_course_search_hub_expand_bounded_queries(self):
        with schema_context(self.schema_name):
            courses = list(Course.objects.all()[:3])
            self.assertGreater(len(courses), 0)

            factory = APIRequestFactory()
            request = factory.post("/")
            request.query_params = type(
                "Params",
                (),
                {
                    "get": lambda self, key, default=None: default,
                    "getlist": lambda self, key: [],
                },
            )()
            view = CourseSearchView()
            view.request = request

            expand = self.SEARCH_HUB_EXPAND
            base_qs = Course.objects.filter(id__in=[c.id for c in courses])

            with CaptureQueriesContext(connection) as ctx:
                optimized_qs = view.augment_search_queryset(base_qs, expand, False)
                rows = list(optimized_qs)
                from app_course.course_search_queryset import (
                    prime_course_roster_id_card_cache,
                )
                from app_custom_fields.validation import (
                    prime_custom_field_representation_cache,
                )

                prime_custom_field_representation_cache(request)
                prime_course_roster_id_card_cache(request, rows, expand)
                CourseSerializer(
                    rows,
                    many=True,
                    expand=expand,
                    context={
                        "request": request,
                        "omit_nested_user_scopes": True,
                        "omit_nested_fk_counts": True,
                    },
                ).data
            self.assertLessEqual(len(ctx.captured_queries), 12)

    def test_user_course_search_select_related(self):
        with schema_context(self.schema_name):
            user_courses = list(UserCourse.objects.all()[:10])
            self.assertGreater(len(user_courses), 0)

            factory = APIRequestFactory()
            request = factory.get("/")
            request.query_params = type(
                "Params",
                (),
                {"get": lambda self, key, default=None: default, "getlist": lambda self, key: []},
            )()
            view = UserCourseSearchView()
            view.request = request

            base_qs = UserCourse.objects.filter(
                id__in=[uc.id for uc in user_courses]
            )

            with CaptureQueriesContext(connection) as ctx_unoptimized:
                rows = list(base_qs)
                for uc in rows:
                    _ = uc.user.name
                    _ = uc.course.title
                    _ = uc.assigned_as_role
            unoptimized_count = len(ctx_unoptimized.captured_queries)

            with CaptureQueriesContext(connection) as ctx_optimized:
                optimized_qs = view.augment_search_queryset(base_qs, [], False)
                rows = list(optimized_qs)
                for uc in rows:
                    _ = uc.user.name
                    _ = uc.course.title
                    _ = uc.assigned_as_role
            optimized_count = len(ctx_optimized.captured_queries)

            self.assertLess(optimized_count, unoptimized_count)
            self.assertLessEqual(optimized_count, 5)

    def test_user_course_search_user_expand_bounded_queries(self):
        with schema_context(self.schema_name):
            user_courses = list(UserCourse.objects.all()[:10])
            self.assertGreater(len(user_courses), 0)

            factory = APIRequestFactory()
            request = factory.post("/")
            request.query_params = type(
                "Params",
                (),
                {
                    "get": lambda self, key, default=None: default,
                    "getlist": lambda self, key: [],
                },
            )()
            view = UserCourseSearchView()
            view.request = request

            expand = ["user"]
            base_qs = UserCourse.objects.filter(
                id__in=[uc.id for uc in user_courses]
            )

            with CaptureQueriesContext(connection) as ctx:
                optimized_qs = view.augment_search_queryset(base_qs, expand, False)
                rows = list(optimized_qs)
                from app_custom_fields.validation import (
                    prime_custom_field_representation_cache,
                )

                prime_custom_field_representation_cache(request)
                prime_user_course_roster_id_card_cache(request, rows, expand)
                UserCourseSerializer(
                    rows,
                    many=True,
                    expand=expand,
                    context={"request": request},
                ).data
            self.assertLessEqual(len(ctx.captured_queries), 10)

    def test_program_detail_intake_count_bounded_queries(self):
        with schema_context(self.schema_name):
            program = Program.objects.create(
                name=f"PerfDetail {uuid4().hex[:8]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.OPTIONAL,
            )
            start = date.today()
            Intake.objects.create(
                program=program,
                name="detail-intake",
                start_date=start,
                end_date=start + timedelta(days=30),
            )

            view = ProgramDetailsView()
            with CaptureQueriesContext(connection) as ctx:
                obj = view.get_object(program.id)
                self.assertIsNotNone(obj)
                ProgramSerializer(obj).data
            self.assertLessEqual(len(ctx.captured_queries), 5)

    def test_user_payment_search_covered_months_bounded_queries(self):
        with schema_context(self.schema_name):
            payments = list(UserPayment.objects.all()[:10])
            if not payments:
                self.skipTest("No user payment fixtures in tenant seed data")

            factory = APIRequestFactory()
            request = factory.get("/")
            view = UserPaymentSearchView()
            view.request = request

            base_qs = UserPayment.objects.filter(id__in=[p.id for p in payments])

            with CaptureQueriesContext(connection) as ctx_unoptimized:
                UserPaymentSerializer(base_qs, many=True).data
            unoptimized_count = len(ctx_unoptimized.captured_queries)

            with CaptureQueriesContext(connection) as ctx_optimized:
                optimized_qs = view.augment_search_queryset(base_qs, [], False)
                UserPaymentSerializer(optimized_qs, many=True).data
            optimized_count = len(ctx_optimized.captured_queries)

            self.assertLess(optimized_count, unoptimized_count)
            self.assertLessEqual(optimized_count, 8)


def _manual_program_and_category():
    program = Program.objects.filter(
        course_creation_method=Program.CourseCreationMethod.MANUAL,
        subject_strategy=Program.SubjectStrategy.NONE,
    ).first()
    if program is None:
        program = Program.objects.create(
            name=f"CreatePerfProg {uuid4().hex[:8]}",
            course_creation_method=Program.CourseCreationMethod.MANUAL,
            subject_strategy=Program.SubjectStrategy.NONE,
        )
    category = Category.objects.first()
    if category is None:
        category = Category.objects.create(name=f"CreatePerfCat {uuid4().hex[:8]}")
    return program, category


class CourseCreateQueryPerfTest(CourseQueryPerfTest):
    """MS-off course create: no search_text refresh cluster; bounded queries."""

    def test_course_serializer_create_skips_search_text_refresh_sql(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_microsoft_on=False,
                is_teams_creation_enabled=False,
            )
            tenant = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            program, category = _manual_program_and_category()
            user = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            self.assertIsNotNone(user)

            factory = APIRequestFactory()
            wsgi = factory.post("/api/v1/courses", {}, format="json")
            wsgi.tenant = tenant
            request = Request(wsgi)
            request.tenant = tenant
            request.user = user

            start = date.today()
            payload = {
                "title": f"CreateQ {uuid4().hex[:8]}",
                "start_date": str(start),
                "end_date": str(start + timedelta(days=30)),
                "program": program.id,
                "category": category.id,
                "create_microsoft_team": False,
            }

            with CaptureQueriesContext(connection) as ctx:
                ser = CourseSerializer(data=payload, context={"request": request})
                self.assertTrue(ser.is_valid(), ser.errors)
                instance = ser.save()
                _ = CourseSerializer(instance, context={"request": request}).data

            sqls = [" ".join(q["sql"].split()) for q in ctx.captured_queries]
            update_search = [
                s
                for s in sqls
                if s.upper().startswith("UPDATE")
                and "APP_COURSE_COURSE" in s.upper()
                and "SEARCH_TEXT" in s.upper()
            ]
            self.assertEqual(
                update_search,
                [],
                f"unexpected search_text UPDATE(s): {update_search}",
            )
            instance.refresh_from_db()
            self.assertIn(program.name, instance.search_text)
            self.assertIn(category.name, instance.search_text)

    def test_course_serializer_create_query_budget_ms_off(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_microsoft_on=False,
                is_teams_creation_enabled=False,
                auto_assign_creator_as_main_teacher=False,
            )
            tenant = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            program, category = _manual_program_and_category()
            user = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            self.assertIsNotNone(user)

            factory = APIRequestFactory()
            wsgi = factory.post("/api/v1/courses", {}, format="json")
            wsgi.tenant = tenant
            request = Request(wsgi)
            request.tenant = tenant
            request.user = user

            start = date.today()
            payload = {
                "title": f"CreateBudget {uuid4().hex[:8]}",
                "start_date": str(start),
                "end_date": str(start + timedelta(days=30)),
                "program": program.id,
                "category": category.id,
                "create_microsoft_team": False,
            }

            with CaptureQueriesContext(connection) as ctx:
                ser = CourseSerializer(data=payload, context={"request": request})
                self.assertTrue(ser.is_valid(), ser.errors)
                instance = ser.save()
                _ = CourseSerializer(instance, context={"request": request}).data

            self.assertLessEqual(
                len(ctx.captured_queries),
                13,
                [" ".join(q["sql"].split())[:160] for q in ctx.captured_queries],
            )

"""Base test case for quiz v3 view tests that call as_view() directly."""

from __future__ import annotations

from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from rest_framework_simplejwt.authentication import JWTTokenUserAuthentication
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import schema_context

from app_organization.models import Organization


def attach_view_request_user(wsgi, email: str):
    """Attach JWT user and wrap factory request for DRF view access (.data, .query_params)."""
    from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
    from rest_framework.request import Request

    token_user = type(
        "TokenUser",
        (),
        {"id": email, "is_authenticated": True},
    )()
    wsgi.user = token_user
    drf_request = Request(
        wsgi,
        parsers=[JSONParser(), FormParser(), MultiPartParser()],
    )
    drf_request._user = token_user
    drf_request._auth = token_user
    return drf_request


def _ensure_basic_course_enrollments(schema_name: str) -> None:
    from app_auth.models import User
    from app_course.models import Category, Course, UserCourse
    from app_course.program_helpers import get_default_program

    with schema_context(schema_name):
        if (
            UserCourse.objects.filter(
                assigned_as=UserCourse.AssignedAs.STUDENT
            ).exists()
            and UserCourse.objects.filter(
                assigned_as=UserCourse.AssignedAs.TEACHER
            ).exists()
        ):
            return
        category = Category.objects.first()
        if category is None:
            category = Category.objects.create(name="Quiz test category")
        program = get_default_program()
        course = Course.objects.filter(program=program).first()
        if course is None:
            course = Course.objects.create(
                title="Quiz enrollment course",
                code="QUIZ-ENR",
                category=category,
                program=program,
                start_date="2024-01-01",
                end_date="2024-12-31",
            )
        student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).first()
        teacher = User.objects.filter(roles__contains=[User.UserRole.TEACHER]).first()
        if (
            student
            and not UserCourse.objects.filter(
                user=student, course=course, assigned_as=UserCourse.AssignedAs.STUDENT
            ).exists()
        ):
            UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
        if (
            teacher
            and not UserCourse.objects.filter(
                user=teacher, course=course, assigned_as=UserCourse.AssignedAs.TEACHER
            ).exists()
        ):
            UserCourse.objects.create(
                user=teacher,
                course=course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )


def database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _authenticate_wsgi_user(request):
    underlying = getattr(request, "_request", request)
    wsgi_user = getattr(underlying, "user", None)
    email = getattr(wsgi_user, "id", None)
    if not email:
        return None
    token_user = type(
        "TokenUser",
        (),
        {"id": email, "is_authenticated": True},
    )()
    return token_user, None


class QuizViewTestCase(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpClass(cls):
        cls._auth_patchers = [
            patch.object(
                TenantBoundJWTStatelessAuthentication,
                "authenticate",
                side_effect=_authenticate_wsgi_user,
            ),
            patch.object(
                JWTTokenUserAuthentication,
                "authenticate",
                side_effect=_authenticate_wsgi_user,
            ),
        ]
        for patcher in cls._auth_patchers:
            patcher.start()
        super().setUpClass()
        ensure_public_schema()
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        Organization.objects.filter(schema_name=cls.schema_name).update(timezone="UTC")
        _ensure_basic_course_enrollments(cls.schema_name)

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        for patcher in getattr(cls, "_auth_patchers", []):
            patcher.stop()

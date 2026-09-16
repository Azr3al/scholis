"""Regression: Academic Hub 'My classes only' must not duplicate courses in search."""

import base64
import json
import unittest
from datetime import timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from tenant_schemas.utils import schema_context

from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM
from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _b64_json(value) -> str:
    return base64.b64encode(json.dumps(value).encode()).decode()


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CourseSearchDistinctTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.today = timezone.localdate()
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            self.cat = Category.objects.create(name=f"Cat {suffix}")
            self.prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.creator = User.objects.create_user(
                email=f"creator-{suffix}@example.com",
                password="pw-test-123",
                phone_number=f"9{suffix[:8]}",
                communication_email=f"creator-{suffix}@example.com",
                name="Creator",
                date_of_birth=self.today - timedelta(days=365 * 25),
                code=f"creator-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.member_users = []
            for i in range(5):
                user = User.objects.create_user(
                    email=f"member{i}-{suffix}@example.com",
                    password="pw-test-123",
                    phone_number=f"8{suffix[:7]}{i}",
                    communication_email=f"member{i}-{suffix}@example.com",
                    name=f"Member {i}",
                    date_of_birth=self.today - timedelta(days=365 * 20),
                    code=f"member{i}-{suffix}",
                    roles=[User.UserRole.TEACHER if i < 3 else User.UserRole.STUDENT],
                )
                self.member_users.append(user)

            self.populated_course = Course.objects.create(
                title=f"Mobile app test course {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=10),
                end_date=self.today + timedelta(days=100),
                created_by=self.creator,
            )
            for i, user in enumerate(self.member_users):
                UserCourse.objects.create(
                    user=user,
                    course=self.populated_course,
                    assigned_as=(
                        UserCourse.AssignedAs.TEACHER
                        if i < 3
                        else UserCourse.AssignedAs.STUDENT
                    ),
                )

            self.empty_course = Course.objects.create(
                title=f"MS Test Course {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=5),
                end_date=self.today + timedelta(days=50),
                created_by=self.creator,
            )

    def _client(self, user: User) -> APIClient:
        token = AccessToken.for_user(user)
        token[JWT_TENANT_SCHEMA_CLAIM] = self.schema_name
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_TENANT=self.schema_name,
        )
        return client

    def _search(
        self,
        user: User,
        *,
        q: str | None = None,
        filter_params: list | None = None,
        expand: list | None = None,
    ):
        query = (
            "/api/v1/courses/search"
            f"?page=1&size=24"
            f"&sorts={_b64_json(['-created_at'])}"
            f"&expand={_b64_json(expand or [])}"
        )
        if q:
            query += f"&q={q}"
        body = {"filter_params": filter_params or []}
        return self._client(user).post(query, body, format="json")

    def _search_my_courses(self, user: User):
        return self._search(
            user,
            filter_params=[
                {
                    "field_name": "user_courses__user_id|created_by",
                    "operator": "exact",
                    "value": str(user.id),
                }
            ],
        )

    def test_my_classes_filter_returns_each_course_once(self):
        res = self._search_my_courses(self.creator)
        self.assertEqual(res.status_code, 200, res.content)
        payload = res.json()
        self.assertFalse(payload.get("isError"))

        rows = payload.get("data") or []
        ids = [row["id"] for row in rows]
        self.assertEqual(len(ids), len(set(ids)), f"duplicate ids in response: {ids}")

        returned_ids = set(ids)
        self.assertIn(self.populated_course.id, returned_ids)
        self.assertIn(self.empty_course.id, returned_ids)
        self.assertEqual(payload.get("count"), 2)

    def test_search_with_q_returns_matching_course(self):
        """Regression: FTS + augment_search_queryset distinct() must not 500."""
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            searchable = Course.objects.create(
                title=f"KET 185 Flyers {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=3),
                end_date=self.today + timedelta(days=60),
                created_by=self.creator,
            )
        expand = [
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
        res = self._search(
            self.creator,
            q="KET 185",
            expand=expand,
        )
        self.assertEqual(res.status_code, 200, res.content)
        payload = res.json()
        self.assertFalse(payload.get("isError"))
        ids = [row["id"] for row in payload.get("data") or []]
        self.assertIn(searchable.id, ids)

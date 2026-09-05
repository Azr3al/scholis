import unittest
from datetime import date, timedelta
from uuid import uuid4

from django.conf import settings
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.course_search import (
    apply_course_search_q_with_meta,
    course_suggest_queryset,
)
from app_course.models import (
    Category,
    Course,
    CourseSubject,
    Program,
    Subject,
)
from app_course.search_signals import compute_course_search_text, refresh_course_search_text
from app_course.serializers import CourseSerializer
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CourseSearchFtsTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _make_course(self, *, title, code="", description=None, subject=None):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            if not category:
                category = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            program, _ = Program.objects.get_or_create(
                name=f"Prog {uuid4().hex[:6]}",
                defaults={
                    "course_creation_method": Program.CourseCreationMethod.MANUAL,
                    "subject_strategy": Program.SubjectStrategy.NONE,
                },
            )
            return Course.objects.create(
                title=title,
                code=code,
                description=description,
                category=category,
                program=program,
                subject=subject,
                start_date="2024-01-01",
                end_date="2024-12-31",
            )

    def test_search_text_populated_on_save(self):
        with schema_context(self.schema_name):
            subject = Subject.objects.create(name="Physics Advanced")
            course = self._make_course(
                title="Science 101",
                code="SCI-101",
                subject=subject,
            )
            course.refresh_from_db()
            self.assertIn("Physics Advanced", course.search_text)

    def test_course_subject_updates_search_text(self):
        with schema_context(self.schema_name):
            course = self._make_course(title="Multi Subject")
            sub = Subject.objects.create(name="Chemistry")
            CourseSubject.objects.create(course=course, subject=sub)
            refresh_course_search_text(course.pk)
            course.refresh_from_db()
            self.assertIn("Chemistry", course.search_text)

    def test_fts_title_outranks_description_only_match(self):
        with schema_context(self.schema_name):
            title_hit = self._make_course(
                title="Intro Programming",
                code="IP-1",
                description="general studies",
            )
            desc_hit = self._make_course(
                title="Unrelated Course",
                code="UR-1",
                description="intro programming basics",
            )
            qs, _ = apply_course_search_q_with_meta(Course.objects.all(), "intro programming")
            ids = list(qs.values_list("id", flat=True))
        self.assertEqual(ids[0], title_hit.id)
        self.assertIn(desc_hit.id, ids)

    def test_fts_prefix_match_finds_short_prefix(self):
        with schema_context(self.schema_name):
            course = self._make_course(title="Olympiad Maths", code="OM-1")
            qs, used_fallback = apply_course_search_q_with_meta(
                Course.objects.all(), "olymp"
            )
            ids = list(qs.values_list("id", flat=True))
        self.assertFalse(used_fallback)
        self.assertIn(course.id, ids)

    def test_fts_prefix_match_multi_token(self):
        with schema_context(self.schema_name):
            course = self._make_course(title="Olympiad Maths", code="OM-2")
            qs, used_fallback = apply_course_search_q_with_meta(
                Course.objects.all(), "olymp math"
            )
            ids = list(qs.values_list("id", flat=True))
        self.assertFalse(used_fallback)
        self.assertIn(course.id, ids)

    def test_ranking_exact_substring_outranks_partial(self):
        with schema_context(self.schema_name):
            exact_hit = self._make_course(
                title="Flyers 200 WE (6:30-8:00 PM)",
                code="F200",
            )
            partial_a = self._make_course(title="Flyers 90", code="F90")
            partial_b = self._make_course(title="Flyers 100 WD", code="F100")
            scope = Course.objects.filter(
                id__in=[exact_hit.id, partial_a.id, partial_b.id]
            )
            qs, used_fallback = apply_course_search_q_with_meta(scope, "flyers 200")
            titles = list(qs.values_list("title", flat=True))
        self.assertFalse(used_fallback)
        self.assertEqual(titles, ["Flyers 200 WE (6:30-8:00 PM)"])
        self.assertEqual(qs.first().id, exact_hit.id)

    def test_fts_first_no_fallback_when_any_hit(self):
        with schema_context(self.schema_name):
            match = self._make_course(title="Flyers 200 WE", code="F200B")
            partial = self._make_course(title="Flyers 90", code="F90B")
            other = self._make_course(title="Geometry Basics", code="GB-1")
            scope = Course.objects.filter(id__in=[match.id, partial.id, other.id])
            qs, used_fallback = apply_course_search_q_with_meta(scope, "flyers 200")
            ids = list(qs.values_list("id", flat=True))
        self.assertFalse(used_fallback)
        self.assertEqual(ids, [match.id])

    @override_settings(
        COURSE_SEARCH_FALLBACK_MIN_RESULTS=10,
        COURSE_SEARCH_TRIGRAM_THRESHOLD=0.1,
    )
    def test_trigram_fallback_when_fts_sparse(self):
        with schema_context(self.schema_name):
            self._make_course(title="Algerba Workshop", code="AW-1")
            qs, used_fallback = apply_course_search_q_with_meta(
                Course.objects.all(), "algerba"
            )
            titles = list(qs.values_list("title", flat=True))
        self.assertTrue(used_fallback)
        self.assertIn("Algerba Workshop", titles)

    def test_accent_insensitive_search(self):
        with schema_context(self.schema_name):
            self._make_course(title="Café Basics", code="CB-1")
            qs, _ = apply_course_search_q_with_meta(Course.objects.all(), "cafe")
            titles = list(qs.values_list("title", flat=True))
        self.assertIn("Café Basics", titles)

    def test_suggest_requires_two_characters(self):
        with schema_context(self.schema_name):
            self._make_course(title="Alpha Course", code="A-1")
            qs = course_suggest_queryset(Course.objects.all(), "a")
        self.assertEqual(qs.count(), 0)


    def test_compute_course_search_text_includes_program(self):
        with schema_context(self.schema_name):
            course = Course.objects.select_related("program").first()
            if not course:
                course = self._make_course(title="Tmp")
            text = compute_course_search_text(course)
            if course.program:
                self.assertIn(course.program.name, text)

    def test_serializer_create_sets_search_text_without_refresh_update(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_microsoft_on=False
            )
            tenant = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            category = Category.objects.first() or Category.objects.create(
                name=f"Cat {uuid4().hex[:4]}"
            )
            program, _ = Program.objects.get_or_create(
                name=f"ProgSer {uuid4().hex[:6]}",
                defaults={
                    "course_creation_method": Program.CourseCreationMethod.MANUAL,
                    "subject_strategy": Program.SubjectStrategy.NONE,
                },
            )
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
                "title": f"SerSearch {uuid4().hex[:8]}",
                "start_date": str(start),
                "end_date": str(start + timedelta(days=10)),
                "program": program.id,
                "category": category.id,
                "create_microsoft_team": False,
            }
            with CaptureQueriesContext(connection) as ctx:
                ser = CourseSerializer(data=payload, context={"request": request})
                self.assertTrue(ser.is_valid(), ser.errors)
                course = ser.save()
            course.refresh_from_db()
            self.assertIn(program.name, course.search_text)
            self.assertIn(category.name, course.search_text)
            update_search = [
                " ".join(q["sql"].split())
                for q in ctx.captured_queries
                if " ".join(q["sql"].split()).upper().startswith("UPDATE")
                and "SEARCH_TEXT" in q["sql"].upper()
            ]
            self.assertEqual(update_search, [])

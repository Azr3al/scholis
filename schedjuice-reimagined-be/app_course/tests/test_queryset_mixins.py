import unittest

from django.db import connection
from django.test import SimpleTestCase

from app_attendance.models import UserEvent
from app_attendance.views import AttendanceSearchView
from app_course import models
from app_course.views import CourseSearchView, SubmissionSearchView
from utilitas.views import BaseView

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
class QuerysetMixinRegressionTest(SimpleTestCase):
    def test_attendance_search_event_course_expand_no_prefetch_collision(self):
        view = AttendanceSearchView()
        expand = ["event.course"]
        translated = view.translate_expand_params(expand)
        self.assertNotIn("event", translated)
        self.assertNotIn("event__course", translated)

        qs = UserEvent.objects.none()
        view.augment_search_queryset(qs, expand, False)

    def test_submission_search_assignment_course_expand_no_prefetch_collision(self):
        view = SubmissionSearchView()
        expand = ["assignment.course"]
        translated = view.translate_expand_params(expand)
        self.assertNotIn("assignment", translated)
        self.assertNotIn("assignment__course", translated)

        qs = view.model.objects.none()
        view.augment_search_queryset(qs, expand, False)

    def test_course_search_strips_primary_teacher_from_expand(self):
        view = CourseSearchView()
        translated = view.translate_expand_params(
            ["category", "primary_teacher", "course_subjects.subject"]
        )
        self.assertIn("category", translated)
        self.assertNotIn("course_subjects", translated)
        self.assertNotIn("course_subjects__subject", translated)
        self.assertNotIn("primary_teacher", translated)

    def test_course_search_hub_expand_strips_optimized_lookups(self):
        view = CourseSearchView()
        hub_expand = [
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
        translated = view.translate_expand_params(hub_expand)
        self.assertIn("category", translated)
        self.assertIn("subject", translated)
        self.assertIn("level", translated)
        self.assertIn("section", translated)
        for stripped in (
            "created_by",
            "intake",
            "program",
            "course_subjects",
            "course_subjects__subject",
        ):
            self.assertNotIn(stripped, translated)


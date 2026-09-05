from django.test import SimpleTestCase

from app_course import models
from utilitas.views import split_expand_for_orm


class SplitExpandForOrmTest(SimpleTestCase):
    def test_pure_fk_goes_to_select_related(self):
        sr, pr = split_expand_for_orm(models.Course, ["category", "program"])
        self.assertEqual(sorted(sr), ["category", "program"])
        self.assertEqual(pr, [])

    def test_fk_chain_goes_to_select_related(self):
        sr, pr = split_expand_for_orm(models.Course, ["program__name"])
        # program is FK; "name" is not a relation — invalid path falls back to prefetch
        self.assertEqual(sr, [])
        self.assertEqual(pr, ["program__name"])

    def test_fk_to_fk_chain_goes_to_select_related(self):
        sr, pr = split_expand_for_orm(
            models.CourseSubject, ["course__program"]
        )
        self.assertEqual(sr, ["course__program"])
        self.assertEqual(pr, [])

    def test_reverse_relation_goes_to_prefetch(self):
        sr, pr = split_expand_for_orm(models.Course, ["course_subjects"])
        self.assertEqual(sr, [])
        self.assertEqual(pr, ["course_subjects"])

    def test_reverse_with_fk_suffix_goes_to_prefetch(self):
        sr, pr = split_expand_for_orm(
            models.Course, ["course_subjects__subject"]
        )
        self.assertEqual(sr, [])
        self.assertEqual(pr, ["course_subjects__subject"])

    def test_unknown_field_goes_to_prefetch(self):
        sr, pr = split_expand_for_orm(models.Course, ["not_a_field"])
        self.assertEqual(sr, [])
        self.assertEqual(pr, ["not_a_field"])

    def test_empty_lookups(self):
        sr, pr = split_expand_for_orm(models.Course, [])
        self.assertEqual(sr, [])
        self.assertEqual(pr, [])

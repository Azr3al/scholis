from django.test import SimpleTestCase

from app_course.course_status import (
    effective_active_course_sql,
    effective_planned_or_active_course_sql,
)


class EffectivePlannedOrActiveCourseSqlTests(SimpleTestCase):
    def test_planned_or_active_includes_future_start_within_planned_branch(self):
        sql = effective_planned_or_active_course_sql("c")
        self.assertIn("start_date > CURRENT_DATE", sql)
        self.assertIn("status_override", sql)

    def test_planned_or_active_includes_active_branch(self):
        sql = effective_planned_or_active_course_sql("c")
        self.assertIn(effective_active_course_sql("c"), sql)

    def test_active_only_sql_excludes_future_start(self):
        sql = effective_active_course_sql("c")
        self.assertIn("start_date <= CURRENT_DATE", sql)
        self.assertNotIn("start_date > CURRENT_DATE", sql)

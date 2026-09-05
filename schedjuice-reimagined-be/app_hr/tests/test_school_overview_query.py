from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_hr.school_overview_query import (
    enrich_school_overview_courses,
    filter_school_overview_courses,
    paginate_school_overview_courses,
    sort_school_overview_courses,
)


def _row(**kwargs):
    base = {
        "course_id": 1,
        "course_title": "IELTS Morning",
        "course_code": "IEL-01",
        "subject_names": "English",
        "mt_name": "Aung Aung, Mya Mya",
        "total_income": "100.00",
        "total_expense": "40.00",
        "total_profit": "60.00",
    }
    base.update(kwargs)
    return base


class FilterSortPageTests(SimpleTestCase):
    @patch(
        "app_hr.school_overview_query._hub_search_match_ids",
        return_value=set(),
    )
    def test_filter_matches_mt_and_subject(self, _hub):
        rows = [
            _row(course_id=1, mt_name="Aung Aung", subject_names="Math"),
            _row(
                course_id=2,
                course_title="Other",
                mt_name="Zaw",
                subject_names="Physics",
            ),
        ]
        self.assertEqual(
            [r["course_id"] for r in filter_school_overview_courses(rows, "aung")],
            [1],
        )
        self.assertEqual(
            [r["course_id"] for r in filter_school_overview_courses(rows, "phys")],
            [2],
        )

    def test_filter_blank_q_returns_all(self):
        rows = [_row(course_id=1), _row(course_id=2)]
        self.assertEqual(len(filter_school_overview_courses(rows, "  ")), 2)

    def test_sort_profit_desc(self):
        rows = [
            _row(course_id=1, total_profit="10.00"),
            _row(course_id=2, total_profit="30.00"),
        ]
        out = sort_school_overview_courses(rows, ["-total_profit"])
        self.assertEqual([r["course_id"] for r in out], [2, 1])

    def test_sort_default_title_asc(self):
        rows = [
            _row(course_id=2, course_title="Beta"),
            _row(course_id=1, course_title="Alpha"),
        ]
        out = sort_school_overview_courses(rows, None)
        self.assertEqual([r["course_id"] for r in out], [1, 2])

    def test_paginate(self):
        rows = [_row(course_id=i) for i in range(1, 6)]
        page, count = paginate_school_overview_courses(rows, page=2, size=2)
        self.assertEqual(count, 5)
        self.assertEqual([r["course_id"] for r in page], [3, 4])


class EnrichSchoolOverviewCoursesTests(SimpleTestCase):
    @patch("app_hr.school_overview_query.UserCourse.objects.filter")
    @patch("app_hr.school_overview_query.Course.objects.filter")
    def test_enrich_adds_code_subject_mt(self, mock_courses, mock_ucs):
        course = MagicMock()
        course.id = 10
        course.title = "Algebra"
        course.code = "ALG-1"
        course.subject = MagicMock()
        course.subject.name = "Math"
        course.course_subjects.all.return_value = []
        mock_courses.return_value.select_related.return_value.prefetch_related.return_value = [
            course
        ]

        uc = MagicMock()
        uc.course_id = 10
        uc.user.name = "Daw Mya"
        mock_ucs.return_value.select_related.return_value.order_by.return_value = [uc]

        rows = [
            {
                "course_id": 10,
                "course_title": "",
                "total_income": "1.00",
                "total_expense": "0.50",
                "total_profit": "0.50",
            }
        ]
        out = enrich_school_overview_courses(rows)
        self.assertEqual(out[0]["course_title"], "Algebra")
        self.assertEqual(out[0]["course_code"], "ALG-1")
        self.assertEqual(out[0]["subject_names"], "Math")
        self.assertEqual(out[0]["mt_name"], "Daw Mya")
        self.assertEqual(out[0]["total_income"], "1.00")

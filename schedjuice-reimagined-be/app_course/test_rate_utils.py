"""Unit tests for teacher hourly rate resolution (course_rates vs UserCourse vs per_hour)."""

from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_course.rate_utils import (
    build_user_course_teacher_hourly_rate_lookup,
    get_hourly_rate_for_teacher_course,
    is_session_based_payroll,
)


from app_organization.models import Organization


def _org(supports_course_specific: bool, payroll_strategy=None):
    o = MagicMock()
    o.supports_course_specific_rates = supports_course_specific
    o.payroll_calculation_strategy = payroll_strategy
    return o


def _user(pk=1, per_hour=Decimal("50"), course_rates=None):
    u = MagicMock()
    u.pk = pk
    u.per_hour_rate = per_hour
    u.course_rates = course_rates
    return u


def _course(pk=10, category_id=1):
    c = MagicMock()
    c.pk = pk
    c.category_id = category_id
    return c


class IsSessionBasedPayrollTests(SimpleTestCase):
    def test_returns_true_for_session_based_strategy(self):
        org = _org(False, Organization.PayrollCalculationStrategy.SESSION_BASED)
        self.assertTrue(is_session_based_payroll(org))

    def test_returns_false_for_tr_phillips_strategy(self):
        org = _org(False, Organization.PayrollCalculationStrategy.TR_PHILLIPS)
        self.assertFalse(is_session_based_payroll(org))

    def test_returns_false_when_organization_is_none(self):
        self.assertFalse(is_session_based_payroll(None))

    def test_returns_false_when_strategy_missing(self):
        org = MagicMock(spec=[])
        self.assertFalse(is_session_based_payroll(org))


class GetHourlyRateForTeacherCourseTests(SimpleTestCase):
    def test_legacy_org_uses_per_hour_only(self):
        user = _user(course_rates={"1": "999"})
        course = _course()
        org = _org(False)
        self.assertEqual(
            get_hourly_rate_for_teacher_course(user, course, org),
            Decimal("50"),
        )

    def test_lookup_user_course_hourly_wins_over_course_rates(self):
        user = _user(course_rates={"1": "200"})
        course = _course()
        org = _org(True)
        lookup = {(1, 10): Decimal("99")}
        self.assertEqual(
            get_hourly_rate_for_teacher_course(
                user, course, org, user_course_hourly_rate_lookup=lookup
            ),
            Decimal("99"),
        )

    def test_lookup_falls_back_to_course_rates_when_not_in_lookup(self):
        user = _user(course_rates={"1": "200"})
        course = _course()
        org = _org(True)
        self.assertEqual(
            get_hourly_rate_for_teacher_course(
                user, course, org, user_course_hourly_rate_lookup={}
            ),
            Decimal("200"),
        )

    def test_lookup_falls_back_to_per_hour_when_no_course_rates(self):
        user = _user(course_rates=None)
        course = _course()
        org = _org(True)
        self.assertEqual(
            get_hourly_rate_for_teacher_course(
                user, course, org, user_course_hourly_rate_lookup={}
            ),
            Decimal("50"),
        )

    @patch("app_course.rate_utils.UserCourse.objects.filter")
    def test_db_path_user_course_hourly_wins(self, mock_filter):
        user = _user(course_rates={"1": "200"})
        course = _course()
        org = _org(True)
        mock_qs = MagicMock()
        mock_filter.return_value = mock_qs
        mock_qs.first.return_value = MagicMock(hourly_rate=Decimal("75"))
        self.assertEqual(
            get_hourly_rate_for_teacher_course(user, course, org),
            Decimal("75"),
        )

    @patch("app_course.rate_utils.UserCourse.objects.filter")
    def test_db_path_course_rates_when_uc_hourly_null(self, mock_filter):
        user = _user(course_rates={"1": "200"})
        course = _course()
        org = _org(True)
        mock_qs = MagicMock()
        mock_filter.return_value = mock_qs
        mock_qs.first.return_value = MagicMock(hourly_rate=None)
        self.assertEqual(
            get_hourly_rate_for_teacher_course(user, course, org),
            Decimal("200"),
        )

    @patch("app_course.rate_utils.UserCourse.objects.filter")
    def test_db_path_per_hour_when_no_uc_rate_and_no_course_rates(self, mock_filter):
        user = _user(course_rates=None)
        course = _course()
        org = _org(True)
        mock_qs = MagicMock()
        mock_filter.return_value = mock_qs
        mock_qs.first.return_value = None
        self.assertEqual(
            get_hourly_rate_for_teacher_course(user, course, org),
            Decimal("50"),
        )


class BuildLookupIntegrationTests(SimpleTestCase):
    """build_user_course_teacher_hourly_rate_lookup + get_hourly_rate matches semantics."""

    @patch("app_course.rate_utils.UserCourse.objects.filter")
    def test_lookup_plus_course_rates_chain(self, mock_filter):
        user = _user(course_rates={"1": "200"})
        course = _course()
        org = _org(True)
        mock_qs = MagicMock()
        mock_filter.return_value = mock_qs
        mock_qs.values_list.return_value = []
        lookup = build_user_course_teacher_hourly_rate_lookup([(1, 10)])
        self.assertEqual(lookup, {})
        self.assertEqual(
            get_hourly_rate_for_teacher_course(
                user, course, org, user_course_hourly_rate_lookup=lookup
            ),
            Decimal("200"),
        )

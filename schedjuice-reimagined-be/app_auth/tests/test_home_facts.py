from __future__ import annotations

from datetime import datetime, timezone as dt_timezone
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_auth.home_facts_services import build_home_facts


class BuildHomeFactsPermissionTests(SimpleTestCase):
    @patch("app_auth.home_facts_services.UserEvent")
    @patch("app_auth.home_facts_services.Event")
    @patch("app_auth.home_facts_services.apply_effective_status_filter")
    @patch("app_auth.home_facts_services.actively_enrolled_students_qs")
    @patch("app_auth.home_facts_services.User")
    @patch("app_auth.home_facts_services.get_tenant_day_boundaries")
    @patch("app_auth.home_facts_services.get_tenant_today_ymd")
    @patch("app_auth.home_facts_services.effective_permissions")
    def test_returns_empty_when_course_breadth_missing(
        self,
        mock_effective_permissions,
        mock_today_ymd,
        mock_day_bounds,
        mock_user_model,
        mock_students_qs,
        mock_apply_status,
        mock_event,
        mock_user_event,
    ):
        mock_effective_permissions.return_value = frozenset({"user.view_all"})
        user = MagicMock()
        org = MagicMock(timezone="UTC", use_teacher_session_checkin=False)

        payload = build_home_facts(
            user,
            org,
            now=datetime(2026, 1, 15, 12, 0, tzinfo=dt_timezone.utc),
        )

        self.assertEqual(payload, {})
        mock_user_model.objects.filter.assert_not_called()

    @patch("app_auth.home_facts_services.UserEvent")
    @patch("app_auth.home_facts_services.Event")
    @patch("app_auth.home_facts_services.apply_effective_status_filter")
    @patch("app_auth.home_facts_services.actively_enrolled_students_qs")
    @patch("app_auth.home_facts_services.User")
    @patch("app_auth.home_facts_services.get_tenant_day_boundaries")
    @patch("app_auth.home_facts_services.get_tenant_today_ymd")
    @patch("app_auth.home_facts_services.effective_permissions")
    def test_includes_checkin_rollups_when_flag_and_permission(
        self,
        mock_effective_permissions,
        mock_today_ymd,
        mock_day_bounds,
        mock_user_model,
        mock_students_qs,
        mock_apply_status,
        mock_event,
        mock_user_event,
    ):
        mock_effective_permissions.return_value = frozenset(
            {"user.view_all", "course.view_all", "checkin.view_all"}
        )
        mock_today_ymd.return_value = "2026-01-15"
        mock_day_bounds.return_value = ("2026-01-15T00:00:00+00:00", "2026-01-15T23:59:59+00:00")

        staff_qs = MagicMock()
        staff_qs.count.return_value = 4
        mock_user_model.objects.filter.return_value = staff_qs

        students_qs = MagicMock()
        students_qs.count.return_value = 100
        mock_students_qs.return_value = students_qs

        courses_qs = MagicMock()
        courses_qs.count.return_value = 12
        mock_apply_status.return_value = courses_qs

        events_qs = MagicMock()
        events_qs.count.return_value = 9
        events_qs.filter.return_value = events_qs
        mock_event.objects.filter.return_value = events_qs

        ue_qs = MagicMock()
        ue_qs.filter.return_value = ue_qs
        ue_qs.values.return_value = ue_qs
        ue_qs.distinct.return_value = ue_qs
        ue_qs.count.side_effect = [6, 3]
        mock_user_event.objects.filter.return_value = ue_qs

        org = MagicMock(timezone="UTC", use_teacher_session_checkin=True)
        payload = build_home_facts(
            MagicMock(),
            org,
            now=datetime(2026, 1, 15, 12, 0, tzinfo=dt_timezone.utc),
        )

        self.assertEqual(payload["staff"], 4)
        self.assertEqual(payload["students"], 100)
        self.assertEqual(payload["courses"], 12)
        self.assertEqual(payload["sessions_today"], 9)
        self.assertEqual(payload["expected_staff_today"], 6)
        self.assertEqual(payload["checked_in_today"], 3)

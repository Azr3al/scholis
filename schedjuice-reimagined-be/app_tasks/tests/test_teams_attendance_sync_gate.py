"""Unit tests for Teams attendance sync org flag gating."""

import importlib
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.core.management import call_command

from app_tasks.sync_attendance_helpers import (
    course_eligible_for_teams_attendance_sync,
    sync_attendance_for_course,
    tenant_teams_attendance_sync_enabled,
)

def _command_module():
    return importlib.import_module("app_tasks.management.commands.sync-meeting-attendance")

def _tenant(**overrides):
    base = dict(
        is_microsoft_on=True,
        is_teams_attendance_sync_enabled=False,
        schema_name="test_tenant",
        video_conferencing_platform=None,
    )
    base.update(overrides)
    tenant = SimpleNamespace(**base)
    tenant.has_active_zoom_account = lambda: overrides.get("has_active_zoom_account", False)
    return tenant

def _course(**overrides):
    base = dict(id=1, microsoft_meeting_id="meeting-1")
    base.update(overrides)
    return SimpleNamespace(**base)

class TenantTeamsAttendanceSyncEnabledTests(unittest.TestCase):
    def test_requires_both_flags(self):
        self.assertFalse(tenant_teams_attendance_sync_enabled(_tenant()))
        self.assertFalse(
            tenant_teams_attendance_sync_enabled(
                _tenant(is_teams_attendance_sync_enabled=True, is_microsoft_on=False)
            )
        )
        self.assertTrue(
            tenant_teams_attendance_sync_enabled(
                _tenant(is_teams_attendance_sync_enabled=True)
            )
        )

class CourseEligibleForTeamsAttendanceSyncTests(unittest.TestCase):
    def test_requires_meeting_id(self):
        tenant = _tenant(is_teams_attendance_sync_enabled=True)
        self.assertFalse(
            course_eligible_for_teams_attendance_sync(
                _course(microsoft_meeting_id=""), tenant
            )
        )
        self.assertTrue(course_eligible_for_teams_attendance_sync(_course(), tenant))

class SyncAttendanceForCourseGateTests(unittest.TestCase):
    def test_skips_graph_when_flag_off(self):
        course = _course()
        tenant = _tenant(is_teams_attendance_sync_enabled=False)
        with patch("app_tasks.sync_attendance_helpers.MSMeeting") as mock_meeting:
            result = sync_attendance_for_course(course, tenant)
        self.assertEqual(result, 0)
        mock_meeting.assert_not_called()

class SyncMeetingAttendanceCommandTests(unittest.TestCase):
    def test_does_not_queue_teams_when_flag_off(self):
        cmd_mod = _command_module()
        org = _tenant(is_teams_attendance_sync_enabled=False, has_active_zoom_account=True)
        course = _course()

        with patch.object(cmd_mod, "_get_current_org", return_value=org), patch.object(
            cmd_mod, "schema_context"
        ) as mock_schema, patch.object(cmd_mod, "Course") as mock_course_model, patch.object(
            cmd_mod,
            "course_eligible_for_zoom_attendance_sync",
            return_value=True,
        ), patch.object(
            cmd_mod, "sync_attendance_for_course_async"
        ) as mock_teams_async, patch.object(
            cmd_mod, "sync_zoom_attendance_for_course_async"
        ) as mock_zoom_async:
            mock_course_model.objects.filter.return_value = [course]
            mock_schema.return_value.__enter__ = MagicMock(return_value=None)
            mock_schema.return_value.__exit__ = MagicMock(return_value=False)
            call_command("sync-meeting-attendance")

        mock_teams_async.delay.assert_not_called()
        mock_zoom_async.delay.assert_called_once_with(course.id, org.schema_name)

    def test_exits_early_when_teams_and_zoom_disabled(self):
        cmd_mod = _command_module()
        org = _tenant(is_teams_attendance_sync_enabled=False)

        with patch.object(cmd_mod, "_get_current_org", return_value=org), patch.object(
            cmd_mod, "Course"
        ) as mock_course_model, patch.object(
            cmd_mod, "sync_attendance_for_course_async"
        ) as mock_teams_async:
            call_command("sync-meeting-attendance")

        mock_course_model.objects.filter.assert_not_called()
        mock_teams_async.delay.assert_not_called()

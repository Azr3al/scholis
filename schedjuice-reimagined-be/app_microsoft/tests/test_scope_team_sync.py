from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_auth.models import User
from app_microsoft.scope_team_sync import (
    reconcile_scope_owner_for_user_course,
    schedule_scoped_team_owner_reconcile_for_user_after_commit,
    sync_scoped_team_owners_for_course,
)


def _course(**kwargs):
    course = MagicMock()
    course.id = kwargs.get("id", 1)
    course.microsoft_group_id = kwargs.get("microsoft_group_id", "grp-1")
    course.program_id = kwargs.get("program_id", 2)
    course.category_id = kwargs.get("category_id", 3)
    return course


class SyncScopedTeamOwnersForCourseTest(SimpleTestCase):
    @patch("app_microsoft.scope_team_sync.MSGroup")
    @patch("app_microsoft.scope_team_sync.tenant_syncs_course_team_roster", return_value=True)
    @patch("app_microsoft.scope_team_sync.users_with_scope_for_course")
    @patch("app_microsoft.scope_team_sync.teaching_owner_user_ids", return_value=set())
    def test_adds_scoped_users_as_owners(
        self,
        _teaching,
        mock_users,
        _tenant_sync,
        mock_group_cls,
    ):
        course = _course()
        user = User(id=9, microsoft_id="ms-9")
        mock_users.return_value = [user]
        mock_group = mock_group_cls.return_value

        with patch(
            "app_microsoft.scope_team_sync.course_is_effectively_planned_or_active",
            return_value=True,
        ):
            sync_scoped_team_owners_for_course(course, tenant=MagicMock())

        mock_group.add_member.assert_called_once_with("ms-9", "grp-1", "owners")

    @patch("app_microsoft.scope_team_sync.MSGroup")
    @patch("app_microsoft.scope_team_sync.tenant_syncs_course_team_roster", return_value=True)
    @patch("app_microsoft.scope_team_sync.course_is_effectively_planned_or_active", return_value=False)
    @patch("app_microsoft.scope_team_sync.users_with_scope_for_course")
    def test_sync_course_skips_entirely_when_not_planned_or_active(
        self, mock_users, _planned, _tenant_sync, mock_group_cls
    ):
        sync_scoped_team_owners_for_course(_course(), tenant=MagicMock())
        mock_users.assert_not_called()
        mock_group_cls.assert_not_called()


class ReconcileScopeOwnerForUserCourseTest(SimpleTestCase):
    @patch("app_microsoft.scope_team_sync.MSGroup")
    @patch("app_microsoft.scope_team_sync.tenant_syncs_course_team_roster", return_value=True)
    @patch("app_microsoft.scope_team_sync.user_matches_course_scope", return_value=False)
    @patch("app_microsoft.scope_team_sync.UserCourse.objects.filter")
    def test_removes_owner_when_scope_dropped_and_not_teaching(
        self,
        mock_uc_filter,
        _match,
        _tenant_sync,
        mock_group_cls,
    ):
        course = _course()
        user = User(id=9, microsoft_id="ms-9")
        mock_uc_filter.return_value.exists.return_value = False
        mock_group = mock_group_cls.return_value

        reconcile_scope_owner_for_user_course(user, course, tenant=MagicMock())

        mock_group.remove_member.assert_called_once_with("grp-1", "ms-9", "owners")

    @patch("app_microsoft.scope_team_sync.MSGroup")
    @patch("app_microsoft.scope_team_sync.tenant_syncs_course_team_roster", return_value=True)
    @patch("app_microsoft.scope_team_sync.user_matches_course_scope", return_value=True)
    @patch("app_microsoft.scope_team_sync.course_is_effectively_planned_or_active", return_value=False)
    @patch("app_microsoft.scope_team_sync.UserCourse.objects.filter")
    def test_skips_add_when_course_not_planned_or_active(
        self, mock_uc_filter, _planned, _match, _tenant_sync, mock_group_cls
    ):
        course = _course()
        user = User(id=9, microsoft_id="ms-9")
        mock_uc_filter.return_value.exists.return_value = False
        mock_group = mock_group_cls.return_value

        reconcile_scope_owner_for_user_course(user, course, tenant=MagicMock())

        mock_group.add_member.assert_not_called()
        mock_group.remove_member.assert_not_called()

    @patch("app_microsoft.scope_team_sync.MSGroup")
    @patch("app_microsoft.scope_team_sync.tenant_syncs_course_team_roster", return_value=True)
    @patch("app_microsoft.scope_team_sync.user_matches_course_scope", return_value=True)
    @patch("app_microsoft.scope_team_sync.course_is_effectively_planned_or_active", return_value=True)
    @patch("app_microsoft.scope_team_sync.UserCourse.objects.filter")
    def test_adds_when_planned_or_active(
        self, mock_uc_filter, _planned, _match, _tenant_sync, mock_group_cls
    ):
        course = _course()
        user = User(id=9, microsoft_id="ms-9")
        mock_uc_filter.return_value.exists.return_value = False
        mock_group = mock_group_cls.return_value

        reconcile_scope_owner_for_user_course(user, course, tenant=MagicMock())

        mock_group.add_member.assert_called_once_with("ms-9", "grp-1", "owners")


class SyncScopedTeamOwnerFanOutTest(SimpleTestCase):
    @patch("app_microsoft.scope_team_sync.reconcile_scope_owner_for_user_course_async")
    @patch("app_microsoft.scope_team_sync.transaction.on_commit")
    @patch("app_microsoft.scope_team_sync._affected_course_ids_with_teams", return_value=[10, 11, 12])
    @patch("app_microsoft.scope_team_sync.User.objects.filter")
    def test_fan_out_enqueues_one_task_per_course(
        self, mock_user_filter, mock_affected, mock_on_commit, mock_async
    ):
        user = MagicMock()
        user.id = 5
        user.scoped_programs.values_list.return_value = []
        user.scoped_categories.values_list.return_value = []
        mock_user_filter.return_value.first.return_value = user
        captured = []
        mock_on_commit.side_effect = lambda fn: captured.append(fn)

        schedule_scoped_team_owner_reconcile_for_user_after_commit(
            user_id=5,
            tenant=MagicMock(schema_name="xschedjuice"),
            previous_program_ids={1},
            previous_category_ids=set(),
        )
        self.assertEqual(len(captured), 1)
        captured[0]()

        self.assertEqual(mock_async.delay.call_count, 3)
        mock_async.delay.assert_any_call(10, "xschedjuice", user_id=5)
        mock_async.delay.assert_any_call(11, "xschedjuice", user_id=5)
        mock_async.delay.assert_any_call(12, "xschedjuice", user_id=5)

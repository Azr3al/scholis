from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_microsoft.repair import scan_scope_team_owner_candidates


class ScanScopeTeamOwnerCandidatesTest(SimpleTestCase):
    @patch("app_microsoft.repair.users_with_scope_for_course")
    @patch("app_microsoft.repair.teaching_owner_user_ids", return_value=set())
    @patch("app_microsoft.repair.MSGroup")
    @patch("app_microsoft.repair.apply_effective_status_filter")
    @patch("app_microsoft.repair.tenant_syncs_course_team_roster", return_value=True)
    @patch("app_microsoft.repair.Course.objects")
    def test_flags_missing_scope_owner(
        self,
        mock_course_objects,
        _tenant_sync,
        mock_apply_filter,
        mock_group_cls,
        _teaching,
        mock_users_for_course,
    ):
        course = MagicMock(
            id=10,
            title="Algebra I",
            microsoft_group_id="grp-10",
        )
        user = MagicMock(id=5, name="Dean", email="dean@test.com", microsoft_id="ms-5")
        mock_apply_filter.return_value = mock_course_objects.exclude.return_value.exclude.return_value
        mock_apply_filter.return_value.iterator.return_value = [course]
        mock_users_for_course.return_value = [user]
        mock_group_cls.return_value.list_owner_ids.return_value = set()

        candidates = scan_scope_team_owner_candidates(tenant=MagicMock())

        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["status"], "missing_owner")
        self.assertEqual(candidates[0]["candidate_key"], "10:5")

    @patch("app_microsoft.repair.users_with_scope_for_course")
    @patch("app_microsoft.repair.teaching_owner_user_ids", return_value={5})
    @patch("app_microsoft.repair.MSGroup")
    @patch("app_microsoft.repair.apply_effective_status_filter")
    @patch("app_microsoft.repair.tenant_syncs_course_team_roster", return_value=True)
    @patch("app_microsoft.repair.Course.objects")
    def test_skips_teaching_roster_owner(
        self,
        mock_course_objects,
        _tenant_sync,
        mock_apply_filter,
        mock_group_cls,
        _teaching,
        mock_users_for_course,
    ):
        course = MagicMock(
            id=10,
            title="Algebra I",
            microsoft_group_id="grp-10",
        )
        user = MagicMock(id=5, microsoft_id="ms-5")
        mock_apply_filter.return_value = mock_course_objects.exclude.return_value.exclude.return_value
        mock_apply_filter.return_value.iterator.return_value = [course]
        mock_users_for_course.return_value = [user]
        mock_group_cls.return_value.list_owner_ids.return_value = set()

        candidates = scan_scope_team_owner_candidates(tenant=MagicMock())

        self.assertEqual(candidates, [])

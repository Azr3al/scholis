from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_microsoft.graph_wrapper.group import MSGroup


class MSGroupListOwnersTest(SimpleTestCase):
    @patch("app_microsoft.graph_wrapper.group.MSGroup.get_token")
    @patch.object(MSGroup, "get")
    def test_list_owner_ids_parses_user_ids(self, mock_get, _token):
        mock_get.return_value = MagicMock(
            status_code=200,
            json=lambda: {
                "value": [
                    {"@odata.type": "#microsoft.graph.user", "id": "uid-1"},
                    {"@odata.type": "#microsoft.graph.user", "id": "uid-2"},
                ]
            },
        )
        group = MSGroup(MagicMock())
        self.assertEqual(group.list_owner_ids("grp-1"), {"uid-1", "uid-2"})

    @patch("app_microsoft.graph_wrapper.group.MSGroup.get_token")
    @patch.object(MSGroup, "get")
    def test_list_owner_ids_follows_next_link(self, mock_get, _token):
        mock_get.side_effect = [
            MagicMock(
                status_code=200,
                json=lambda: {
                    "value": [{"id": "uid-1"}],
                    "@odata.nextLink": "https://graph.microsoft.com/v1.0/groups/grp-1/owners?$skiptoken=abc",
                },
            ),
            MagicMock(
                status_code=200,
                json=lambda: {"value": [{"id": "uid-2"}]},
            ),
        ]
        group = MSGroup(MagicMock())
        self.assertEqual(group.list_owner_ids("grp-1"), {"uid-1", "uid-2"})

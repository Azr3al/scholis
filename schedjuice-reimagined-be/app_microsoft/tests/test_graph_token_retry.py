"""Tests for Graph token acquisition (app-only vs delegated service account)."""

from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch

from app_microsoft.graph_wrapper.base import BaseMSRequest, _bearer_headers
from app_microsoft.graph_wrapper.education import MSEducation
from app_microsoft.graph_wrapper.group import MSGroup
from app_microsoft.graph_wrapper.meeting import MSMeeting
from app_microsoft.graph_wrapper.user import MSUser


class BaseMSRequestGetTokenTests(TestCase):
    @patch("app_microsoft.oauth.get_valid_access_token")
    @patch("app_microsoft.delegated_auth.get_org_service_account")
    def test_get_token_use_app_auth_false_uses_service_account(
        self, mock_get_svc, mock_get_token
    ):
        svc = MagicMock()
        mock_get_svc.return_value = svc
        mock_get_token.return_value = "delegated-tok"
        tenant = SimpleNamespace(id=1)

        token = BaseMSRequest.get_token(tenant, use_app_auth=False)

        mock_get_token.assert_called_once()
        self.assertEqual(token, "delegated-tok")

    @patch("app_microsoft.graph_wrapper.base.get_msal_app")
    def test_get_token_default_uses_app_auth(self, mock_get_app):
        app = MagicMock()
        app.acquire_token_silent.return_value = None
        app.acquire_token_for_client.return_value = {"access_token": "app-tok"}
        mock_get_app.return_value = app
        tenant = SimpleNamespace(
            private_key=MagicMock(
                open=MagicMock(return_value=MagicMock(read=MagicMock(return_value=b"key")))
            ),
            app_id="app-id",
            authority="https://login.microsoftonline.com/t",
            thumbprint="abc",
        )

        token = BaseMSRequest.get_token(tenant)

        app.acquire_token_for_client.assert_called_once()
        self.assertEqual(token, "app-tok")

    def test_instance_headers_isolated(self):
        meeting_a = MSMeeting.__new__(MSMeeting)
        meeting_b = MSMeeting.__new__(MSMeeting)
        meeting_a._apply_access_token("token-a")
        meeting_b._apply_access_token("token-b")
        self.assertEqual(meeting_a.headers, _bearer_headers("token-a"))
        self.assertEqual(meeting_b.headers, _bearer_headers("token-b"))


class MSGroupAppAuthTests(TestCase):
    @patch("app_microsoft.graph_wrapper.base.get_msal_app")
    @patch("app_microsoft.delegated_auth.get_org_service_account")
    def test_msgroup_uses_app_auth_without_service_account(
        self, mock_get_svc, mock_get_app
    ):
        app = MagicMock()
        app.acquire_token_silent.return_value = None
        app.acquire_token_for_client.return_value = {"access_token": "app-tok"}
        mock_get_app.return_value = app
        tenant = SimpleNamespace(
            private_key=MagicMock(
                open=MagicMock(return_value=MagicMock(read=MagicMock(return_value=b"key")))
            ),
            app_id="app-id",
            authority="https://login.microsoftonline.com/t",
            thumbprint="abc",
        )

        group = MSGroup(tenant)

        mock_get_svc.assert_not_called()
        app.acquire_token_for_client.assert_called_once()
        self.assertEqual(group.headers, _bearer_headers("app-tok"))
        self.assertTrue(group.use_app_auth)


class MSEducationAppAuthTests(TestCase):
    @patch("app_microsoft.graph_wrapper.base.get_msal_app")
    @patch("app_microsoft.delegated_auth.get_org_service_account")
    def test_mseducation_default_uses_client_credentials(
        self, mock_get_svc, mock_get_app
    ):
        app = MagicMock()
        app.acquire_token_silent.return_value = None
        app.acquire_token_for_client.return_value = {"access_token": "app-tok"}
        mock_get_app.return_value = app
        tenant = SimpleNamespace(
            private_key=MagicMock(
                open=MagicMock(return_value=MagicMock(read=MagicMock(return_value=b"key")))
            ),
            app_id="app-id",
            authority="https://login.microsoftonline.com/t",
            thumbprint="abc",
        )

        education = MSEducation(tenant)

        mock_get_svc.assert_not_called()
        app.acquire_token_for_client.assert_called_once()
        self.assertEqual(education.headers, _bearer_headers("app-tok"))
        self.assertTrue(education.use_app_auth)

    @patch("app_microsoft.oauth.get_valid_access_token")
    @patch("app_microsoft.delegated_auth.get_org_service_account")
    def test_mseducation_use_app_auth_false_uses_delegated_token(
        self, mock_get_svc, mock_get_token
    ):
        svc = MagicMock()
        mock_get_svc.return_value = svc
        mock_get_token.return_value = "delegated-tok"
        tenant = SimpleNamespace(id=1)

        education = MSEducation(tenant, use_app_auth=False)

        mock_get_token.assert_called_once()
        self.assertEqual(education.headers, _bearer_headers("delegated-tok"))
        self.assertFalse(education.use_app_auth)


class MSUserResetPasswordDelegatedAuthTests(TestCase):
    @patch("app_microsoft.graph_wrapper.user.MSUser.post")
    @patch("app_microsoft.oauth.get_valid_access_token")
    @patch("app_microsoft.delegated_auth.get_org_service_account")
    def test_reset_password_applies_delegated_token(
        self, mock_get_svc, mock_get_token, mock_post
    ):
        svc = MagicMock()
        mock_get_svc.return_value = svc
        mock_get_token.return_value = "delegated-tok"
        mock_post.return_value = MagicMock(status_code=204)
        tenant = SimpleNamespace(id=1)

        user = MSUser.__new__(MSUser)
        user.PASSWORD_METHOD_ID = MSUser.PASSWORD_METHOD_ID
        user.URL = MSUser.URL
        user._generate_password = MagicMock(return_value="NewPass123!")
        user.headers = _bearer_headers("app-tok")
        user.use_app_auth = True

        user.reset_password("user-id", tenant)

        self.assertEqual(user.headers, _bearer_headers("delegated-tok"))
        self.assertFalse(user.use_app_auth)
        mock_post.assert_called_once()

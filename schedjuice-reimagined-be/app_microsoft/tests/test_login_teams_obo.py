"""Tests for Teams personal OAuth established at MS login via OBO."""

from unittest import TestCase
from unittest.mock import MagicMock, patch

from app_auth.models import User
from app_auth.models_user_microsoft_oauth import UserMicrosoftOAuth
from app_microsoft.oauth import GRAPH_OBO_SCOPES, connect_personal_teams_from_login_token


class TeamsLoginEligibleTests(TestCase):
    def test_skips_students(self):
        tenant = MagicMock(is_microsoft_on=True, is_teams_creation_enabled=True)
        user = MagicMock(spec=User)
        user.is_student.return_value = True

        with patch("app_microsoft.oauth.get_msal_app") as mock_get_app:
            connected, detail = connect_personal_teams_from_login_token(
                tenant, user, obo_assertion="api-token"
            )
            self.assertFalse(connected)
            self.assertEqual(detail, "student")
            mock_get_app.assert_not_called()

    def test_skips_when_teams_disabled(self):
        tenant = MagicMock(is_microsoft_on=True, is_teams_creation_enabled=False)
        user = MagicMock(spec=User)
        user.is_student.return_value = False

        with patch("app_microsoft.oauth.get_msal_app") as mock_get_app:
            connected, detail = connect_personal_teams_from_login_token(
                tenant, user, obo_assertion="api-token"
            )
            self.assertFalse(connected)
            self.assertEqual(detail, "teams_disabled")
            mock_get_app.assert_not_called()

    def test_missing_obo_assertion(self):
        tenant = MagicMock(is_microsoft_on=True, is_teams_creation_enabled=True)
        user = MagicMock(spec=User)
        user.is_student.return_value = False

        with patch("app_microsoft.oauth.get_msal_app") as mock_get_app:
            connected, detail = connect_personal_teams_from_login_token(
                tenant, user, obo_assertion=""
            )
            self.assertFalse(connected)
            self.assertEqual(detail, "missing_obo_assertion")
            mock_get_app.assert_not_called()


class TeamsLoginOboTests(TestCase):
    @patch("app_auth.models_user_microsoft_oauth.UserMicrosoftOAuth")
    @patch("app_microsoft.oauth.get_msal_app")
    def test_obo_success_upserts_credential(self, mock_get_app, mock_oauth_model):
        tenant = MagicMock(is_microsoft_on=True, is_teams_creation_enabled=True)
        user = MagicMock(spec=User)
        user.id = 7
        user.is_student.return_value = False
        user.microsoft_id = "ms-oid"
        user.email = "teacher@example.com"
        user.name = "Teacher"

        app = MagicMock()
        mock_get_app.return_value = app
        app.acquire_token_on_behalf_of.return_value = {
            "access_token": "teams-token",
            "expires_in": 3600,
            "id_token_claims": {
                "oid": "ms-oid",
                "preferred_username": "teacher@example.com",
                "name": "Teacher",
            },
        }

        cred = MagicMock()
        cred.__class__ = UserMicrosoftOAuth
        mock_oauth_model.objects.get_or_create.return_value = (cred, True)

        with patch("app_microsoft.oauth.apply_connection_from_result") as mock_apply:
            connected, detail = connect_personal_teams_from_login_token(
                tenant, user, obo_assertion="api-scoped-login-token"
            )
            self.assertTrue(connected)
            self.assertIsNone(detail)
            app.acquire_token_on_behalf_of.assert_called_once_with(
                user_assertion="api-scoped-login-token",
                scopes=list(GRAPH_OBO_SCOPES),
            )
            mock_oauth_model.objects.get_or_create.assert_called_once_with(user_id=7)
            mock_apply.assert_called_once()

    @patch("app_microsoft.oauth.get_msal_app")
    def test_obo_failure_returns_false_with_detail(self, mock_get_app):
        tenant = MagicMock(is_microsoft_on=True, is_teams_creation_enabled=True)
        user = MagicMock(spec=User)
        user.id = 7
        user.is_student.return_value = False

        app = MagicMock()
        mock_get_app.return_value = app
        app.acquire_token_on_behalf_of.return_value = {
            "error": "invalid_grant",
            "error_description": "consent required",
        }

        with patch("app_auth.models_user_microsoft_oauth.UserMicrosoftOAuth") as mock_oauth_model:
            connected, detail = connect_personal_teams_from_login_token(
                tenant, user, obo_assertion="api-scoped-login-token"
            )
            self.assertFalse(connected)
            self.assertEqual(detail, "consent required")
            mock_oauth_model.objects.get_or_create.assert_not_called()

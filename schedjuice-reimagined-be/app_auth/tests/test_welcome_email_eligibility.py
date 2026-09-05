"""Welcome email eligibility vs is_student_login_disabled (student-only scope)."""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app_auth.import_welcome import send_import_welcome_emails
from app_auth.models import User
from app_auth.serializers import UserSerializer
from app_auth.welcome_email_helpers import resend_welcome_email, should_send_welcome_email


def _tenant(*, student_login_disabled=False):
    return SimpleNamespace(
        is_microsoft_on=False,
        is_student_login_disabled=student_login_disabled,
        schema_name="xschedjuice",
    )


def _request(tenant):
    return SimpleNamespace(
        tenant=tenant,
        query_params=SimpleNamespace(getlist=lambda _field: []),
    )


def _user(*, student=False, waiting=False):
    user = MagicMock()
    user.is_student.return_value = student
    user.is_waiting_for_activation = waiting
    user.communication_email = "to@example.com"
    user.email = "login@example.com"
    user.name = "Person"
    return user


class ShouldSendWelcomeEmailTests(unittest.TestCase):
    def test_staff_allowed_when_student_login_disabled(self):
        self.assertTrue(
            should_send_welcome_email(_user(student=False), _tenant(student_login_disabled=True))
        )

    def test_student_blocked_when_student_login_disabled(self):
        self.assertFalse(
            should_send_welcome_email(_user(student=True), _tenant(student_login_disabled=True))
        )

    def test_student_allowed_when_student_login_enabled(self):
        self.assertTrue(
            should_send_welcome_email(_user(student=True), _tenant(student_login_disabled=False))
        )


class UserCreateWelcomeEmailTests(unittest.TestCase):
    def _run_create(self, *, roles, tenant, created_user):
        def fake_super_create(validated_data):
            return created_user

        ser = UserSerializer(context={"request": _request(tenant)})
        validated_data = {
            "email": "person@good.com",
            "name": "Person",
            "password": "pw-12345",
            "roles": roles,
            "custom_data": {},
        }

        with patch.object(User, "get_user_from_request", return_value=None), patch(
            "app_auth.serializers.refresh_profile_completeness"
        ), patch("app_auth.serializers.validate_user_custom_data_for_write"), patch(
            "utilitas.serializers.BaseModelSerializer.create",
            side_effect=fake_super_create,
        ), patch("app_auth.serializers.Visibility"), patch(
            "app_auth.serializers.async_task"
        ) as mock_async:
            ser.create(validated_data)
        return mock_async

    def test_teacher_welcome_email_when_student_login_disabled(self):
        mock_async = self._run_create(
            roles=[User.UserRole.TEACHER],
            tenant=_tenant(student_login_disabled=True),
            created_user=_user(student=False),
        )
        mock_async.assert_called_once()

    def test_student_skips_welcome_email_when_student_login_disabled(self):
        mock_async = self._run_create(
            roles=[User.UserRole.STUDENT],
            tenant=_tenant(student_login_disabled=True),
            created_user=_user(student=True),
        )
        mock_async.assert_not_called()

    def test_student_welcome_email_when_student_login_enabled(self):
        mock_async = self._run_create(
            roles=[User.UserRole.STUDENT],
            tenant=_tenant(student_login_disabled=False),
            created_user=_user(student=True),
        )
        mock_async.assert_called_once()


class ImportWelcomeEmailTests(unittest.TestCase):
    @patch("app_auth.import_welcome.async_task")
    @patch("app_auth.import_welcome.User.objects.filter")
    def test_queues_only_non_students_when_student_login_disabled(
        self, mock_filter, mock_async
    ):
        teacher = _user(student=False)
        teacher.id = 1
        student = _user(student=True)
        student.id = 2
        mock_filter.return_value = [teacher, student]

        send_import_welcome_emails(_tenant(student_login_disabled=True), [1, 2])

        mock_async.assert_called_once()
        self.assertEqual(mock_async.call_args[0][1], teacher.communication_email)


class ResendWelcomeEmailTests(unittest.TestCase):
    @patch("app_auth.welcome_email_helpers.send_user_welcome_email_resend", return_value=200)
    def test_teacher_resend_when_student_login_disabled(self, mock_send):
        result = resend_welcome_email(_user(student=False), _tenant(student_login_disabled=True))
        mock_send.assert_called_once()
        self.assertEqual(result["mail_status_code"], 200)

    def test_student_resend_raises_when_student_login_disabled(self):
        with self.assertRaises(ValueError):
            resend_welcome_email(_user(student=True), _tenant(student_login_disabled=True))


if __name__ == "__main__":
    unittest.main()

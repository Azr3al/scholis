from unittest import mock

from django.test import SimpleTestCase

from app_auth.user_scoping import user_can_access_user


class CanViewCompletenessTests(SimpleTestCase):
    def test_self_can_view(self):
        actor = mock.Mock(id=1, roles=["student"], is_authenticated=True)
        target = mock.Mock(id=1)
        with mock.patch(
            "app_auth.user_scoping.effective_permissions",
            return_value=frozenset({"user.view"}),
        ):
            self.assertTrue(user_can_access_user(actor, target))

    def test_manager_can_view_other(self):
        actor = mock.Mock(id=1, roles=["manager"])
        target = mock.Mock(id=2)
        with mock.patch(
            "app_auth.user_scoping.effective_permissions",
            return_value=frozenset({"user.view_all"}),
        ):
            self.assertTrue(user_can_access_user(actor, target))

    def test_student_cannot_view_other(self):
        actor = mock.Mock(id=1, roles=["student"])
        target = mock.Mock(id=2)
        with mock.patch(
            "app_auth.user_scoping.user_is_connected_to_user", return_value=False
        ):
            with mock.patch(
                "app_auth.user_scoping.effective_permissions",
                return_value=frozenset({"user.view"}),
            ):
                self.assertFalse(user_can_access_user(actor, target))

    def test_none_actor_cannot_view(self):
        target = mock.Mock(id=2)
        self.assertFalse(user_can_access_user(None, target))

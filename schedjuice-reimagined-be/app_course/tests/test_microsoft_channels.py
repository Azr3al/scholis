from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.exceptions import PermissionDenied

from app_auth.models import User
from app_course.views import CourseMicrosoftChannelsView

class CourseMicrosoftChannelsViewTests(SimpleTestCase):

    def test_returns_empty_when_course_not_linked(self):
        view = CourseMicrosoftChannelsView()
        request = SimpleNamespace(
            tenant=SimpleNamespace(is_microsoft_on=True),
            user=SimpleNamespace(id="admin@example.com"),
        )
        course = SimpleNamespace(id=5, microsoft_group_id=None)
        with patch.object(
            CourseMicrosoftChannelsView,
            "check_permissions",
            return_value=None,
        ), patch(
            "app_course.views.models.Course.objects.filter"
        ) as mock_filter, patch.object(
            view, "ok", side_effect=lambda data, **kwargs: data
        ):
            mock_filter.return_value.first.return_value = course
            result = view.get(request, course_id=5)

        self.assertEqual(result, [])

    @patch("app_course.views.check_course_write")
    @patch("app_course.views.acting_user")
    def test_check_permissions_allows_admin_without_course_connection(
        self, mock_acting_user, mock_check_course_write
    ):
        view = CourseMicrosoftChannelsView()
        view.kwargs = {"course_id": 5}
        admin = SimpleNamespace(roles=[User.UserRole.ADMIN])
        mock_acting_user.return_value = admin
        course = SimpleNamespace(id=5)
        request = SimpleNamespace()

        with patch.object(
            CourseMicrosoftChannelsView.__bases__[0],
            "check_permissions",
            return_value=None,
        ), patch(
            "app_course.views.models.Course.objects.filter"
        ) as mock_filter:
            mock_filter.return_value.first.return_value = course
            view.check_permissions(request)

        mock_check_course_write.assert_not_called()

    @patch("app_course.views.check_course_write")
    @patch("app_course.views.acting_user")
    def test_check_permissions_allows_connected_teacher(
        self, mock_acting_user, mock_check_course_write
    ):
        view = CourseMicrosoftChannelsView()
        view.kwargs = {"course_id": 5}
        teacher = SimpleNamespace(roles=[User.UserRole.TEACHER])
        mock_acting_user.return_value = teacher
        course = SimpleNamespace(id=5)
        request = SimpleNamespace()

        with patch.object(
            CourseMicrosoftChannelsView.__bases__[0],
            "check_permissions",
            return_value=None,
        ), patch(
            "app_course.views.models.Course.objects.filter"
        ) as mock_filter:
            mock_filter.return_value.first.return_value = course
            view.check_permissions(request)

        mock_check_course_write.assert_called_once_with(teacher, course)

    @patch("app_course.views.check_course_write")
    @patch("app_course.views.acting_user")
    def test_check_permissions_denies_non_connected_teacher(
        self, mock_acting_user, mock_check_course_write
    ):
        view = CourseMicrosoftChannelsView()
        view.kwargs = {"course_id": 5}
        teacher = SimpleNamespace(roles=[User.UserRole.TEACHER])
        mock_acting_user.return_value = teacher
        course = SimpleNamespace(id=5)
        mock_check_course_write.side_effect = PermissionDenied(
            "Not allowed for this course."
        )
        request = SimpleNamespace()

        with patch.object(
            CourseMicrosoftChannelsView.__bases__[0],
            "check_permissions",
            return_value=None,
        ), patch(
            "app_course.views.models.Course.objects.filter"
        ) as mock_filter:
            mock_filter.return_value.first.return_value = course
            with self.assertRaises(PermissionDenied):
                view.check_permissions(request)

        mock_check_course_write.assert_called_once_with(teacher, course)

    @patch("app_microsoft.delegated_auth.build_meeting_for_poster")
    @patch("app_microsoft.delegated_auth._user_poster")
    @patch("app_course.views.acting_user")
    def test_lists_channels_with_personal_oauth(
        self, mock_acting_user, mock_user_poster, mock_build_meeting
    ):
        from app_microsoft.delegated_auth import PostedAs, Poster

        view = CourseMicrosoftChannelsView()
        user = SimpleNamespace(id=9)
        mock_acting_user.return_value = user
        poster = Poster(PostedAs.USER, SimpleNamespace(), 9)
        mock_user_poster.return_value = poster
        meeting = SimpleNamespace(
            list_channels=lambda team_id: [{"id": "ch-1", "displayName": "General"}]
        )
        mock_build_meeting.return_value = meeting
        request = SimpleNamespace(
            tenant=SimpleNamespace(is_microsoft_on=True),
            user=SimpleNamespace(id="teacher@example.com"),
        )
        course = SimpleNamespace(id=5, microsoft_group_id="team-1")

        with patch.object(
            CourseMicrosoftChannelsView,
            "check_permissions",
            return_value=None,
        ), patch(
            "app_course.views.models.Course.objects.filter"
        ) as mock_filter, patch.object(
            view, "ok", side_effect=lambda data, **kwargs: data
        ):
            mock_filter.return_value.first.return_value = course
            result = view.get(request, course_id=5)

        self.assertEqual(
            result,
            [{"id": "ch-1", "displayName": "General"}],
        )
        mock_user_poster.assert_called_once_with(9)

    @patch("app_course.views.acting_user")
    @patch("app_microsoft.delegated_auth.resolve_teams_meeting_for_actor")
    def test_bad_request_when_no_teams_connection(
        self, mock_resolve, mock_acting_user
    ):
        view = CourseMicrosoftChannelsView()
        mock_acting_user.return_value = SimpleNamespace(id=9)
        mock_resolve.return_value = (None, "Microsoft service account is not connected.")
        request = SimpleNamespace(
            tenant=SimpleNamespace(is_microsoft_on=True),
            user=SimpleNamespace(id="teacher@example.com"),
        )
        course = SimpleNamespace(id=5, microsoft_group_id="team-1")

        with patch.object(
            CourseMicrosoftChannelsView,
            "check_permissions",
            return_value=None,
        ), patch(
            "app_course.views.models.Course.objects.filter"
        ) as mock_filter, patch.object(
            view, "bad_request", side_effect=lambda msg: msg
        ):
            mock_filter.return_value.first.return_value = course
            result = view.get(request, course_id=5)

        self.assertIn("service account", result.lower())

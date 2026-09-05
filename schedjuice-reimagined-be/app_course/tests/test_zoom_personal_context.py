from types import SimpleNamespace

from django.test import SimpleTestCase

from app_course.models import Course


class ZoomPersonalContextTests(SimpleTestCase):
    def test_personal_denies_when_bound_teacher_differs_from_actor(self):
        from app_course.zoom_meeting_context import resolve_zoom_course_context

        course = SimpleNamespace(
            zoom_meeting_source=Course.ZoomMeetingSource.PERSONAL,
            zoom_personal_user_id=1,
        )
        actor = SimpleNamespace(id=99)
        tenant = SimpleNamespace(id=1)
        _, err, status = resolve_zoom_course_context(
            course=course, actor=actor, tenant=tenant
        )
        self.assertIsNotNone(err)
        self.assertEqual(status, 403)

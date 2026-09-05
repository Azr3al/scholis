from django.test import SimpleTestCase

from app_announcement.models import AnnouncementAttachment


class AnnouncementAttachmentStagingModelTests(SimpleTestCase):
    def test_announcement_nullable_for_staging(self):
        field = AnnouncementAttachment._meta.get_field("announcement")
        self.assertTrue(field.null)
        self.assertTrue(field.blank)

    def test_has_course_and_uploaded_by_fields(self):
        self.assertIsNotNone(AnnouncementAttachment._meta.get_field("course"))
        self.assertIsNotNone(AnnouncementAttachment._meta.get_field("uploaded_by"))

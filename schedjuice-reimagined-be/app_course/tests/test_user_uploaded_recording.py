import unittest
from uuid import uuid4

from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_course.models import Course
from app_course.youtube import extract_youtube_video_id

class ExtractYouTubeVideoIdTest(unittest.TestCase):
    def test_watch_url(self):
        self.assertEqual(
            extract_youtube_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            "dQw4w9WgXcQ",
        )

    def test_short_url(self):
        self.assertEqual(
            extract_youtube_video_id("https://youtu.be/dQw4w9WgXcQ"),
            "dQw4w9WgXcQ",
        )

    def test_raw_video_id(self):
        self.assertEqual(extract_youtube_video_id("dQw4w9WgXcQ"), "dQw4w9WgXcQ")

    def test_invalid_url(self):
        self.assertIsNone(extract_youtube_video_id("https://example.com/video"))
        self.assertIsNone(extract_youtube_video_id(""))
        self.assertIsNone(extract_youtube_video_id(None))

class UserUploadedRecordingSerializerTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _course_id(self):
        with schema_context(self.schema_name):
            course = Course.objects.first()
            self.assertIsNotNone(course)
            return course.id

    def test_youtube_validation(self):
        from app_course.serializers import UserUploadedRecordingSerializer

        with schema_context(self.schema_name):
            serializer = UserUploadedRecordingSerializer(
                data={
                    "course": self._course_id(),
                    "recorded_date": "2026-06-01",
                    "description": "Lecture",
                    "source_type": "youtube",
                    "youtube_url": "https://youtu.be/dQw4w9WgXcQ",
                }
            )
            self.assertTrue(serializer.is_valid(), serializer.errors)
            self.assertEqual(serializer.validated_data["youtube_video_id"], "dQw4w9WgXcQ")
            self.assertEqual(
                serializer.validated_data["youtube_url"],
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            )

    def test_youtube_requires_url(self):
        from app_course.serializers import UserUploadedRecordingSerializer

        with schema_context(self.schema_name):
            serializer = UserUploadedRecordingSerializer(
                data={
                    "course": self._course_id(),
                    "recorded_date": "2026-06-01",
                    "source_type": "youtube",
                }
            )
            self.assertFalse(serializer.is_valid())
            self.assertIn("youtube_url", serializer.errors)

    def test_invalid_youtube_url(self):
        from app_course.serializers import UserUploadedRecordingSerializer

        with schema_context(self.schema_name):
            serializer = UserUploadedRecordingSerializer(
                data={
                    "course": self._course_id(),
                    "recorded_date": "2026-06-01",
                    "source_type": "youtube",
                    "youtube_url": "https://example.com/not-youtube",
                }
            )
            self.assertFalse(serializer.is_valid())
            self.assertIn("youtube_url", serializer.errors)

    def test_file_source_clears_youtube_fields(self):
        from app_course.serializers import UserUploadedRecordingSerializer

        with schema_context(self.schema_name):
            serializer = UserUploadedRecordingSerializer(
                data={
                    "course": self._course_id(),
                    "recorded_date": "2026-06-01",
                    "source_type": "file",
                    "youtube_url": "https://youtu.be/dQw4w9WgXcQ",
                }
            )
            self.assertTrue(serializer.is_valid(), serializer.errors)
            self.assertEqual(serializer.validated_data["youtube_url"], "")
            self.assertEqual(serializer.validated_data["youtube_video_id"], "")

if __name__ == "__main__":
    unittest.main()

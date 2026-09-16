"""QuizSerializer: Open status requires a course."""

import uuid

from django.test import SimpleTestCase

from app_quiz_v3.models import Quiz
from app_quiz_v3.serializers import QuizSerializer


class QuizSerializerOpenCourseTests(SimpleTestCase):
    def test_open_without_course_errors(self):
        quiz = Quiz(
            title="No course",
            status=Quiz.QuizStatus.DRAFT,
            code=uuid.uuid4(),
            created_by_id=1,
        )
        ser = QuizSerializer(
            instance=quiz,
            data={"status": Quiz.QuizStatus.OPEN},
            partial=True,
        )
        self.assertFalse(ser.is_valid())
        self.assertIn("course", ser.errors)

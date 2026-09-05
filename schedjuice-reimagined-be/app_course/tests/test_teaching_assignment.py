from django.test import SimpleTestCase

from app_course.models import AssignedAsRole, UserCourse
from app_course.teaching_assignment import is_teaching_assignment


class TeachingAssignmentPredicateTest(SimpleTestCase):
    def _uc(self, *, assigned_as, seniority, role_none=False):
        role = None if role_none else AssignedAsRole(seniority=seniority)
        return UserCourse(
            assigned_as=assigned_as,
            assigned_as_role=role,
        )

    def test_main_teacher_is_teaching(self):
        uc = self._uc(
            assigned_as=UserCourse.AssignedAs.TEACHER,
            seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
        )
        self.assertTrue(is_teaching_assignment(uc))

    def test_assistant_teacher_is_teaching(self):
        uc = self._uc(
            assigned_as=UserCourse.AssignedAs.TEACHER,
            seniority=AssignedAsRole.Seniority.ASSISTANT_TEACHER,
        )
        self.assertTrue(is_teaching_assignment(uc))

    def test_other_seniority_not_teaching(self):
        uc = self._uc(
            assigned_as=UserCourse.AssignedAs.TEACHER,
            seniority=AssignedAsRole.Seniority.OTHER,
        )
        self.assertFalse(is_teaching_assignment(uc))

    def test_null_seniority_not_teaching(self):
        uc = self._uc(
            assigned_as=UserCourse.AssignedAs.TEACHER,
            seniority=None,
        )
        self.assertFalse(is_teaching_assignment(uc))

    def test_student_not_teaching(self):
        uc = self._uc(
            assigned_as=UserCourse.AssignedAs.STUDENT,
            seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
        )
        self.assertFalse(is_teaching_assignment(uc))

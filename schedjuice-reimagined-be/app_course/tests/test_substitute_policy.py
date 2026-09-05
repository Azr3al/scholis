from types import SimpleNamespace

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from app_course.models import AssignedAsRole
from app_course.substitute_policy import (
    assert_substitute_role_valid,
    substitute_teachers_enabled,
)


class SubstituteTeachersEnabledTests(SimpleTestCase):
    def test_defaults_to_off_when_attribute_missing(self):
        self.assertFalse(substitute_teachers_enabled(SimpleNamespace()))

    def test_off_when_tenant_is_none(self):
        self.assertFalse(substitute_teachers_enabled(None))

    def test_on_only_when_flag_true(self):
        self.assertTrue(
            substitute_teachers_enabled(
                SimpleNamespace(is_substitute_teachers_enabled=True)
            )
        )
        self.assertFalse(
            substitute_teachers_enabled(
                SimpleNamespace(is_substitute_teachers_enabled=False)
            )
        )


class AssertSubstituteRoleValidTests(SimpleTestCase):
    def test_rejects_substitute_with_other_seniority(self):
        with self.assertRaises(ValidationError) as ctx:
            assert_substitute_role_valid(
                is_substitute=True,
                seniority=AssignedAsRole.Seniority.OTHER,
            )
        self.assertIn("is_substitute", ctx.exception.detail)

    def test_rejects_substitute_with_missing_seniority(self):
        with self.assertRaises(ValidationError):
            assert_substitute_role_valid(is_substitute=True, seniority=None)

    def test_allows_substitute_with_mt_or_at(self):
        assert_substitute_role_valid(
            is_substitute=True, seniority=AssignedAsRole.Seniority.MAIN_TEACHER
        )
        assert_substitute_role_valid(
            is_substitute=True, seniority=AssignedAsRole.Seniority.ASSISTANT_TEACHER
        )

    def test_ignores_seniority_when_not_substitute(self):
        assert_substitute_role_valid(
            is_substitute=False, seniority=AssignedAsRole.Seniority.OTHER
        )

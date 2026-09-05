from django.test import SimpleTestCase

from app_custom_fields import seeding


class BuiltinGroupAssignmentTests(SimpleTestCase):
    def test_group_plan_covers_every_user_builtin(self):
        from app_custom_fields.builtin_fields import builtin_fields_for_entity
        from app_custom_fields.constants import ENTITY_TYPE_USER

        keys = set(builtin_fields_for_entity(ENTITY_TYPE_USER).keys())
        planned = {
            key
            for group in seeding.DEFAULT_BUILTIN_GROUPS[ENTITY_TYPE_USER]
            for key in group["field_keys"]
        }
        self.assertEqual(
            keys, planned, "every builtin must be assigned to exactly one default group"
        )

    def test_group_plan_has_no_duplicate_assignments(self):
        from app_custom_fields.constants import ENTITY_TYPE_USER

        seen = []
        for group in seeding.DEFAULT_BUILTIN_GROUPS[ENTITY_TYPE_USER]:
            seen.extend(group["field_keys"])
        self.assertEqual(len(seen), len(set(seen)))

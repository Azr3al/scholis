# app_rbac/tests/test_enforcement.py
#
# NOTE: `ShadowDenial` is a SHARED (public-schema) model from `app_rbac_audit`
# (registered in SHARED_APPS), so its table is created ONLY in the public schema.
# The plan's test uses a plain `django.test.TestCase`; we keep that, but follow the
# project's established SHARED-model test pattern (see
# app_organization/test_zoom_account.py, which queries the public-schema ZoomAccount
# model) and wrap the DB-touching `record_denial` calls + readback in
# `schema_context(get_public_schema_name())`. `record_denial` performs its
# get_or_create on the connection's current schema, so this makes the writes/reads
# deterministically target the public schema regardless of the connection's schema.
# The pure `should_block` checks touch no DB and are unchanged. The plan's assertions
# (block in both modes + hit_count == 3) are unchanged. (The plan's unused
# `MagicMock` import is omitted.)
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_rbac import enforcement
from app_rbac_audit.models import ShadowDenial


class EnforcementModeTests(TestCase):
    @override_settings(RBAC_ENFORCE="enforce")
    def test_enforce_mode_blocks(self):
        self.assertTrue(enforcement.should_block(missing=["course.view"]))

    @override_settings(RBAC_ENFORCE="log_only")
    def test_log_only_does_not_block(self):
        self.assertFalse(enforcement.should_block(missing=["course.view"]))

    @override_settings(RBAC_ENFORCE="log_only")
    def test_record_denial_dedups_and_counts(self):
        with schema_context(get_public_schema_name()):
            for _ in range(3):
                enforcement.record_denial(
                    schema="t1", view_name="CourseListView", path_pattern="/courses",
                    method="GET", missing=["course.view"], roles=["student"],
                    legacy_allowed=True, sample={"user_id": 5, "full_path": "/courses?x=1"},
                )
            row = ShadowDenial.objects.get(view_name="CourseListView", method="GET")
        self.assertEqual(row.hit_count, 3)

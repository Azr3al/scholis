# app_rbac/tests/test_shadow_report.py
#
# NOTE: `ShadowDenial` is a SHARED (public-schema) model from `app_rbac_audit`
# (registered in SHARED_APPS), so its table is created ONLY in the public schema.
# The plan's test uses a plain `django.test.TestCase`; we keep that, but follow the
# project's established SHARED-model test pattern (see app_rbac/tests/test_enforcement.py)
# and wrap the DB-touching `ShadowDenial.objects.create(...)` calls + the `build_report()`
# read inside `schema_context(get_public_schema_name())` so the writes/reads
# deterministically target the public schema regardless of the connection's schema.
# The plan's assertions (rows[0] is the hit_count=10 row, sorted by -hit_count) are
# unchanged. (The plan's unused `json, os, tempfile` imports are omitted.)
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_rbac_audit.models import ShadowDenial
from app_rbac_audit.management.commands.rbac_shadow_report import build_report


class ShadowReportTests(TestCase):
    def test_build_report_groups_and_sorts(self):
        with schema_context(get_public_schema_name()):
            ShadowDenial.objects.create(schema_name="t1", view_name="A", path_pattern="/a", method="GET",
                                        missing_codes=["course.view"], role_signature="student", hit_count=10, sample={})
            ShadowDenial.objects.create(schema_name="t1", view_name="B", path_pattern="/b", method="POST",
                                        missing_codes=["course.create"], role_signature="teacher", hit_count=2, sample={})
            rows = build_report()
        self.assertEqual(rows[0]["view_name"], "A")   # sorted by hit_count desc
        self.assertEqual(rows[0]["hit_count"], 10)

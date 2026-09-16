# app_rbac/tests/test_catalog.py
from django.test import SimpleTestCase
from app_rbac import catalog

class CatalogTests(SimpleTestCase):
    def test_codes_are_unique(self):
        codes = [p.code for p in catalog.ALL_PERMISSIONS]
        self.assertEqual(len(codes), len(set(codes)))

    def test_school_tier_excludes_platform_codes(self):
        self.assertNotIn("debug.access", catalog.SCHOOL_TIER_CODES)
        self.assertIn("course.view", catalog.SCHOOL_TIER_CODES)

    def test_telegram_link_on_behalf_is_platform_internal(self):
        perm = next(
            p for p in catalog.ALL_PERMISSIONS if p.code == "telegram.link_on_behalf"
        )
        self.assertEqual(perm.tier, catalog.PLATFORM_INTERNAL)

    def test_google_link_on_behalf_is_platform_internal(self):
        perm = next(
            p for p in catalog.ALL_PERMISSIONS if p.code == "google.link_on_behalf"
        )
        self.assertEqual(perm.tier, catalog.PLATFORM_INTERNAL)

    def test_document_template_manage_exists(self):
        self.assertIn("document_template.manage", catalog.ALL_CODES)
        perm = catalog.BY_CODE["document_template.manage"]
        self.assertEqual(perm.tier, catalog.SCHOOL)
        self.assertEqual(perm.data_class, "Operational")

    def test_certificate_codes_removed(self):
        for code in ("certificate.view", "certificate.manage", "certificate.generate"):
            self.assertNotIn(code, catalog.ALL_CODES)

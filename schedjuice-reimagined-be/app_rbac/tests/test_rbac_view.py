# app_rbac/tests/test_rbac_view.py
from unittest.mock import patch, MagicMock
from django.test import SimpleTestCase, override_settings
from app_rbac.views import RBACView, required_codes_for


class RequiredCodesTests(SimpleTestCase):
    def test_reads_per_method_map(self):
        v = RBACView()
        v.required_permissions = {"GET": "course.view", "POST": "course.create"}
        self.assertEqual(required_codes_for(v, "GET"), ["course.view"])
        self.assertEqual(required_codes_for(v, "POST"), ["course.create"])

    def test_default_deny_when_undeclared(self):
        v = RBACView()  # no required_permissions, no rbac_decision
        self.assertIs(required_codes_for(v, "GET"), RBACView.DENY)

    def test_authenticated_only_optout(self):
        v = RBACView()
        v.rbac_decision = "authenticated_only"
        self.assertEqual(required_codes_for(v, "GET"), [])

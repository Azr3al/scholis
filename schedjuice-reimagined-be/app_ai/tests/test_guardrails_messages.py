from django.test import TestCase

from app_ai.guardrails.messages import blocked_message, rate_limited_message
from app_organization.models import Organization


class GuardrailMessageTests(TestCase):
    def test_blocked_message_uses_org_name_not_schedjuice(self):
        org = Organization(name="SDEC International School")
        msg = blocked_message(org)
        self.assertIn("SDEC International School", msg)
        self.assertNotIn("Schedjuice", msg)

    def test_rate_limited_message_includes_retry(self):
        msg = rate_limited_message(42)
        self.assertIn("42", msg)

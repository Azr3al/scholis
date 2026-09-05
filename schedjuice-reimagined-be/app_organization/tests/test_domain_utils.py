from django.test import SimpleTestCase

from app_organization.domain_utils import (
    email_domain_allowed,
    get_organization_approved_domains,
    normalize_available_domains,
)


class NormalizeAvailableDomainsTests(SimpleTestCase):
    def test_plain_list(self):
        self.assertEqual(
            normalize_available_domains(["School.EDU", "other.org"]),
            ["school.edu", "other.org"],
        )

    def test_json_string_payload(self):
        self.assertEqual(
            normalize_available_domains('["sdecedu.com", "school.edu"]'),
            ["sdecedu.com", "school.edu"],
        )

    def test_legacy_corrupted_nested_json(self):
        corrupted = ['["["sdec.schedjuice.com\\"]","sdecedu.com"]']
        self.assertEqual(
            normalize_available_domains(corrupted),
            ["sdec.schedjuice.com", "sdecedu.com"],
        )

    def test_email_domain_allowed(self):
        approved = ["sdecedu.com"]
        self.assertTrue(email_domain_allowed("arkarminko@sdecedu.com", approved))
        self.assertFalse(email_domain_allowed("user@other.com", approved))


class GetOrganizationApprovedDomainsTests(SimpleTestCase):
    def test_reads_from_model_attribute(self):
        class Org:
            available_domains = ['["sdecedu.com"]']

        self.assertEqual(
            get_organization_approved_domains(Org()),
            ["sdecedu.com"],
        )

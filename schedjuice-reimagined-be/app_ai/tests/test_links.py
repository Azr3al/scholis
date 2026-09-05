from unittest.mock import MagicMock

from django.test import TestCase

from app_ai.links import (
    build_frontend_url,
    compact_user_for_ai,
    with_course_link,
    with_user_link,
)
from app_organization.models import Organization


class BuildFrontendUrlTests(TestCase):
    def test_builds_https_url(self):
        org = Organization(domain_url="school.schedjuice.com")
        self.assertEqual(
            build_frontend_url(org, "/users/12"),
            "https://school.schedjuice.com/users/12",
        )

    def test_strips_trailing_slash_from_domain(self):
        org = Organization(domain_url="school.schedjuice.com/")
        self.assertEqual(
            build_frontend_url(org, "/courses/3"),
            "https://school.schedjuice.com/courses/3",
        )

    def test_empty_when_domain_missing(self):
        org = Organization(domain_url="")
        self.assertEqual(build_frontend_url(org, "/users/1"), "")


class EnrichmentHelpersTests(TestCase):
    def test_with_user_link_adds_profile_url(self):
        org = Organization(domain_url="schedjuice.thiha.net")
        row = with_user_link({"id": 5, "name": "Bruce", "email": "b@e.com"}, org=org)
        self.assertEqual(
            row["profile_url"],
            "https://schedjuice.thiha.net/users/5",
        )

    def test_with_user_link_skips_when_no_domain(self):
        org = Organization(domain_url="")
        row = with_user_link({"id": 5, "name": "Bruce"}, org=org)
        self.assertNotIn("profile_url", row)

    def test_with_course_link_uses_course_id_key(self):
        org = Organization(domain_url="schedjuice.thiha.net")
        row = with_course_link(
            {"course_id": 94, "title": "test course 3"},
            org=org,
        )
        self.assertEqual(row["url"], "https://schedjuice.thiha.net/courses/94")

    def test_with_course_link_uses_id_key(self):
        org = Organization(domain_url="schedjuice.thiha.net")
        row = with_course_link({"id": 82, "title": "Training Course"}, org=org)
        self.assertEqual(row["url"], "https://schedjuice.thiha.net/courses/82")


class CompactUserForAiTests(TestCase):
    def test_sets_primary_email_from_user_email(self):
        user = MagicMock()
        user.id = 12
        user.name = "Bruce"
        user.email = "bruce@school.com"
        user.communication_email = "parent@gmail.com"
        row = compact_user_for_ai(user)
        self.assertEqual(row["primary_email"], "bruce@school.com")

    def test_never_includes_communication_email_or_legacy_email_key(self):
        user = MagicMock()
        user.id = 12
        user.name = "Bruce"
        user.email = "bruce@school.com"
        user.communication_email = "parent@gmail.com"
        row = compact_user_for_ai(user)
        self.assertNotIn("communication_email", row)
        self.assertNotIn("email", row)

    def test_adds_profile_url_when_org_has_domain(self):
        user = MagicMock()
        user.id = 5
        user.name = "Bruce"
        user.email = "b@e.com"
        user.communication_email = "other@e.com"
        org = Organization(domain_url="schedjuice.thiha.net")
        row = compact_user_for_ai(user, org=org)
        self.assertEqual(
            row["profile_url"],
            "https://schedjuice.thiha.net/users/5",
        )

    def test_strips_whitespace_from_primary_email(self):
        user = MagicMock()
        user.id = 1
        user.name = "A"
        user.email = "  a@e.com  "
        user.communication_email = "b@e.com"
        row = compact_user_for_ai(user)
        self.assertEqual(row["primary_email"], "a@e.com")

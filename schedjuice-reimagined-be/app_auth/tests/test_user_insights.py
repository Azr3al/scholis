import unittest
from unittest.mock import patch
from uuid import uuid4

from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_auth.user_insights_services import (
    DuplicateClusterFilters,
    UnionFind,
    build_duplicate_clusters,
    normalize_name,
)
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class UnionFindTests(SimpleTestCase):
    def test_transitive_merge(self):
        uf = UnionFind()
        uf.union(1, 2)
        uf.union(2, 3)
        self.assertEqual(uf.find(1), uf.find(3))


class NormalizeNameTests(SimpleTestCase):
    def test_collapses_whitespace_and_case(self):
        self.assertEqual(normalize_name("  Mi  Pakao  "), "mi pakao")


class BuildDuplicateClustersTests(SimpleTestCase):
    def _student(self, **kwargs):
        base = {
            "roles": ["student"],
            "is_active": True,
            "communication_email": "",
            "phone_number_digits": "",
            "emergency_contact_phone_number_digits": "",
        }
        base.update(kwargs)
        return base

    def test_three_user_transitive_cluster(self):
        users = [
            self._student(
                id=1,
                name="Alice",
                email="a@x.io",
                phone_number_digits="111",
            ),
            self._student(
                id=2,
                name="Bob",
                email="b@x.io",
                phone_number_digits="111",
                communication_email="shared@fam.com",
            ),
            self._student(
                id=3,
                name="Carol",
                email="c@x.io",
                communication_email="shared@fam.com",
            ),
            self._student(
                id=4,
                name="Dave",
                email="d@x.io",
                communication_email="shared@fam.com",
            ),
        ]
        _, clusters, _ = build_duplicate_clusters(users, DuplicateClusterFilters())
        ids_sets = [c["user_ids"] for c in clusters]
        self.assertIn([1, 2, 3, 4], ids_sets)

    def test_sibling_flag_on_name_mismatch(self):
        users = [
            self._student(
                id=1,
                name="Mi Pakao Htaw",
                email="a@x.io",
                phone_number_digits="999",
            ),
            self._student(
                id=2,
                name="Mehm Samoi Htaw",
                email="b@x.io",
                phone_number_digits="999",
            ),
        ]
        _, clusters, _ = build_duplicate_clusters(users, DuplicateClusterFilters())
        self.assertTrue(clusters[0]["possible_siblings"])
        self.assertTrue(clusters[0]["match_reasons"][0]["possible_sibling"])

    def test_no_sibling_flag_when_names_match(self):
        users = [
            self._student(
                id=1,
                name="Same Name",
                email="a@x.io",
                phone_number_digits="999",
            ),
            self._student(
                id=2,
                name="same  name",
                email="b@x.io",
                phone_number_digits="999",
            ),
        ]
        _, clusters, _ = build_duplicate_clusters(users, DuplicateClusterFilters())
        self.assertFalse(clusters[0]["possible_siblings"])


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class UserInsightsDuplicateSearchApiTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    def setUp(self):
        self.broadcast_patcher = patch("app_auth.views.broadcast_rbac_updated_to_user")
        self.broadcast_patcher.start()
        self.addCleanup(self.broadcast_patcher.stop)
        with schema_context(self.schema_name):
            seed_rbac()
            suffix = uuid4().hex[:8]
            self.admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            if self.admin is None:
                self.admin = User.objects.create(
                    email=f"admin-{suffix}@x.io",
                    name="admin",
                    phone_number="1",
                    communication_email=f"admin-{suffix}@x.io",
                    code=f"adm-{suffix}",
                    roles=[User.UserRole.ADMIN],
                )
            shared_phone = f"09{suffix[:8]}"
            self.student_a = User.objects.create(
                email=f"stu-a-{suffix}@x.io",
                name="Student A",
                phone_number=shared_phone,
                communication_email=f"stu-a-{suffix}@x.io",
                emergency_contact_phone_number="09-111-2222",
                code=f"sa-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            self.student_b = User.objects.create(
                email=f"stu-b-{suffix}@x.io",
                name="Student B",
                phone_number=shared_phone,
                communication_email=f"stu-b-{suffix}@x.io",
                code=f"sb-{suffix}",
                roles=[User.UserRole.STUDENT],
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_X_DTS_SCHEMA=self.schema_name)
        return client

    def test_returns_cluster_for_shared_phone(self):
        response = self._client(self.admin).post(
            f"{self.api_prefix}/users/insights/duplicates/search",
            {"page": 1, "size": 25},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        results = response.data["data"]["results"]
        self.assertIn(
            (self.student_a.id, self.student_b.id),
            {tuple(sorted(c["user_ids"])) for c in results},
        )

    def test_member_includes_emergency_contact_phone_number(self):
        response = self._client(self.admin).post(
            f"{self.api_prefix}/users/insights/duplicates/search",
            {"page": 1, "size": 25},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        cluster = next(
            c
            for c in response.data["data"]["results"]
            if self.student_a.id in c["user_ids"]
        )
        member_a = next(u for u in cluster["users"] if u["id"] == self.student_a.id)
        self.assertEqual(member_a["emergency_contact_phone_number"], "09-111-2222")

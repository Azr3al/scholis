import unittest
from datetime import date
from unittest.mock import patch
from uuid import uuid4

from django.core.cache import cache
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_hr.school_overview_cache import (
    get_school_overview_snapshot,
    invalidate_school_overview_cache,
)
from app_rbac.seeding import seed_rbac

URL = "/api/v1/cash-flow/trphillips/school-overview"


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _snapshot_two_courses():
    return {
        "courses": [
            {
                "course_id": 1,
                "course_title": "Alpha Math",
                "course_code": "A1",
                "subject_names": "Math",
                "mt_name": "Aung Aung",
                "total_income": "10.00",
                "total_expense": "4.00",
                "total_profit": "6.00",
            },
            {
                "course_id": 2,
                "course_title": "Beta Physics",
                "course_code": "B2",
                "subject_names": "Physics",
                "mt_name": "Mya Mya",
                "total_income": "20.00",
                "total_expense": "5.00",
                "total_profit": "15.00",
            },
        ],
        "grand_aggregate": {
            "total_income": "30.00",
            "total_expense": "9.00",
            "total_profit": "21.00",
        },
    }


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class SchoolOverviewAPITests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        cache.clear()
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.hr_user = User.objects.create_user(
                email=f"hr-ov-{suffix}@example.com",
                password="x",
                name="HR User",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.HR],
            )
            self.teacher = User.objects.create_user(
                email=f"tch-ov-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _payload(self, resp):
        body = resp.json()
        data = body.get("data") if isinstance(body.get("data"), dict) else body
        return data

    @patch(
        "app_hr.payroll_funcs.get_school_overview_trphillips",
        return_value=_snapshot_two_courses(),
    )
    def test_pagination_preserves_grand_aggregate(self, _mock):
        c = self._client(self.hr_user)
        page1 = self._payload(
            c.post(
                URL,
                {"month": 7, "year": 2026, "page": 1, "size": 1, "sorts": ["course_title"]},
                format="json",
            )
        )
        page2 = self._payload(
            c.post(
                URL,
                {"month": 7, "year": 2026, "page": 2, "size": 1, "sorts": ["course_title"]},
                format="json",
            )
        )
        self.assertEqual(page1["count"], 2)
        self.assertEqual(len(page1["courses"]), 1)
        self.assertEqual(len(page2["courses"]), 1)
        self.assertNotEqual(page1["courses"][0]["course_id"], page2["courses"][0]["course_id"])
        self.assertEqual(page1["grand_aggregate"], page2["grand_aggregate"])

    @patch(
        "app_hr.payroll_funcs.get_school_overview_trphillips",
        return_value=_snapshot_two_courses(),
    )
    @patch(
        "app_hr.school_overview_query._hub_search_match_ids",
        return_value=set(),
    )
    def test_search_filters_table_not_grand_aggregate(self, _hub, _mock):
        data = self._payload(
            self._client(self.hr_user).post(
                URL,
                {"month": 7, "year": 2026, "q": "Physics"},
                format="json",
            )
        )
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["courses"][0]["course_id"], 2)
        self.assertEqual(data["grand_aggregate"]["total_income"], "30.00")

    @patch("app_hr.payroll_funcs.get_school_overview_trphillips")
    def test_second_request_uses_cache(self, mock_compute):
        mock_compute.return_value = _snapshot_two_courses()
        c = self._client(self.hr_user)
        body = {"month": 7, "year": 2026}
        self.assertEqual(c.post(URL, body, format="json").status_code, 200)
        self.assertEqual(c.post(URL, body, format="json").status_code, 200)
        self.assertEqual(mock_compute.call_count, 1)

    @patch("app_hr.payroll_funcs.get_school_overview_trphillips")
    def test_invalidate_forces_recompute(self, mock_compute):
        mock_compute.return_value = _snapshot_two_courses()
        c = self._client(self.hr_user)
        body = {"month": 7, "year": 2026}
        self.assertEqual(c.post(URL, body, format="json").status_code, 200)
        self.assertIsNotNone(get_school_overview_snapshot(self.schema_name, 2026, 7))
        invalidate_school_overview_cache(self.schema_name, 2026, 7)
        self.assertEqual(c.post(URL, body, format="json").status_code, 200)
        self.assertEqual(mock_compute.call_count, 2)

    def test_teacher_forbidden_when_enforced(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).post(
                URL, {"month": 7, "year": 2026}, format="json"
            )
        self.assertEqual(resp.status_code, 403)

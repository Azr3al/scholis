import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context
from djmoney.money import Money
from decimal import Decimal

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_finance.models import Discount, PaymentPlan
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

def _jwt_token_user(email: str):
    return type(
        "TokenUser",
        (),
        {"id": email, "is_authenticated": True},
    )()

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class DiscountApiTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.finance = User.objects.create_user(
                email=f"fin-{suffix}@example.com",
                password="x",
                name="Finance",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            self.teacher = User.objects.create_user(
                email=f"tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.plan = PaymentPlan.objects.create(
                name=f"plan-{suffix}",
                price=Money(500, "USD"),
            )
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C {suffix}",
                category=cat,
                program=prog,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 6, 30),
                payment_plan=self.plan,
            )
            self.student = User.objects.create_user(
                email=f"stu-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.enrollment = UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            self.discount = Discount.objects.create(
                name=f"disc-{suffix}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("10"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_teacher_cannot_create_discount(self):
        resp = self._client(self.teacher).post(
            "/api/v1/discounts",
            {
                "name": f"x-{uuid4().hex[:6]}",
                "discount_type": "percent",
                "percent_value": "15",
                "scope": "first_period",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_apply_and_get_enrollment_discount(self):
        client = self._client(self.finance)
        apply_resp = client.post(
            f"/api/v1/user-courses/{self.enrollment.id}/discount",
            {"discount_id": self.discount.id, "reason": "test"},
            format="json",
        )
        self.assertEqual(apply_resp.status_code, 201)
        get_resp = client.get(f"/api/v1/user-courses/{self.enrollment.id}/discount")
        self.assertEqual(get_resp.status_code, 200)
        self.assertFalse(get_resp.data["isError"])
        data = get_resp.data["data"]
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["snapshot_percent_value"], "10.00")

    def test_preview_enrollment_discount(self):
        client = self._client(self.finance)
        client.post(
            f"/api/v1/user-courses/{self.enrollment.id}/discount",
            {"discount_id": self.discount.id},
            format="json",
        )
        preview_resp = client.get(
            f"/api/v1/user-courses/{self.enrollment.id}/discount-preview"
        )
        self.assertEqual(preview_resp.status_code, 200)
        periods = preview_resp.data["data"]["periods"]
        self.assertGreaterEqual(len(periods), 1)
        self.assertEqual(float(periods[0]["invoiced_amount"]), 450.0)

    def test_apply_enrollment_discount_with_jwt_token_user(self):
        """Stateless JWT auth yields TokenUser, not a User model instance."""
        token_user = _jwt_token_user(self.finance.email)
        client = self._client(token_user)
        resp = client.post(
            f"/api/v1/user-courses/{self.enrollment.id}/discount",
            {"discount_id": self.discount.id, "reason": "jwt"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertFalse(resp.data["isError"])

    def test_remove_enrollment_discount(self):
        client = self._client(self.finance)
        client.post(
            f"/api/v1/user-courses/{self.enrollment.id}/discount",
            {"discount_id": self.discount.id},
            format="json",
        )
        delete_resp = client.delete(
            f"/api/v1/user-courses/{self.enrollment.id}/discount"
        )
        self.assertEqual(delete_resp.status_code, 200)
        get_resp = client.get(f"/api/v1/user-courses/{self.enrollment.id}/discount")
        self.assertEqual(get_resp.data["data"], [])

    def test_apply_early_bird_outside_window_rejected(self):
        with schema_context(self.schema_name):
            self.course.start_date = date(2026, 1, 1)
            self.course.save(update_fields=["start_date", "updated_at"])
            eb = Discount.objects.create(
                name=f"eb-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("10"),
                scope=Discount.Scope.FIRST_PERIOD,
                eligibility_type=Discount.EligibilityType.EARLY_BIRD,
                early_bird_days=14,
            )
        client = self._client(self.finance)
        resp = client.post(
            f"/api/v1/user-courses/{self.enrollment.id}/discount",
            {
                "discount_id": eb.id,
                "as_of": "2026-01-01",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertIn("early_bird_window_closed", str(resp.data))

    def test_apply_early_bird_allowed_when_eligibility_disabled(self):
        self._set_discount_eligibility_enabled(False)
        try:
            with schema_context(self.schema_name):
                self.course.start_date = date(2026, 1, 1)
                self.course.save(update_fields=["start_date", "updated_at"])
                eb = Discount.objects.create(
                    name=f"eb-off-apply-{uuid4().hex[:6]}",
                    discount_type=Discount.DiscountType.PERCENT,
                    percent_value=Decimal("10"),
                    scope=Discount.Scope.FIRST_PERIOD,
                    eligibility_type=Discount.EligibilityType.EARLY_BIRD,
                    early_bird_days=14,
                )
            resp = self._client(self.finance).post(
                f"/api/v1/user-courses/{self.enrollment.id}/discount",
                {
                    "discount_id": eb.id,
                    "as_of": "2026-06-01",
                },
                format="json",
            )
            self.assertEqual(resp.status_code, 201, resp.content)
        finally:
            self._set_discount_eligibility_enabled(True)

    def test_eligible_discounts_filters_rule_typed(self):
        with schema_context(self.schema_name):
            self.course.start_date = date(2026, 1, 1)
            self.course.save(update_fields=["start_date", "updated_at"])
            plain = self.discount
            failing_eb = Discount.objects.create(
                name=f"eb-fail-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("10"),
                scope=Discount.Scope.FIRST_PERIOD,
                eligibility_type=Discount.EligibilityType.EARLY_BIRD,
                early_bird_days=14,
            )
            prior_course = Course.objects.create(
                title=f"Prior {uuid4().hex[:6]}",
                category=self.course.category,
                program=self.course.program,
                start_date=date(2025, 1, 1),
                end_date=date(2025, 6, 1),
                payment_plan=self.plan,
            )
            UserCourse.objects.create(
                user=self.student,
                course=prior_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            loyalty = Discount.objects.create(
                name=f"loy-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("5"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
                eligibility_type=Discount.EligibilityType.LOYALTY,
            )
        client = self._client(self.finance)
        resp = client.get(
            f"/api/v1/user-courses/{self.enrollment.id}/eligible-discounts",
            {"as_of": "2026-01-01"},
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = {item["id"] for item in resp.data["data"]["discounts"]}
        self.assertIn(plain.id, ids)
        self.assertIn(loyalty.id, ids)
        self.assertNotIn(failing_eb.id, ids)
        self.assertEqual(resp.data["data"]["current"], [])

    def test_eligible_discounts_returns_all_when_eligibility_disabled(self):
        self._set_discount_eligibility_enabled(False)
        try:
            with schema_context(self.schema_name):
                failing_eb = Discount.objects.create(
                    name=f"eb-off-{uuid4().hex[:6]}",
                    discount_type=Discount.DiscountType.PERCENT,
                    percent_value=Decimal("10"),
                    scope=Discount.Scope.FIRST_PERIOD,
                    eligibility_type=Discount.EligibilityType.EARLY_BIRD,
                    early_bird_days=14,
                )
                failing_loyalty = Discount.objects.create(
                    name=f"loy-off-{uuid4().hex[:6]}",
                    discount_type=Discount.DiscountType.PERCENT,
                    percent_value=Decimal("5"),
                    scope=Discount.Scope.WHOLE_ENROLLMENT,
                    eligibility_type=Discount.EligibilityType.LOYALTY,
                )
            client = self._client(self.finance)
            resp = client.get(
                f"/api/v1/user-courses/{self.enrollment.id}/eligible-discounts",
                {"as_of": "2026-06-30"},
            )
            self.assertEqual(resp.status_code, 200, resp.content)
            ids = {item["id"] for item in resp.data["data"]["discounts"]}
            self.assertIn(self.discount.id, ids)
            self.assertIn(failing_eb.id, ids)
            self.assertIn(failing_loyalty.id, ids)
        finally:
            self._set_discount_eligibility_enabled(True)

    def test_get_enrollment_discounts_returns_list(self):
        client = self._client(self.finance)
        with schema_context(self.schema_name):
            d2 = Discount.objects.create(
                name=f"disc2-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("5"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            d2_id = d2.id
        client.post(
            f"/api/v1/user-courses/{self.enrollment.id}/discount",
            {"discount_id": self.discount.id},
            format="json",
        )
        client.post(
            f"/api/v1/user-courses/{self.enrollment.id}/discount",
            {"discount_id": d2_id},
            format="json",
        )
        get_resp = client.get(f"/api/v1/user-courses/{self.enrollment.id}/discount")
        self.assertEqual(get_resp.status_code, 200)
        self.assertEqual(len(get_resp.data["data"]), 2)

    def test_add_second_discount_keeps_first(self):
        client = self._client(self.finance)
        with schema_context(self.schema_name):
            d2 = Discount.objects.create(
                name=f"keep-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("5"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            d2_id = d2.id
        self.assertEqual(
            client.post(
                f"/api/v1/user-courses/{self.enrollment.id}/discount",
                {"discount_id": self.discount.id},
                format="json",
            ).status_code,
            201,
        )
        self.assertEqual(
            client.post(
                f"/api/v1/user-courses/{self.enrollment.id}/discount",
                {"discount_id": d2_id},
                format="json",
            ).status_code,
            201,
        )
        get_resp = client.get(f"/api/v1/user-courses/{self.enrollment.id}/discount")
        self.assertEqual(len(get_resp.data["data"]), 2)

    def test_add_duplicate_template_400(self):
        client = self._client(self.finance)
        self.assertEqual(
            client.post(
                f"/api/v1/user-courses/{self.enrollment.id}/discount",
                {"discount_id": self.discount.id},
                format="json",
            ).status_code,
            201,
        )
        resp = client.post(
            f"/api/v1/user-courses/{self.enrollment.id}/discount",
            {"discount_id": self.discount.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertIn("already_applied", str(resp.data))

    def test_delete_one_enrollment_discount(self):
        client = self._client(self.finance)
        with schema_context(self.schema_name):
            d2 = Discount.objects.create(
                name=f"rm1-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("5"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            d2_id = d2.id
        client.post(
            f"/api/v1/user-courses/{self.enrollment.id}/discount",
            {"discount_id": self.discount.id},
            format="json",
        )
        second = client.post(
            f"/api/v1/user-courses/{self.enrollment.id}/discount",
            {"discount_id": d2_id},
            format="json",
        )
        ed_id = second.data["data"]["id"]
        delete_resp = client.delete(
            f"/api/v1/user-courses/{self.enrollment.id}/discount/{ed_id}"
        )
        self.assertEqual(delete_resp.status_code, 200, delete_resp.content)
        get_resp = client.get(f"/api/v1/user-courses/{self.enrollment.id}/discount")
        self.assertEqual(len(get_resp.data["data"]), 1)
        self.assertEqual(get_resp.data["data"][0]["discount"], self.discount.id)

    def test_teacher_forbidden_configure_enrollment_discount(self):
        resp = self._client(self.teacher).post(
            f"/api/v1/user-courses/{self.enrollment.id}/discount",
            {"discount_id": self.discount.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def _set_discount_eligibility_enabled(self, enabled: bool) -> None:
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_discount_eligibility_enabled=enabled
            )

    def test_create_early_bird_rejected_when_eligibility_disabled(self):
        self._set_discount_eligibility_enabled(False)
        try:
            resp = self._client(self.finance).post(
                "/api/v1/discounts",
                {
                    "name": f"eb-off-{uuid4().hex[:6]}",
                    "discount_type": "percent",
                    "percent_value": "10",
                    "scope": "first_period",
                    "eligibility_type": "early_bird",
                    "early_bird_days": 14,
                },
                format="json",
            )
            self.assertEqual(resp.status_code, 400, resp.content)
            body = resp.json() if hasattr(resp, "json") else resp.data
            details = body.get("details", body)
            self.assertIn("eligibility_type", str(details))
        finally:
            self._set_discount_eligibility_enabled(True)

    def test_create_omitting_eligibility_defaults_none_when_disabled(self):
        self._set_discount_eligibility_enabled(False)
        try:
            name = f"plain-off-{uuid4().hex[:6]}"
            resp = self._client(self.finance).post(
                "/api/v1/discounts",
                {
                    "name": name,
                    "discount_type": "percent",
                    "percent_value": "10",
                    "scope": "whole_enrollment",
                },
                format="json",
            )
            self.assertEqual(resp.status_code, 201, resp.content)
            data = resp.data["data"]
            self.assertEqual(data["eligibility_type"], "none")
            self.assertIsNone(data.get("early_bird_days"))
            self.assertIsNone(data.get("bulk_min_courses"))
        finally:
            self._set_discount_eligibility_enabled(True)

    def test_update_coerces_eligibility_when_disabled(self):
        self._set_discount_eligibility_enabled(False)
        try:
            with schema_context(self.schema_name):
                eb = Discount.objects.create(
                    name=f"eb-coerce-{uuid4().hex[:6]}",
                    discount_type=Discount.DiscountType.PERCENT,
                    percent_value=Decimal("10"),
                    scope=Discount.Scope.FIRST_PERIOD,
                    eligibility_type=Discount.EligibilityType.EARLY_BIRD,
                    early_bird_days=14,
                )
                eb_id = eb.id
            new_name = f"renamed-{uuid4().hex[:6]}"
            # PUT without eligibility fields — stored early_bird must coerce to none.
            resp = self._client(self.finance).put(
                f"/api/v1/discounts/{eb_id}",
                {
                    "name": new_name,
                    "discount_type": "percent",
                    "percent_value": "10",
                    "scope": "first_period",
                },
                format="json",
            )
            self.assertEqual(resp.status_code, 200, resp.content)
            with schema_context(self.schema_name):
                eb.refresh_from_db()
                self.assertEqual(eb.name, new_name)
                self.assertEqual(eb.eligibility_type, Discount.EligibilityType.NONE)
                self.assertIsNone(eb.early_bird_days)
                self.assertIsNone(eb.bulk_min_courses)
        finally:
            self._set_discount_eligibility_enabled(True)

    def test_create_early_bird_allowed_when_eligibility_enabled(self):
        self._set_discount_eligibility_enabled(True)
        resp = self._client(self.finance).post(
            "/api/v1/discounts",
            {
                "name": f"eb-on-{uuid4().hex[:6]}",
                "discount_type": "percent",
                "percent_value": "10",
                "scope": "first_period",
                "eligibility_type": "early_bird",
                "early_bird_days": 14,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(resp.data["data"]["eligibility_type"], "early_bird")
        self.assertEqual(resp.data["data"]["early_bird_days"], 14)

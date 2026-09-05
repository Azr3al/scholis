import io
import unittest
from datetime import date
from decimal import Decimal
from uuid import uuid4
from zoneinfo import ZoneInfo

from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Campus
from app_hr.models import BuildingCheckin
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
@override_settings(RBAC_ENFORCE="log_only")
class CampusCheckinAPITests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.teacher = User.objects.create_user(
                email=f"teacher-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.org = Organization.objects.order_by("id").first()
            self.org.is_building_checkin_enabled = True
            self.org.campus_checkin_verification_mode = Organization.CampusCheckinVerificationMode.SELFIE_ONLY
            self.org.save(
                update_fields=[
                    "is_building_checkin_enabled",
                    "campus_checkin_verification_mode",
                ]
            )
            self.main_campus = Campus.objects.create(
                name=f"Main Campus {suffix}",
                description="-",
                is_online=False,
                latitude=Decimal("16.800000"),
                longitude=Decimal("96.150000"),
                geofence_radius_meters=120,
            )
            self.secondary_campus = Campus.objects.create(
                name=f"Secondary Campus {suffix}",
                description="-",
                is_online=False,
            )
            self.online_campus = Campus.objects.create(
                name=f"Online Campus {suffix}",
                description="-",
                is_online=True,
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    @staticmethod
    def _jpg_upload(name: str = "selfie.jpg") -> SimpleUploadedFile:
        buf = io.BytesIO()
        Image.new("RGB", (2, 2), color=(255, 255, 255)).save(buf, format="JPEG")
        return SimpleUploadedFile(name, buf.getvalue(), content_type="image/jpeg")

    def _tenant_local_today(self):
        with schema_context(self.schema_name):
            org = Organization.objects.order_by("id").first()
            tenant_tz = ZoneInfo((org.timezone or "UTC").strip() or "UTC")
        return timezone.now().astimezone(tenant_tz).date()

    def test_status_with_jwt_token_user(self):
        """Stateless JWT auth yields TokenUser, not a User model instance."""
        token_user = _jwt_token_user(self.teacher.email)
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(token_user).get("/api/v1/campus-checkin/status")

        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data["message"], "success")
        self.assertFalse(resp.data["data"]["has_checked_in"])

    def test_selfie_only_checkin_requires_image(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).post(
                "/api/v1/campus-checkin",
                {"campus_id": str(self.main_campus.id)},
                format="multipart",
            )

        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertEqual(resp.data["message"], "image_required")
        with schema_context(self.schema_name):
            self.assertFalse(BuildingCheckin.objects.filter(user=self.teacher).exists())

    def test_checkout_after_checkin_selfie_only(self):
        client = self._client(self.teacher)
        with self.settings(RBAC_ENFORCE="enforce"):
            checkin_resp = client.post(
                "/api/v1/campus-checkin",
                {
                    "campus_id": str(self.main_campus.id),
                    "checkin_image": self._jpg_upload("checkin.jpg"),
                },
                format="multipart",
            )
            checkout_resp = client.put(
                "/api/v1/campus-checkin",
                {"checkout_image": self._jpg_upload("checkout.jpg")},
                format="multipart",
            )

        self.assertEqual(checkin_resp.status_code, 200, checkin_resp.content)
        self.assertEqual(checkout_resp.status_code, 200, checkout_resp.content)
        self.assertEqual(checkout_resp.data["message"], "checked_out")
        with schema_context(self.schema_name):
            row = BuildingCheckin.objects.get(
                user=self.teacher,
                date=self._tenant_local_today(),
            )
            self.assertIsNotNone(row.actual_checkin_time)
            self.assertIsNotNone(row.actual_checkout_time)
            self.assertEqual(
                row.checkout_verification_method,
                BuildingCheckin.VerificationMethod.SELFIE,
            )
            self.assertTrue(bool(row.checkout_image))

    def test_campus_checkin_disabled_returns_403(self):
        with schema_context(self.schema_name):
            self.org.is_building_checkin_enabled = False
            self.org.save(update_fields=["is_building_checkin_enabled"])

        with self.settings(RBAC_ENFORCE="enforce"):
            status_resp = self._client(self.teacher).get("/api/v1/campus-checkin/status")
            checkin_resp = self._client(self.teacher).post(
                "/api/v1/campus-checkin",
                {
                    "campus_id": str(self.main_campus.id),
                    "checkin_image": self._jpg_upload("checkin.jpg"),
                },
                format="multipart",
            )

        self.assertEqual(status_resp.status_code, 403, status_resp.content)
        self.assertEqual(status_resp.data["message"], "campus_checkin_disabled")
        self.assertEqual(checkin_resp.status_code, 403, checkin_resp.content)
        self.assertEqual(checkin_resp.data["message"], "campus_checkin_disabled")

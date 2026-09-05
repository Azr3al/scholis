import io
import unittest
from datetime import date, datetime, time
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


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class CampusCheckinCsvMergeTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.employee_no = f"EMP-{suffix}"
        with schema_context(self.schema_name):
            seed_rbac()
            self.hr_user = User.objects.create_user(
                email=f"hr-{suffix}@example.com",
                password="x",
                name="HR User",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.HR],
            )
            self.teacher = User.objects.create_user(
                email=f"teacher-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
                access_log_name=self.employee_no,
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

    @staticmethod
    def _dahua_csv(employee_no: str, checkin_dt: datetime, checkout_dt: datetime) -> SimpleUploadedFile:
        content = (
            "employee-no,date,record-type\n"
            f"{employee_no},{checkin_dt.strftime('%Y-%m-%d %H:%M:%S')},Check In\n"
            f"{employee_no},{checkout_dt.strftime('%Y-%m-%d %H:%M:%S')},Check Out\n"
        )
        return SimpleUploadedFile("access_log.csv", content.encode("utf-8"), content_type="text/csv")

    def test_csv_updates_checkout_on_self_service_row(self):
        local_today = self._tenant_local_today()
        csv_checkin_dt = timezone.make_aware(datetime.combine(local_today, time(8, 0, 0)))
        csv_checkout_dt = timezone.make_aware(datetime.combine(local_today, time(17, 0, 0)))

        teacher_client = self._client(self.teacher)
        with self.settings(RBAC_ENFORCE="enforce"):
            checkin_resp = teacher_client.post(
                "/api/v1/campus-checkin",
                {
                    "campus_id": str(self.main_campus.id),
                    "checkin_image": self._jpg_upload("checkin.jpg"),
                },
                format="multipart",
            )

        self.assertEqual(checkin_resp.status_code, 200, checkin_resp.content)

        with schema_context(self.schema_name):
            row_before = BuildingCheckin.objects.get(
                user=self.teacher,
                date=local_today,
            )
            row_id = row_before.id
            self.assertEqual(row_before.campus_id, self.main_campus.id)
            self.assertIsNotNone(row_before.actual_checkin_time)
            self.assertIsNone(row_before.actual_checkout_time)
            self.assertEqual(
                row_before.checkin_verification_method,
                BuildingCheckin.VerificationMethod.SELFIE,
            )
            self.assertTrue(bool(row_before.checkin_image))

        hr_client = self._client(self.hr_user)
        with self.settings(RBAC_ENFORCE="enforce"):
            csv_resp = hr_client.post(
                "/api/v1/parse-access-log/dahua",
                {"file": self._dahua_csv(self.employee_no, csv_checkin_dt, csv_checkout_dt)},
                format="multipart",
            )

        self.assertEqual(csv_resp.status_code, 200, csv_resp.content)
        self.assertFalse(csv_resp.data["isError"])
        self.assertEqual(csv_resp.data["data"]["updated"], 1)
        self.assertEqual(csv_resp.data["data"]["created"], 0)

        with schema_context(self.schema_name):
            row_after = BuildingCheckin.objects.get(
                user=self.teacher,
                date=local_today,
            )
            self.assertEqual(row_after.id, row_id)
            self.assertEqual(row_after.campus_id, self.main_campus.id)
            self.assertEqual(
                row_after.checkin_verification_method,
                BuildingCheckin.VerificationMethod.SELFIE,
            )
            self.assertTrue(bool(row_after.checkin_image))
            self.assertIsNotNone(row_after.actual_checkout_time)
            self.assertEqual(row_after.actual_checkout_time, csv_checkout_dt)

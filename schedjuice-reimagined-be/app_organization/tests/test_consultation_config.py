from django.db import connection
from django.test import SimpleTestCase, TestCase

from app_organization.models import Organization
from app_organization.serializers import OrganizationSerializer


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class ConsultationConfigModelDefaultsTests(SimpleTestCase):
    def test_defaults(self):
        org = Organization(name="T", schema_name="t_consult")
        self.assertFalse(org.is_consultation_booking_on)
        self.assertEqual(
            org.consultation_strategy,
            Organization.ConsultationStrategy.LWTP,
        )


class ConsultationConfigSerializerTests(SimpleTestCase):
    def test_serializer_rejects_invalid_strategy(self):
        org = Organization(
            name="T2", schema_name="t_consult2", available_domains=[]
        )
        ser = OrganizationSerializer(
            org,
            data={"consultation_strategy": "unknown"},
            partial=True,
        )
        self.assertFalse(ser.is_valid())
        self.assertIn("consultation_strategy", ser.errors)

    def test_serializer_accepts_lwtp_and_booking_toggle(self):
        org = Organization(
            name="T3", schema_name="t_consult3", available_domains=[]
        )
        ser = OrganizationSerializer(
            org,
            data={
                "is_consultation_booking_on": True,
                "consultation_strategy": "lwtp",
            },
            partial=True,
        )
        self.assertTrue(ser.is_valid(), ser.errors)
        self.assertTrue(ser.validated_data["is_consultation_booking_on"])
        self.assertEqual(ser.validated_data["consultation_strategy"], "lwtp")


class ConsultationConfigPersistenceTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if not _database_reachable():
            raise AssertionError("PostgreSQL not available")

    def setUp(self):
        self.org = Organization.objects.filter(schema_name="xschedjuice").first()
        if self.org is None:
            self.skipTest("xschedjuice tenant not bootstrapped")

    def test_update_persists_consultation_fields(self):
        previous_booking = self.org.is_consultation_booking_on
        previous_strategy = self.org.consultation_strategy
        try:
            ser = OrganizationSerializer(
                self.org,
                data={
                    "is_consultation_booking_on": True,
                    "consultation_strategy": "lwtp",
                },
                partial=True,
            )
            self.assertTrue(ser.is_valid(), ser.errors)
            ser.save()

            self.org.refresh_from_db()
            self.assertTrue(self.org.is_consultation_booking_on)
            self.assertEqual(
                self.org.consultation_strategy,
                Organization.ConsultationStrategy.LWTP,
            )

            data = OrganizationSerializer(self.org).data
            self.assertTrue(data["is_consultation_booking_on"])
            self.assertEqual(data["consultation_strategy"], "lwtp")
        finally:
            self.org.is_consultation_booking_on = previous_booking
            self.org.consultation_strategy = previous_strategy
            self.org.save(
                update_fields=[
                    "is_consultation_booking_on",
                    "consultation_strategy",
                    "updated_at",
                ]
            )

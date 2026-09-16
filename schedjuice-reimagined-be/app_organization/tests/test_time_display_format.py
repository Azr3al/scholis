from django.test import SimpleTestCase

from app_organization.models import Organization
from app_organization.serializers import OrganizationSerializer


class TimeDisplayFormatTests(SimpleTestCase):
    def test_model_default_is_12h(self):
        org = Organization(name="T", schema_name="t_time_fmt")
        self.assertEqual(org.time_display_format, Organization.TimeDisplayFormat.TWELVE_H)

    def test_serializer_rejects_invalid_choice(self):
        org = Organization(
            name="T2", schema_name="t_time_fmt2", available_domains=[]
        )
        ser = OrganizationSerializer(
            org,
            data={"time_display_format": "36h"},
            partial=True,
        )
        self.assertFalse(ser.is_valid())
        self.assertIn("time_display_format", ser.errors)

    def test_serializer_accepts_24h(self):
        org = Organization(
            name="T3", schema_name="t_time_fmt3", available_domains=[]
        )
        ser = OrganizationSerializer(
            org,
            data={"time_display_format": "24h"},
            partial=True,
        )
        self.assertTrue(ser.is_valid(), ser.errors)
        self.assertEqual(ser.validated_data["time_display_format"], "24h")

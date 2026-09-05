from decimal import Decimal
from django.test import SimpleTestCase

from app_hr.campus_checkin_verification import (
    VerificationOutcome,
    distance_meters,
    resolve_verification,
)
from app_organization.models import Organization


class DistanceMetersTest(SimpleTestCase):
    def test_same_point_is_zero(self):
        self.assertEqual(distance_meters(16.8, 96.15, 16.8, 96.15), 0.0)

    def test_known_offset_is_positive(self):
        d = distance_meters(16.8000, 96.1500, 16.8010, 96.1500)
        self.assertGreater(d, 100)
        self.assertLess(d, 120)


class ResolveVerificationTest(SimpleTestCase):
    def test_geo_only_inside_fence(self):
        outcome = resolve_verification(
            mode=Organization.CampusCheckinVerificationMode.GEO_ONLY,
            campus_lat=Decimal("16.8"),
            campus_lng=Decimal("96.15"),
            radius_meters=200,
            client_lat=Decimal("16.80001"),
            client_lng=Decimal("96.15001"),
            has_image=False,
        )
        self.assertEqual(outcome.result, VerificationOutcome.ACCEPT_GEO)

    def test_geo_only_outside_fence(self):
        outcome = resolve_verification(
            mode=Organization.CampusCheckinVerificationMode.GEO_ONLY,
            campus_lat=Decimal("16.8"),
            campus_lng=Decimal("96.15"),
            radius_meters=50,
            client_lat=Decimal("16.81"),
            client_lng=Decimal("96.15"),
            has_image=True,
        )
        self.assertEqual(outcome.result, VerificationOutcome.REJECT_OUTSIDE_GEOFENCE)

    def test_geo_fallback_without_coords_requires_selfie(self):
        outcome = resolve_verification(
            mode=Organization.CampusCheckinVerificationMode.GEO_WITH_SELFIE_FALLBACK,
            campus_lat=Decimal("16.8"),
            campus_lng=Decimal("96.15"),
            radius_meters=100,
            client_lat=None,
            client_lng=None,
            has_image=False,
        )
        self.assertEqual(outcome.result, VerificationOutcome.REQUIRE_SELFIE)

    def test_selfie_only_always_requires_image(self):
        outcome = resolve_verification(
            mode=Organization.CampusCheckinVerificationMode.SELFIE_ONLY,
            campus_lat=None,
            campus_lng=None,
            radius_meters=100,
            client_lat=Decimal("16.8"),
            client_lng=Decimal("96.15"),
            has_image=False,
        )
        self.assertEqual(outcome.result, VerificationOutcome.REQUIRE_SELFIE)

import math
from dataclasses import dataclass
from decimal import Decimal
from enum import Enum
from typing import Optional

from app_organization.models import Organization


class VerificationOutcome(str, Enum):
    ACCEPT_GEO = "accept_geo"
    REQUIRE_SELFIE = "require_selfie"
    REJECT_OUTSIDE_GEOFENCE = "outside_geofence"
    REJECT_LOCATION_REQUIRED = "location_required"
    REJECT_CAMPUS_NOT_CONFIGURED = "campus_not_configured"


@dataclass(frozen=True)
class VerificationResult:
    result: VerificationOutcome
    method: Optional[str] = None  # "geo" | "selfie" when accepted/require selfie path


def distance_meters(lat1, lng1, lat2, lng2) -> float:
    """Haversine distance in meters."""
    r = 6371000.0
    phi1, phi2 = math.radians(float(lat1)), math.radians(float(lat2))
    dphi = math.radians(float(lat2) - float(lat1))
    dlambda = math.radians(float(lng2) - float(lng1))
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _within_fence(
    campus_lat: Optional[Decimal],
    campus_lng: Optional[Decimal],
    radius_meters: int,
    client_lat: Optional[Decimal],
    client_lng: Optional[Decimal],
) -> Optional[bool]:
    if campus_lat is None or campus_lng is None:
        return None
    if client_lat is None or client_lng is None:
        return None
    return distance_meters(campus_lat, campus_lng, client_lat, client_lng) <= radius_meters


def resolve_verification(
    *,
    mode: str,
    campus_lat: Optional[Decimal],
    campus_lng: Optional[Decimal],
    radius_meters: int,
    client_lat: Optional[Decimal],
    client_lng: Optional[Decimal],
    has_image: bool,
) -> VerificationResult:
    if mode == Organization.CampusCheckinVerificationMode.SELFIE_ONLY:
        if has_image:
            return VerificationResult(VerificationOutcome.ACCEPT_GEO, method="selfie")
        return VerificationResult(VerificationOutcome.REQUIRE_SELFIE)

    within = _within_fence(campus_lat, campus_lng, radius_meters, client_lat, client_lng)

    if mode == Organization.CampusCheckinVerificationMode.GEO_ONLY:
        if within is None:
            if campus_lat is None or campus_lng is None:
                return VerificationResult(VerificationOutcome.REJECT_CAMPUS_NOT_CONFIGURED)
            return VerificationResult(VerificationOutcome.REJECT_LOCATION_REQUIRED)
        if within:
            return VerificationResult(VerificationOutcome.ACCEPT_GEO, method="geo")
        return VerificationResult(VerificationOutcome.REJECT_OUTSIDE_GEOFENCE)

    # geo_with_selfie_fallback
    if within is True:
        return VerificationResult(VerificationOutcome.ACCEPT_GEO, method="geo")
    if has_image:
        return VerificationResult(VerificationOutcome.ACCEPT_GEO, method="selfie")
    return VerificationResult(VerificationOutcome.REQUIRE_SELFIE)

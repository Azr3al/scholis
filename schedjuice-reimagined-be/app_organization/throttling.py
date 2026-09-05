from django.conf import settings
from rest_framework.throttling import AnonRateThrottle


class OrganizationPublicAnonThrottle(AnonRateThrottle):
    """Anon-only bucket for GET /organizations/public."""

    scope = "organization_public"

    def get_rate(self):
        rates = (getattr(settings, "REST_FRAMEWORK", {}) or {}).get(
            "DEFAULT_THROTTLE_RATES"
        ) or {}
        return rates.get(self.scope, "120/minute")

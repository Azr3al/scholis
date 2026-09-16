"""Microsoft Graph license inventory helpers."""

from __future__ import annotations

import logging

import requests
from rest_framework.exceptions import ValidationError

from app_microsoft.graph_wrapper.base import BaseMSRequest
from app_microsoft.graph_wrapper.retry import graph_call_with_retry

logger = logging.getLogger(__name__)


def _license_for_user_type(tenant, user_type: str) -> str | None:
    if user_type == "student":
        return getattr(tenant, "student_license_id", None) or None
    return getattr(tenant, "staff_license_id", None) or None


def _available_units_from_sku_entry(sku_entry: dict) -> int:
    prepaid = sku_entry.get("prepaidUnits") or {}
    enabled = int(prepaid.get("enabled") or 0)
    consumed = int(sku_entry.get("consumedUnits") or 0)
    return max(enabled - consumed, 0)


class MSLicense(BaseMSRequest):
    def list_subscribed_skus(self) -> requests.Response:
        return graph_call_with_retry(
            "list subscribedSkus",
            lambda: self.get(f"{self.URL}subscribedSkus"),
        )

    def available_units_for_sku(self, sku_id: str) -> int | None:
        """Return available seat count for *sku_id*, or None if inventory cannot be read."""
        if not sku_id:
            return 0

        res = self.list_subscribed_skus()
        if res.status_code == 403:
            logger.warning(
                "MS Graph subscribedSkus returned 403; skipping license availability "
                "pre-check (grant Organization.Read.All application permission)."
            )
            return None
        if res.status_code not in range(199, 300):
            logger.warning(
                "MS Graph subscribedSkus failed (status=%s); skipping license "
                "availability pre-check: %s",
                res.status_code,
                (res.text or "")[:400],
            )
            return None

        body = res.json()
        for entry in body.get("value") or []:
            if str(entry.get("skuId") or "").lower() == str(sku_id).lower():
                return _available_units_from_sku_entry(entry)
        return 0


def assert_license_available_for_user_type(tenant, user_type: str) -> None:
    """Raise ValidationError when the tenant has no available seats for *user_type*."""
    license_id = _license_for_user_type(tenant, user_type)
    if not license_id:
        raise ValidationError(
            {
                "MS_ERROR": {
                    "error": {
                        "message": (
                            f"No {user_type} license configured for this organization."
                        )
                    }
                },
                "step": "license availability check",
                "license_blocked": True,
            }
        )

    available = MSLicense(tenant).available_units_for_sku(license_id)
    if available is None:
        return

    if available <= 0:
        raise ValidationError(
            {
                "MS_ERROR": {
                    "error": {
                        "message": (
                            f"Subscription with SKU {license_id} does not have "
                            "any available licenses."
                        )
                    }
                },
                "step": "license availability check",
                "license_blocked": True,
            }
        )

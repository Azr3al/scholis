from __future__ import annotations

import re
from typing import Literal

from app_organization.models import MobileAppVersionPolicy

VersionStatus = Literal["required", "recommended", "none"]

_VERSION_PART_RE = re.compile(r"\d+")


def parse_version_parts(raw: str | None) -> tuple[int, ...]:
    """Parse dotted semver-ish strings into comparable integer tuples."""
    if not raw:
        return (0,)
    parts = _VERSION_PART_RE.findall(str(raw).strip())
    if not parts:
        return (0,)
    return tuple(int(part) for part in parts)


def compare_versions(left: str | None, right: str | None) -> int:
    """Return -1 if left < right, 0 if equal, 1 if left > right."""
    left_parts = parse_version_parts(left)
    right_parts = parse_version_parts(right)
    max_len = max(len(left_parts), len(right_parts))
    left_padded = left_parts + (0,) * (max_len - len(left_parts))
    right_padded = right_parts + (0,) * (max_len - len(right_parts))
    if left_padded < right_padded:
        return -1
    if left_padded > right_padded:
        return 1
    return 0


def evaluate_version_status(
    policy: MobileAppVersionPolicy | None,
    installed_version: str | None,
) -> VersionStatus:
    if policy is None or not policy.is_enabled:
        return "none"
    if not installed_version:
        return "none"
    if compare_versions(installed_version, policy.minimum_version) < 0:
        return "required"
    recommended = (policy.recommended_version or "").strip()
    if recommended and compare_versions(installed_version, recommended) < 0:
        return "recommended"
    return "none"


def serialize_policy(policy: MobileAppVersionPolicy) -> dict:
    return {
        "id": policy.id,
        "variant": policy.variant,
        "platform": policy.platform,
        "minimum_version": policy.minimum_version,
        "recommended_version": policy.recommended_version,
        "latest_version": policy.latest_version,
        "store_url": policy.store_url,
        "message": policy.message,
        "is_enabled": policy.is_enabled,
    }

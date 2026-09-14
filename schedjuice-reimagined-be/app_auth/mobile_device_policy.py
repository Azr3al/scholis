"""
Single mobile device enforcement for native app sessions.

Enforcement runs on login (create_refresh_session), not on token refresh.
"""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from app_auth.models import ClientType, MobileDevice, RefreshSession, User
from app_auth.mobile_device_push import send_session_revoked_push
from app_auth.session_revoked import (
    REVOKED_REASON_ADMIN_REVOKED,
    REVOKED_REASON_DEVICE_DISPLACED,
    REVOKED_REASON_SESSION_ROTATED,
)
from app_organization.models import Organization


def _active_mobile_sessions(*, user: User, now=None):
    now = now or timezone.now()
    return RefreshSession.objects.filter(
        user=user,
        client_type=ClientType.MOBILE_NATIVE,
        revoked_at__isnull=True,
        expires_at__gt=now,
    )


def register_mobile_device_for_session(
    user: User,
    session: RefreshSession,
    meta: dict,
    org: Organization,
) -> MobileDevice:
    """Upsert MobileDevice for the installation and link it to the new session."""
    now = timezone.now()
    display_name = meta.get("display_name") or "Mobile device"
    device, _created = MobileDevice.objects.update_or_create(
        user=user,
        installation_id=meta["installation_id"],
        defaults={
            "display_name": display_name,
            "device_model": meta.get("device_model"),
            "os_name": meta.get("os_name"),
            "os_version": meta.get("os_version"),
            "app_version": meta.get("app_version"),
            "last_seen_at": now,
            "is_active": True,
        },
    )
    session.mobile_device = device
    session.save(update_fields=["mobile_device", "updated_at"])
    return device


def enforce_single_mobile_device(
    user: User,
    session: RefreshSession,
    mobile_device: MobileDevice,
    org: Organization,
) -> list[MobileDevice]:
    """
    Revoke competing mobile sessions when org policy is enabled.

    Returns MobileDevice rows displaced on other installations (for push in Task 10).
    """
    if not org.is_single_mobile_device_enabled:
        return []

    now = timezone.now()

    _active_mobile_sessions(user=user, now=now).filter(
        mobile_device=mobile_device,
    ).exclude(session_id=session.session_id).update(
        revoked_at=now,
        revoked_reason=REVOKED_REASON_SESSION_ROTATED,
    )

    other_sessions = _active_mobile_sessions(user=user, now=now).exclude(
        session_id=session.session_id
    ).exclude(mobile_device=mobile_device)

    displaced_device_ids = list(
        other_sessions.exclude(mobile_device__isnull=True)
        .values_list("mobile_device_id", flat=True)
        .distinct()
    )

    other_sessions.update(
        revoked_at=now,
        revoked_reason=REVOKED_REASON_DEVICE_DISPLACED,
    )

    if not displaced_device_ids:
        return []

    MobileDevice.objects.filter(id__in=displaced_device_ids).update(
        is_active=False,
        revoked_at=now,
    )
    displaced_devices = list(MobileDevice.objects.filter(id__in=displaced_device_ids))
    if displaced_devices:
        send_session_revoked_push(user, REVOKED_REASON_DEVICE_DISPLACED)
    return displaced_devices


def _active_sessions_for_device(device: MobileDevice, now=None):
    now = now or timezone.now()
    return RefreshSession.objects.filter(
        mobile_device=device,
        revoked_at__isnull=True,
        expires_at__gt=now,
    )


def revoke_mobile_device(
    device: MobileDevice,
    *,
    reason: str = REVOKED_REASON_ADMIN_REVOKED,
) -> int:
    """
    Revoke active sessions for a mobile device and mark the device inactive.

    Returns the number of sessions revoked.
    """
    now = timezone.now()
    sessions_revoked = _active_sessions_for_device(device, now=now).update(
        revoked_at=now,
        revoked_reason=reason,
    )

    update_fields = []
    if device.is_active:
        device.is_active = False
        update_fields.append("is_active")
    if device.revoked_at is None:
        device.revoked_at = now
        update_fields.append("revoked_at")
    if update_fields:
        update_fields.append("updated_at")
        device.save(update_fields=update_fields)

    if sessions_revoked > 0:
        send_session_revoked_push(device.user, reason)

    return sessions_revoked


def revoke_mobile_devices(
    devices,
    *,
    reason: str = REVOKED_REASON_ADMIN_REVOKED,
) -> dict:
    """Revoke multiple mobile devices. Returns summary counts."""
    device_list = list(devices)
    sessions_revoked = 0
    for device in device_list:
        sessions_revoked += revoke_mobile_device(device, reason=reason)
    return {
        "revoked_count": len(device_list),
        "sessions_revoked": sessions_revoked,
        "device_ids": [device.id for device in device_list],
    }


def revoke_stale_mobile_devices(
    *,
    inactive_days: int,
    reason: str = REVOKED_REASON_ADMIN_REVOKED,
) -> dict:
    """Revoke active devices whose last_seen_at is older than inactive_days."""
    cutoff = timezone.now() - timedelta(days=inactive_days)
    devices = MobileDevice.objects.filter(
        is_active=True,
        last_seen_at__lt=cutoff,
    )
    return revoke_mobile_devices(devices, reason=reason)

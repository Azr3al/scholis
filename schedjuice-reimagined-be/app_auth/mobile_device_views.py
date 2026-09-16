from __future__ import annotations

from datetime import timedelta

from django.db.models import OuterRef, Q, Subquery
from django.utils import timezone
from rest_framework.views import Request

from app_auth.mobile_device_policy import (
    revoke_mobile_device,
    revoke_mobile_devices,
    revoke_stale_mobile_devices,
)
from app_auth.mobile_device_serializers import (
    MobileDeviceDetailSerializer,
    MobileDeviceListSerializer,
)
from app_auth.models import MobileDevice, RefreshSession, User
from app_auth.session_revoked import REVOKED_REASON_ADMIN_REVOKED
from app_rbac.views import RBACView
from utilitas.pagination import CustomPagination


def _parse_optional_bool(raw: str | None) -> bool | None:
    if raw is None or raw == "":
        return None
    lowered = str(raw).strip().lower()
    if lowered in ("true", "1", "yes"):
        return True
    if lowered in ("false", "0", "no"):
        return False
    return None


def _mobile_device_queryset():
    active_session_subquery = (
        RefreshSession.objects.filter(
            mobile_device=OuterRef("pk"),
            revoked_at__isnull=True,
        )
        .order_by("-created_at")
        .values("session_id")[:1]
    )
    return MobileDevice.objects.select_related("user").annotate(
        _active_session_id=Subquery(active_session_subquery)
    )


def _apply_mobile_device_filters(qs, request: Request):
    user_id_raw = request.query_params.get("user_id")
    if user_id_raw not in (None, ""):
        try:
            qs = qs.filter(user_id=int(user_id_raw))
        except (TypeError, ValueError):
            return None, "user_id must be an integer."

    is_active_raw = request.query_params.get("is_active")
    if is_active_raw not in (None, ""):
        parsed = _parse_optional_bool(is_active_raw)
        if parsed is None:
            return None, "is_active must be true or false."
        qs = qs.filter(is_active=parsed)

    q = (request.query_params.get("q") or "").strip()
    if q:
        qs = qs.filter(Q(user__name__icontains=q) | Q(user__email__icontains=q))

    stale_days_raw = request.query_params.get("stale_days")
    if stale_days_raw not in (None, ""):
        try:
            stale_days = int(stale_days_raw)
        except (TypeError, ValueError):
            return None, "stale_days must be an integer."
        if stale_days < 0:
            return None, "stale_days must be zero or greater."
        cutoff = timezone.now() - timedelta(days=stale_days)
        qs = qs.filter(last_seen_at__lt=cutoff)

    return qs.order_by("-last_seen_at"), None


class MobileDeviceListView(RBACView):
    name = "Mobile devices list"
    required_permissions = {"GET": "mobile_device.view"}
    pagination_class = CustomPagination

    def get(self, request: Request):
        qs, error = _apply_mobile_device_filters(_mobile_device_queryset(), request)
        if error:
            return self.bad_request(error)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        ser = MobileDeviceListSerializer(page, many=True)
        meta = paginator.get_paginated_response()
        return self.ok({"items": ser.data, **meta})


class MobileDeviceDetailView(RBACView):
    name = "Mobile device detail"
    required_permissions = {"GET": "mobile_device.view"}

    def get(self, request: Request, device_id: int):
        device = _mobile_device_queryset().filter(pk=device_id).first()
        if device is None:
            return self.not_found("Mobile device not found.")
        return self.ok(MobileDeviceDetailSerializer(device).data)


class UserMobileDeviceListView(RBACView):
    name = "User mobile devices list"
    required_permissions = {"GET": "mobile_device.view"}
    pagination_class = CustomPagination

    def get(self, request: Request, user_id: int):
        if not User.objects.filter(pk=user_id).exists():
            return self.not_found("User not found.")
        qs, error = _apply_mobile_device_filters(
            _mobile_device_queryset().filter(user_id=user_id),
            request,
        )
        if error:
            return self.bad_request(error)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        ser = MobileDeviceListSerializer(page, many=True)
        meta = paginator.get_paginated_response()
        return self.ok({"items": ser.data, **meta})


class MobileDeviceRevokeView(RBACView):
    name = "Mobile device revoke"
    required_permissions = {"POST": "mobile_device.revoke"}

    def post(self, request: Request, device_id: int):
        device = MobileDevice.objects.select_related("user").filter(pk=device_id).first()
        if device is None:
            return self.not_found("Mobile device not found.")
        sessions_revoked = revoke_mobile_device(
            device,
            reason=REVOKED_REASON_ADMIN_REVOKED,
        )
        return self.ok(
            {
                "device_id": device.id,
                "revoked": True,
                "sessions_revoked": sessions_revoked,
            }
        )


class MobileDeviceBulkRevokeView(RBACView):
    name = "Mobile devices bulk revoke"
    required_permissions = {"POST": "mobile_device.revoke"}

    def post(self, request: Request):
        device_ids = request.data.get("device_ids")
        user_id = request.data.get("user_id")

        has_device_ids = device_ids is not None
        has_user_id = user_id is not None

        if has_device_ids and has_user_id:
            return self.bad_request("Provide device_ids or user_id, not both.")
        if not has_device_ids and not has_user_id:
            return self.bad_request("Provide device_ids or user_id.")

        if has_user_id:
            try:
                user_id = int(user_id)
            except (TypeError, ValueError):
                return self.bad_request("user_id must be an integer.")
            if not User.objects.filter(pk=user_id).exists():
                return self.not_found("User not found.")
            devices = MobileDevice.objects.filter(user_id=user_id, is_active=True)
        else:
            if not isinstance(device_ids, list) or not device_ids:
                return self.bad_request("device_ids must be a non-empty list.")
            try:
                parsed_ids = [int(device_id) for device_id in device_ids]
            except (TypeError, ValueError):
                return self.bad_request("device_ids must contain integers.")
            devices = MobileDevice.objects.filter(id__in=parsed_ids)

        result = revoke_mobile_devices(
            devices,
            reason=REVOKED_REASON_ADMIN_REVOKED,
        )
        return self.ok(result)


class MobileDeviceRevokeStaleView(RBACView):
    name = "Mobile devices revoke stale"
    required_permissions = {"POST": "mobile_device.revoke"}

    def post(self, request: Request):
        inactive_days = request.data.get("inactive_days", 90)
        try:
            inactive_days = int(inactive_days)
        except (TypeError, ValueError):
            return self.bad_request("inactive_days must be an integer.")
        if inactive_days < 1:
            return self.bad_request("inactive_days must be at least 1.")

        result = revoke_stale_mobile_devices(inactive_days=inactive_days)
        return self.ok(result)

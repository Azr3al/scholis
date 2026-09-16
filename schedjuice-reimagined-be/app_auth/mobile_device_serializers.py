from __future__ import annotations

from rest_framework import serializers

from app_auth.models import MobileDevice, RefreshSession, User


class MobileDeviceUserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="name")

    class Meta:
        model = User
        fields = ("id", "full_name", "email")
        read_only_fields = fields


class MobileDeviceListSerializer(serializers.ModelSerializer):
    user = MobileDeviceUserSerializer(read_only=True)
    active_session_id = serializers.SerializerMethodField()

    class Meta:
        model = MobileDevice
        fields = (
            "id",
            "user",
            "display_name",
            "device_model",
            "os_name",
            "os_version",
            "app_version",
            "is_active",
            "first_seen_at",
            "last_seen_at",
            "active_session_id",
            "revoked_at",
        )
        read_only_fields = fields

    def get_active_session_id(self, obj) -> str | None:
        annotated = getattr(obj, "_active_session_id", None)
        if annotated is not None:
            return str(annotated)
        session = (
            RefreshSession.objects.filter(
                mobile_device=obj,
                revoked_at__isnull=True,
            )
            .order_by("-created_at")
            .values_list("session_id", flat=True)
            .first()
        )
        return str(session) if session else None


class MobileDeviceDetailSerializer(MobileDeviceListSerializer):
    active_session = serializers.SerializerMethodField()

    class Meta(MobileDeviceListSerializer.Meta):
        fields = MobileDeviceListSerializer.Meta.fields + ("active_session",)

    def get_active_session(self, obj) -> dict | None:
        session = (
            RefreshSession.objects.filter(
                mobile_device=obj,
                revoked_at__isnull=True,
            )
            .order_by("-created_at")
            .first()
        )
        if session is None:
            return None
        return {
            "session_id": str(session.session_id),
            "last_seen_at": session.last_seen_at,
            "expires_at": session.expires_at,
            "created_at": session.created_at,
        }

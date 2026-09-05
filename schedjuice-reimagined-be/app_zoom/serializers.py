"""DRF serializers for Zoom OAuth and connected accounts (safe, no token fields)."""

from __future__ import annotations

from rest_framework import serializers

from app_organization.models import ZoomAccount
from utilitas.serializers import BaseModelSerializer


class ZoomAccountSerializer(BaseModelSerializer):
    has_default_host = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ZoomAccount
        fields = (
            "id",
            "account_id",
            "account_name",
            "authorized_by_email",
            "status",
            "default_host_zoom_user_id",
            "default_host_email",
            "default_host_name",
            "last_validated_at",
            "last_error",
            "has_default_host",
            "created_at",
            "updated_at",
        )

    def get_has_default_host(self, obj: ZoomAccount) -> bool:
        return obj.has_default_host()


class SetZoomDefaultHostSerializer(serializers.Serializer):
    default_host_zoom_user_id = serializers.CharField(max_length=128, required=True)

from __future__ import annotations

import re

from rest_framework import serializers

from app_consultation.constants import WEEKDAY_KEYS
from app_consultation.consultant_helpers import (
    build_booking_manage_url,
    resolve_booking_manage_token,
)
from app_consultation.models import ConsultationBooking, ConsultationWeeklyWhitelist

_HHMM_RE = re.compile(r"^\d{2}:\d{2}$")


def validate_whitelist_schedule(value: dict) -> dict:
    if not isinstance(value, dict):
        raise serializers.ValidationError("schedule must be an object.")

    normalized: dict = {}
    for day in WEEKDAY_KEYS:
        day_config = value.get(day, {"enabled": False, "windows": []})
        if not isinstance(day_config, dict):
            raise serializers.ValidationError(f"{day} must be an object.")
        enabled = bool(day_config.get("enabled", False))
        windows = day_config.get("windows") or []
        if not isinstance(windows, list):
            raise serializers.ValidationError(f"{day}.windows must be a list.")

        normalized_windows = []
        for window in windows:
            if not isinstance(window, dict):
                raise serializers.ValidationError(f"{day}.windows entries must be objects.")
            start = str(window.get("start", "")).strip()
            end = str(window.get("end", "")).strip()
            if not _HHMM_RE.match(start) or not _HHMM_RE.match(end):
                raise serializers.ValidationError(
                    f"{day}.windows start/end must use HH:MM format."
                )
            if start >= end:
                raise serializers.ValidationError(
                    f"{day}.windows start must be before end."
                )
            normalized_windows.append({"start": start, "end": end})

        normalized[day] = {"enabled": enabled, "windows": normalized_windows}

    return normalized


class ConsultationWeeklyWhitelistSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConsultationWeeklyWhitelist
        fields = ("schedule", "slot_duration_minutes")
        read_only_fields = ("slot_duration_minutes",)

    def validate_schedule(self, value):
        return validate_whitelist_schedule(value)


class ConsultationBookingSerializer(serializers.ModelSerializer):
    booking_url = serializers.SerializerMethodField()

    class Meta:
        model = ConsultationBooking
        fields = (
            "id",
            "scheduled_at",
            "duration_minutes",
            "student_name",
            "student_email",
            "details",
            "meeting_link",
            "status",
            "cancelled_at",
            "cancelled_by",
            "created_at",
            "booking_url",
        )
        read_only_fields = fields

    def get_booking_url(self, obj: ConsultationBooking) -> str:
        token = resolve_booking_manage_token(obj)
        if not token:
            return ""
        return build_booking_manage_url(token)

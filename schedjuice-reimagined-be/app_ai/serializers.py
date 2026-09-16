from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

from app_auth.models_user_ai import UserAIPreferences


class UserAIPreferencesSerializer(serializers.Serializer):
    response_language = serializers.ChoiceField(
        choices=UserAIPreferences.ResponseLanguage.choices,
        required=False,
    )
    tone = serializers.ChoiceField(
        choices=UserAIPreferences.Tone.choices,
        required=False,
    )
    verbosity = serializers.ChoiceField(
        choices=UserAIPreferences.Verbosity.choices,
        required=False,
    )
    preferred_name = serializers.CharField(
        max_length=64,
        required=False,
        allow_blank=True,
    )
    monthly_usd_limit = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        required=False,
        allow_null=True,
    )

    def validate_monthly_usd_limit(self, value):
        if value is None:
            return None
        if value <= 0:
            raise serializers.ValidationError("Must be greater than 0.")
        if value > Decimal("99999.99"):
            raise serializers.ValidationError("Must be at most 99999.99.")
        return value

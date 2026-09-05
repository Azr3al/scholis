from __future__ import annotations

from rest_framework import serializers

from app_attachment.models import Attachment
from app_auth.models import User, UserCertification
from schedjuice_backend.storages import PrivateMediaStorage

MAX_CERTIFICATIONS_PER_USER = 50


class UserCertificationSerializer(serializers.ModelSerializer):
    attachment_id = serializers.PrimaryKeyRelatedField(
        source="attachment",
        queryset=Attachment.objects.all(),
        required=False,
        allow_null=True,
    )
    attachment_filename = serializers.SerializerMethodField()
    attachment_url = serializers.SerializerMethodField()

    class Meta:
        model = UserCertification
        fields = (
            "id",
            "title",
            "issuing_organization",
            "issued_on",
            "expires_on",
            "sort_order",
            "attachment_id",
            "attachment_filename",
            "attachment_url",
            "created_at",
        )
        read_only_fields = ("id", "created_at", "attachment_filename", "attachment_url")

    def get_attachment_filename(self, obj) -> str | None:
        return obj.attachment.filename if obj.attachment_id else None

    def get_attachment_url(self, obj) -> str | None:
        if not obj.attachment or not obj.attachment.data:
            return None
        try:
            return PrivateMediaStorage().url(obj.attachment.data.name, expire=3600)
        except Exception:
            return None

    def validate(self, attrs):
        issued = attrs.get("issued_on") or getattr(self.instance, "issued_on", None)
        expires = attrs.get("expires_on")
        if issued and expires and expires < issued:
            raise serializers.ValidationError(
                {"expires_on": "Expiry date must be on or after issue date."}
            )
        return attrs

    def validate_attachment(self, attachment):
        if attachment is None:
            return attachment
        user = self.context.get("subject_user")
        if user is None:
            return attachment
        if attachment.table_name != "user_certification":
            raise serializers.ValidationError("Invalid attachment type.")
        if attachment.foreign_key not in (None, user.pk):
            raise serializers.ValidationError("Attachment does not belong to this user.")
        return attachment

    def create(self, validated_data):
        user = self.context["subject_user"]
        count = UserCertification.objects.filter(user=user).count()
        if count >= MAX_CERTIFICATIONS_PER_USER:
            raise serializers.ValidationError("Maximum certifications limit reached.")
        validated_data["user"] = user
        validated_data["created_by"] = self.context["actor"]
        return super().create(validated_data)

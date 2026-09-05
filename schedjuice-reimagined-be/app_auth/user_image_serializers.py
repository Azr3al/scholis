from __future__ import annotations

from rest_framework import serializers

from app_auth.models import User, UserImage
from app_auth.user_image_validation import validate_user_image_upload
from app_auth.user_images import ResolvedUserImage
from schedjuice_backend.storages import PrivateMediaStorage


class UploadedBySerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "name")
        read_only_fields = fields


class UserImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    uploaded_by = UploadedBySerializer(read_only=True)

    class Meta:
        model = UserImage
        fields = (
            "id",
            "user",
            "image_type",
            "image",
            "image_url",
            "uploaded_by",
            "created_at",
        )
        read_only_fields = ("id", "user", "image_url", "uploaded_by", "created_at")

    def get_image_url(self, obj) -> str | None:
        if not obj.image:
            return None
        try:
            return PrivateMediaStorage().url(obj.image.name, expire=3600)
        except Exception:
            return None

    def validate_image(self, image):
        validate_user_image_upload(image, getattr(image, "name", "upload.jpg"))
        return image

    def validate_image_type(self, value):
        if value not in {c.value for c in UserImage.ImageType}:
            raise serializers.ValidationError("Invalid image_type.")
        return value


class ResolvedUserImageSerializer(serializers.Serializer):
    source = serializers.CharField(allow_null=True)
    url = serializers.CharField(allow_null=True)
    user_image_id = serializers.IntegerField(allow_null=True)
    created_at = serializers.DateTimeField(allow_null=True)

    @classmethod
    def from_resolved(cls, resolved: ResolvedUserImage | None):
        if resolved is None:
            return {
                "source": None,
                "url": None,
                "user_image_id": None,
                "created_at": None,
            }
        return {
            "source": resolved.source,
            "url": resolved.url,
            "user_image_id": resolved.user_image_id,
            "created_at": resolved.created_at,
        }

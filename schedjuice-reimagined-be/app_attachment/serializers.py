from app_attachment import models
from app_attachment.validation import validate_chat_attachment_upload
from utilitas.serializers import BaseModelSerializer


class AttachmentSerializer(BaseModelSerializer):
    viewname = "attachment-upload"

    class Meta:
        model = models.Attachment
        fields = "__all__"
        extra_kwargs = {"table_name": {"read_only": True}}

    def validate(self, attrs):
        attrs = super().validate(attrs)
        upload = attrs.get("data") or attrs.get("public_data")
        filename = attrs.get("filename") or getattr(upload, "name", "")
        if upload:
            detected_mime = validate_chat_attachment_upload(upload, filename)
            attrs["file_type"] = detected_mime
            attrs["size"] = getattr(upload, "size", None)
            attrs["is_image"] = detected_mime.startswith("image/")
        return attrs

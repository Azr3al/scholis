from decimal import Decimal

from rest_framework import serializers

from app_organization import models
from utilitas.serializers import BaseModelSerializer

ID_CARD_TEMPLATE_DPI = 300

TEXT_SLOT_FIELDS = frozenset(
    {"name", "class", "course_title", "registration", "academic_year", "expires"}
)
SLOT_TYPES = frozenset({"photo", "text", "static_text", "qr"})
TEXT_FONT_STYLES = frozenset({"bold", "normal"})


def _validate_text_font_style(slot, index):
    font_style = slot.get("fontStyle")
    if font_style is None or font_style == "":
        return
    if font_style not in TEXT_FONT_STYLES:
        raise serializers.ValidationError(
            {index: f"Invalid fontStyle: {font_style!r}."}
        )


def validate_slots(value):
    if not isinstance(value, list):
        raise serializers.ValidationError("slots must be a list.")
    for index, slot in enumerate(value):
        if not isinstance(slot, dict):
            raise serializers.ValidationError({index: "Each slot must be an object."})
        slot_type = slot.get("type")
        if slot_type not in SLOT_TYPES:
            raise serializers.ValidationError(
                {index: f"Invalid slot type: {slot_type!r}."}
            )
        for key in ("x", "y", "width", "height"):
            if key not in slot:
                raise serializers.ValidationError({index: f"Missing {key}."})
            try:
                num = Decimal(str(slot[key]))
            except Exception as exc:
                raise serializers.ValidationError(
                    {index: f"{key} must be numeric."}
                ) from exc
            if num < 0:
                raise serializers.ValidationError({index: f"{key} must be non-negative."})
        if slot_type == "text":
            field = slot.get("field")
            if field not in TEXT_SLOT_FIELDS:
                raise serializers.ValidationError(
                    {index: f"Invalid text field: {field!r}."}
                )
            font_size = slot.get("fontSizePt")
            if font_size is not None and font_size != "":
                try:
                    font_size_num = Decimal(str(font_size))
                except Exception as exc:
                    raise serializers.ValidationError(
                        {index: "fontSizePt must be numeric."}
                    ) from exc
                if font_size_num < 6 or font_size_num > 72:
                    raise serializers.ValidationError(
                        {index: "fontSizePt must be between 6 and 72."}
                    )
            _validate_text_font_style(slot, index)
        if slot_type == "static_text":
            text = slot.get("text")
            if text is None or not str(text).strip():
                raise serializers.ValidationError(
                    {index: "text is required for static_text slots."}
                )
            if len(str(text)) > 512:
                raise serializers.ValidationError(
                    {index: "text must be at most 512 characters."}
                )
            font_size = slot.get("fontSizePt")
            if font_size is not None and font_size != "":
                try:
                    font_size_num = Decimal(str(font_size))
                except Exception as exc:
                    raise serializers.ValidationError(
                        {index: "fontSizePt must be numeric."}
                    ) from exc
                if font_size_num < 6 or font_size_num > 72:
                    raise serializers.ValidationError(
                        {index: "fontSizePt must be between 6 and 72."}
                    )
            _validate_text_font_style(slot, index)
            radius = slot.get("borderRadiusPt")
            if radius is not None and radius != "":
                try:
                    radius_num = Decimal(str(radius))
                except Exception as exc:
                    raise serializers.ValidationError(
                        {index: "borderRadiusPt must be numeric."}
                    ) from exc
                if radius_num < 0:
                    raise serializers.ValidationError(
                        {index: "borderRadiusPt must be non-negative."}
                    )
    return value


class IdCardTemplateSerializer(BaseModelSerializer):
    background_url = serializers.SerializerMethodField(read_only=True)
    back_background_url = serializers.SerializerMethodField(read_only=True)
    is_active = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.IdCardTemplate
        fields = [
            "id",
            "organization",
            "name",
            "audience",
            "width_in",
            "height_in",
            "background",
            "background_url",
            "slots",
            "back_background",
            "back_background_url",
            "back_slots",
            "background_transform",
            "academic_year",
            "expires_on",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["organization", "created_at", "updated_at"]
        extra_kwargs = {
            "background": {"required": False},
            "back_background": {"required": False},
        }

    def get_background_url(self, obj):
        return self._absolute_media_url(obj.background)

    def get_back_background_url(self, obj):
        return self._absolute_media_url(obj.back_background)

    def _absolute_media_url(self, field):
        if not field:
            return None
        request = self.context.get("request")
        url = field.url
        if request is not None:
            return request.build_absolute_uri(url)
        return url

    def get_is_active(self, obj):
        org = obj.organization
        if obj.audience == models.IdCardTemplate.Audience.STUDENT:
            return org.active_student_id_card_template_id == obj.id
        return org.active_staff_id_card_template_id == obj.id

    def validate_width_in(self, value):
        if value <= 0:
            raise serializers.ValidationError("Width must be positive.")
        return value

    def validate_height_in(self, value):
        if value <= 0:
            raise serializers.ValidationError("Height must be positive.")
        return value

    def validate_academic_year(self, value):
        if value == "":
            return None
        return value

    def validate_expires_on(self, value):
        if value == "":
            return None
        return value

    def validate_slots(self, value):
        if isinstance(value, str):
            import json

            try:
                value = json.loads(value)
            except json.JSONDecodeError as exc:
                raise serializers.ValidationError("slots must be valid JSON.") from exc
        return validate_slots(value)

    def validate_back_slots(self, value):
        if isinstance(value, str):
            import json

            try:
                value = json.loads(value)
            except json.JSONDecodeError as exc:
                raise serializers.ValidationError(
                    "back_slots must be valid JSON."
                ) from exc
        return validate_slots(value)

    def validate_background_transform(self, value):
        if isinstance(value, str):
            import json

            try:
                value = json.loads(value)
            except json.JSONDecodeError as exc:
                raise serializers.ValidationError(
                    "background_transform must be valid JSON."
                ) from exc
        if not isinstance(value, dict):
            raise serializers.ValidationError("background_transform must be an object.")
        for face in ("front", "back"):
            fill = value.get(face)
            if fill is None:
                continue
            if not isinstance(fill, dict):
                raise serializers.ValidationError({face: "Must be an object."})
            scale = fill.get("scale", 1)
            try:
                scale_num = float(scale)
            except (TypeError, ValueError) as exc:
                raise serializers.ValidationError(
                    {face: {"scale": "Must be a number."}}
                ) from exc
            if not (scale_num > 0) or scale_num != scale_num:
                raise serializers.ValidationError(
                    {face: {"scale": "Must be greater than 0."}}
                )
        return value


class IdCardTemplateSummarySerializer(BaseModelSerializer):
    background_url = serializers.SerializerMethodField(read_only=True)
    back_background_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.IdCardTemplate
        fields = [
            "id",
            "name",
            "audience",
            "width_in",
            "height_in",
            "background_url",
            "slots",
            "back_background_url",
            "back_slots",
            "background_transform",
            "academic_year",
            "expires_on",
        ]

    def get_background_url(self, obj):
        return self._absolute_media_url(obj.background)

    def get_back_background_url(self, obj):
        return self._absolute_media_url(obj.back_background)

    def _absolute_media_url(self, field):
        if not field:
            return None
        request = self.context.get("request")
        url = field.url
        if request is not None:
            return request.build_absolute_uri(url)
        return url

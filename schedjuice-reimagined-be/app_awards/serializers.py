from rest_framework import serializers

from app_awards import models
from app_course.course_scoping import acting_user
from utilitas.serializers import BaseModelSerializer


class AwardTitleSerializer(BaseModelSerializer):
    class Meta:
        model = models.AwardTitle
        fields = [
            "id",
            "name",
            "family",
            "course",
            "is_pinned",
            "origin",
            "retired_at",
            "sort_order",
            "created_by",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "retired_at",
            "created_at",
            "origin",
            "course",
            "created_by",
        ]

    def create(self, validated_data):
        validated_data["origin"] = models.AwardTitle.Origin.ADMIN
        validated_data["is_pinned"] = True
        validated_data["course"] = None
        actor = acting_user(self.context.get("request"))
        if actor is not None:
            validated_data.setdefault("created_by", actor)
        return super().create(validated_data)


class AwardTemplateSerializer(BaseModelSerializer):
    background_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.AwardTemplate
        fields = [
            "id",
            "title",
            "name",
            "document",
            "background",
            "background_url",
            "created_by",
            "created_at",
        ]
        read_only_fields = ["id", "title", "created_by", "created_at"]
        extra_kwargs = {
            "background": {"write_only": True, "required": False},
        }

    def get_background_url(self, obj):
        if not obj.background:
            return None
        request = self.context.get("request")
        url = obj.background.url
        if request is not None:
            return request.build_absolute_uri(url)
        return url

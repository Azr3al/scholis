from rest_framework import serializers

from app_documents import models, services
from utilitas.serializers import BaseModelSerializer


class DocumentTemplateSerializer(BaseModelSerializer):
    status = serializers.SerializerMethodField(read_only=True)
    owner_id = serializers.IntegerField(read_only=True, allow_null=True)
    created_by_id = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = models.DocumentTemplate
        fields = [
            "id",
            "name",
            "scope",
            "owner_id",
            "document",
            "published_document",
            "status",
            "updated_at",
            "created_by_id",
        ]
        read_only_fields = [
            "id",
            "scope",
            "owner_id",
            "published_document",
            "status",
            "updated_at",
            "created_by_id",
        ]

    def get_status(self, obj):
        return services.derived_status(obj)

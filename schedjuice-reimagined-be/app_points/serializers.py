from rest_framework import serializers as drf

from app_points import models
from utilitas.serializers import BaseModelSerializer


class PointTypeSerializer(BaseModelSerializer):
    class Meta:
        model = models.PointType
        fields = [
            "id",
            "name",
            "color",
            "description",
            "is_active",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class PointTransactionSerializer(BaseModelSerializer):
    point_type = PointTypeSerializer(read_only=True)
    actor_name = drf.CharField(source="actor.name", read_only=True, default=None)

    class Meta:
        model = models.PointTransaction
        fields = [
            "id",
            "subject",
            "point_type",
            "delta",
            "note",
            "actor",
            "actor_name",
            "created_at",
        ]
        read_only_fields = fields


class PostTransactionSerializer(drf.Serializer):
    point_type_id = drf.IntegerField()
    delta = drf.IntegerField()
    note = drf.CharField()

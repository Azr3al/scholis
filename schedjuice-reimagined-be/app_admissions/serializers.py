from app_auth.models import User
from app_course.models import Course
from rest_framework import serializers
from utilitas.serializers import BaseModelSerializer

from app_admissions.course_unit import format_current_unit_updated_at
from app_course.course_status import compute_effective_status
from app_course.serializers import _serialize_time_for_api


class AdmissionsPersonSerializer(BaseModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "name",
            "alternative_name",
            "email",
            "phone_number",
            "is_active",
        )


class AdmissionsCourseSerializer(BaseModelSerializer):
    status = serializers.SerializerMethodField()
    weekday_pattern = serializers.SerializerMethodField()
    time_pattern = serializers.SerializerMethodField()
    first_event_time_from = serializers.SerializerMethodField()
    first_event_time_to = serializers.SerializerMethodField()
    current_unit = serializers.IntegerField(read_only=True, allow_null=True)
    current_unit_updated_at = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = (
            "id",
            "title",
            "start_date",
            "end_date",
            "status",
            "weekday_pattern",
            "time_pattern",
            "first_event_time_from",
            "first_event_time_to",
            "current_unit",
            "current_unit_updated_at",
        )

    def get_status(self, obj):
        return getattr(obj, "effective_status", None) or compute_effective_status(obj)

    def get_weekday_pattern(self, obj):
        days = obj.repeat_every or []
        joined = " ".join(str(day) for day in days if day)
        return joined or None

    def get_time_pattern(self, obj):
        return None

    def get_first_event_time_from(self, obj):
        if hasattr(obj, "_first_event_time_from"):
            annotated = obj._first_event_time_from
            return (
                _serialize_time_for_api(annotated) if annotated is not None else None
            )
        return None

    def get_first_event_time_to(self, obj):
        if hasattr(obj, "_first_event_time_to"):
            annotated = obj._first_event_time_to
            return _serialize_time_for_api(annotated) if annotated is not None else None
        return None

    def get_current_unit_updated_at(self, obj):
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        return format_current_unit_updated_at(
            getattr(obj, "current_unit_updated_at", None),
            tenant,
        )

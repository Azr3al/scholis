from rest_framework import serializers
from rest_framework.serializers import IntegerField

from app_attendance.checkin_policy import validate_checkin_checkout_pair
from app_attendance import models
from app_attendance.models import UserEvent
from app_auth.models import User
from app_auth.serializers import UserSerializer
from utilitas.serializers import BaseModelSerializer
from app_attendance.payroll_snapshots import (
    freeze_teacher_payroll_snapshots,
    get_live_student_count_for_course,
)
from app_course.rate_utils import is_session_based_payroll

_CHECKIN_CHECKOUT_ERROR_MESSAGES = {
    "checkout_before_checkin": "Checkout time cannot be before check-in time.",
    "checkout_after_event_end": "Checkout time cannot be after the session end.",
}


class UserEventSerializer(BaseModelSerializer):
    student_count = IntegerField(required=False, allow_null=True, write_only=True)

    class Meta(BaseModelSerializer.Meta):
        model = UserEvent
        fields = "__all__"
        expandable_fields = {
            "event": "app_course.serializers.EventSerializer",
            "user": "app_auth.serializers.UserSerializer",
        }

    def create(self, validated_data):
        validated_data.pop("student_count", None)
        return super().create(validated_data)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        if instance is None:
            return attrs

        if "checkin_time" not in attrs and "checkout_time" not in attrs:
            return attrs

        checkin_time = attrs.get("checkin_time", instance.checkin_time)
        checkout_time = attrs.get("checkout_time", instance.checkout_time)
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        ok, code = validate_checkin_checkout_pair(
            checkin_time=checkin_time,
            checkout_time=checkout_time,
            event=instance.event,
            tenant=tenant,
        )
        if not ok:
            message = _CHECKIN_CHECKOUT_ERROR_MESSAGES.get(code, code)
            raise serializers.ValidationError(message)
        return attrs

    def update(self, instance, validated_data):
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None

        time_only = set(validated_data.keys()).issubset(
            {"checkin_time", "checkout_time", "today_activities", "is_extra_class"}
        )
        first_checkin = (
            instance.checkin_time is None
            and validated_data.get("checkin_time") is not None
        )
        should_freeze = instance.user.is_teacher() and (
            first_checkin
            or (
                not is_session_based_payroll(tenant)
                and (not time_only and instance.hourly_rate_at_calculation is None)
            )
        )

        if should_freeze:
            if "student_count" in validated_data:
                validated_data["student_count_in_course_at_calculation"] = (
                    validated_data.pop("student_count")
                )
            snapshot_updates = freeze_teacher_payroll_snapshots(instance, tenant)
            validated_data.update(snapshot_updates)
        elif "student_count" in validated_data:
            validated_data.pop("student_count")

        if self.context.get("refresh_student_count_on_update") and instance.user.is_teacher():
            validated_data.pop("student_count", None)
            validated_data["student_count_in_course_at_calculation"] = (
                get_live_student_count_for_course(instance.event.course_id)
            )

        return super().update(instance, validated_data)


class MarkingRosterUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "name", "alternative_name", "phone_number")


class MarkingRosterRowSerializer(BaseModelSerializer):
    user = MarkingRosterUserSerializer(read_only=True)

    class Meta(BaseModelSerializer.Meta):
        model = UserEvent
        fields = ("id", "attendance_status", "attendance_note", "user")


class AttendanceBulkUpdateSerializer(BaseModelSerializer):
    class Meta:
        model = UserEvent
        fields = "__all__"
        extra_kwargs = {
            "user": {"read_only": True, "required": False},
            "event": {"read_only": True, "required": False},
        }


class SelfCheckinCorrectionSerializer(serializers.Serializer):
    checkin_time = serializers.DateTimeField(required=False, allow_null=True)
    checkout_time = serializers.DateTimeField(required=False, allow_null=True)
    checkin_image = serializers.ImageField(required=False, allow_null=True)
    today_activities = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )
    correction_reason = serializers.CharField(required=True, max_length=500)


class CancelCheckinSerializer(serializers.Serializer):
    reason_code = serializers.CharField(required=True, max_length=32)
    note = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, max_length=500
    )


class AttendanceChangeEventSerializer(BaseModelSerializer):
    actor = UserSerializer(read_only=True)

    class Meta(BaseModelSerializer.Meta):
        model = models.AttendanceChangeEvent
        fields = (
            "id",
            "user_event_id",
            "actor",
            "event_type",
            "occurred_at",
            "source",
            "payload",
            "created_at",
        )

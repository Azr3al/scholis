from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from app_attendance.leave_request_enrollment import enrolled_courses_for_students
from app_attendance.leave_request_validation import validate_leave_dates
from app_attendance.models import LeaveRequest
from app_chat.services import validate_chat_attachment_refs
from app_course.course_scoping import acting_user
from utilitas.serializers import BaseModelSerializer


def _require_non_empty_text(value: str, *, field_name: str) -> str:
    normalized = (value or "").strip()
    if not normalized:
        raise serializers.ValidationError(f"{field_name} is required.")
    return normalized


def _validate_leave_attachment_id(value, *, user):
    if value is None:
        return value
    if user is None:
        raise serializers.ValidationError("User is required to validate attachments.")
    try:
        validate_chat_attachment_refs(user, [{"attachment_id": value}])
    except DjangoValidationError as exc:
        if hasattr(exc, "message_dict") and "attachments" in exc.message_dict:
            raise serializers.ValidationError(
                {"attachment_id": exc.message_dict["attachments"]}
            ) from exc
        messages = getattr(exc, "messages", None) or [str(exc)]
        raise serializers.ValidationError({"attachment_id": messages}) from exc
    return value


class _LeaveRequestWriteSerializerBase(serializers.Serializer):
    def _request_user(self):
        request = self.context.get("request")
        return acting_user(request) if request else None

    def _request_tenant(self):
        request = self.context.get("request")
        return getattr(request, "tenant", None) if request else None

    def validate_reason(self, value):
        return _require_non_empty_text(value, field_name="Reason")

    def validate_attachment_id(self, value):
        return _validate_leave_attachment_id(value, user=self._request_user())

    def _validate_date_range(self, attrs):
        instance = getattr(self, "instance", None)
        start_date = attrs.get("start_date")
        if start_date is None and instance is not None:
            start_date = instance.start_date

        end_date = attrs.get("end_date")
        if end_date is None and instance is not None and "end_date" not in attrs:
            end_date = instance.end_date

        tenant = self._request_tenant()
        if start_date is not None and end_date is not None and tenant is not None:
            validate_leave_dates(
                start_date=start_date,
                end_date=end_date,
                tenant=tenant,
            )
        return attrs


class LeaveRequestListSerializer(serializers.ListSerializer):
    def to_representation(self, data):
        instances = list(data.all() if hasattr(data, "all") else data)
        student_ids = [instance.student_id for instance in instances]
        self.child.context["enrolled_courses_by_student"] = enrolled_courses_for_students(
            student_ids
        )
        return [self.child.to_representation(instance) for instance in instances]


class LeaveRequestSerializer(BaseModelSerializer):
    enrolled_courses = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = LeaveRequest
        fields = "__all__"
        list_serializer_class = LeaveRequestListSerializer
        expandable_fields = {
            "student": "app_auth.serializers.UserSerializer",
            "reviewed_by": "app_auth.serializers.UserSerializer",
            "attachment": "app_attachment.serializers.AttachmentSerializer",
        }

    def get_enrolled_courses(self, obj):
        cache = self.context.get("enrolled_courses_by_student")
        if cache is None:
            cache = enrolled_courses_for_students([obj.student_id])
        return cache.get(obj.student_id, [])


class StudentLeaveRequestCreateSerializer(_LeaveRequestWriteSerializerBase):
    start_date = serializers.DateField()
    end_date = serializers.DateField(required=False, allow_null=True)
    reason = serializers.CharField()
    attachment_id = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs):
        if attrs.get("end_date") is None:
            attrs["end_date"] = attrs["start_date"]
        return self._validate_date_range(attrs)

    def create(self, validated_data):
        attachment_id = validated_data.pop("attachment_id", None)
        user = self._request_user()
        return LeaveRequest.objects.create(
            student=user,
            status=LeaveRequest.Status.PENDING,
            attachment_id=attachment_id,
            **validated_data,
        )


class StudentLeaveRequestUpdateSerializer(_LeaveRequestWriteSerializerBase):
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False, allow_null=True)
    reason = serializers.CharField(required=False)
    attachment_id = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs):
        if "end_date" in attrs and attrs["end_date"] is None:
            start_date = attrs.get("start_date", self.instance.start_date)
            attrs["end_date"] = start_date
        return self._validate_date_range(attrs)

    def update(self, instance, validated_data):
        attachment_id = validated_data.pop("attachment_id", serializers.empty)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if attachment_id is not serializers.empty:
            instance.attachment_id = attachment_id
        instance.save()
        return instance


class LeaveRequestDenySerializer(serializers.Serializer):
    denial_reason = serializers.CharField()

    def validate_denial_reason(self, value):
        return _require_non_empty_text(value, field_name="Denial reason")

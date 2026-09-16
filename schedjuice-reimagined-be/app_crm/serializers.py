from rest_framework import serializers as drf

from app_course.course_scoping import acting_user
from app_crm import models, services
from app_crm.complaint_notifications import notify_complaint_assigned
from app_crm.complaint_helpers import (
    redact_issue_payload_for_staff,
    should_redact_complaint_identity,
)
from app_crm.user_mini import user_mini
from utilitas.serializers import BaseModelSerializer


class LeadStatusSerializer(BaseModelSerializer):
    class Meta:
        model = models.LeadStatus
        fields = "__all__"


class LeadSourceSerializer(BaseModelSerializer):
    class Meta:
        model = models.LeadSource
        fields = "__all__"


class LeadAppointmentSerializer(BaseModelSerializer):
    class Meta:
        model = models.LeadAppointment
        fields = "__all__"
        expandable_fields = {
            "consultant": "app_auth.serializers.UserSerializer",
        }


class LeadCommentSerializer(BaseModelSerializer):
    class Meta:
        model = models.LeadComment
        fields = "__all__"
        expandable_fields = {
            "author": "app_auth.serializers.UserSerializer",
        }


class LeadSerializer(BaseModelSerializer):
    class Meta:
        model = models.Lead
        fields = "__all__"
        read_only_fields = ("created_by", "converted_user")
        expandable_fields = {
            "source": "app_crm.serializers.LeadSourceSerializer",
            "status": "app_crm.serializers.LeadStatusSerializer",
            "assignee": "app_auth.serializers.UserSerializer",
            "converted_user": "app_auth.serializers.UserSerializer",
            "appointments": (
                "app_crm.serializers.LeadAppointmentSerializer",
                {"many": True},
            ),
            "observers": (
                "app_auth.serializers.UserSerializer",
                {"many": True},
            ),
        }

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance is None and "status" not in attrs:
            default = models.LeadStatus.objects.filter(is_default=True).first()
            if default:
                attrs["status"] = default
        return attrs


class AppointmentUpdateSerializer(drf.Serializer):
    scheduled_at = drf.DateTimeField(required=False)
    platform = drf.ChoiceField(
        choices=models.LeadAppointment.Platform.choices, required=False
    )
    consultant = drf.IntegerField(required=False, allow_null=True)
    meeting_link = drf.CharField(required=False, allow_blank=True)
    notes = drf.CharField(required=False, allow_blank=True)
    outcome = drf.ChoiceField(
        choices=models.LeadAppointment.Outcome.choices, required=False
    )


class AppointmentInputSerializer(drf.Serializer):
    scheduled_at = drf.DateTimeField()
    platform = drf.ChoiceField(choices=models.LeadAppointment.Platform.choices)
    consultant = drf.IntegerField(required=False, allow_null=True)
    meeting_link = drf.CharField(required=False, allow_blank=True)
    notes = drf.CharField(required=False, allow_blank=True)


class StudentInputSerializer(drf.Serializer):
    name = drf.CharField()
    email = drf.EmailField()
    phone = drf.CharField(required=False, allow_blank=True)


class LeadMoveSerializer(drf.Serializer):
    status = drf.IntegerField()
    appointment = AppointmentInputSerializer(required=False)
    student = StudentInputSerializer(required=False)


class ObserverInputSerializer(drf.Serializer):
    user_id = drf.IntegerField()


class IssueStatusSerializer(BaseModelSerializer):
    class Meta:
        model = models.IssueStatus
        fields = "__all__"


class IssueCommentSerializer(BaseModelSerializer):
    class Meta:
        model = models.IssueComment
        fields = "__all__"
        expandable_fields = {
            "author": "app_auth.serializers.UserSerializer",
        }


class IssueSerializer(BaseModelSerializer):
    # Not required on input: create() falls back to the default IssueStatus
    # (see validate() below) when the client omits it.
    status = drf.PrimaryKeyRelatedField(
        queryset=models.IssueStatus.objects.all(), required=False
    )

    class Meta:
        model = models.Issue
        fields = "__all__"
        read_only_fields = ("created_by",)
        expandable_fields = {
            "status": "app_crm.serializers.IssueStatusSerializer",
            "assignee": "app_auth.serializers.UserSerializer",
            "created_by": "app_auth.serializers.UserSerializer",
            "related_student": "app_auth.serializers.UserSerializer",
            "related_course": "app_course.serializers.CourseSerializer",
            "observers": (
                "app_auth.serializers.UserSerializer",
                {"many": True},
            ),
        }

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance is None and "status" not in attrs:
            default = models.IssueStatus.objects.filter(is_default=True).first()
            if default:
                attrs["status"] = default
        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        actor = acting_user(request) if request is not None else None
        if should_redact_complaint_identity(instance, actor):
            data = redact_issue_payload_for_staff(data)
        return data

    def update(self, instance, validated_data):
        previous_assignee = instance.assignee
        previous_assignee_id = instance.assignee_id
        instance = super().update(instance, validated_data)
        if instance.assignee_id != previous_assignee_id:
            request = self.context.get("request")
            actor = acting_user(request) if request is not None else None
            services.record_issue_assignee_change_if_needed(
                instance,
                actor=actor,
                previous_assignee=previous_assignee,
            )
            if (
                instance.source == models.IssueSource.PARENT_COMPLAINT
                and instance.assignee_id is not None
                and request is not None
            ):
                notify_complaint_assigned(
                    instance, request.tenant, instance.assignee_id
                )
        return instance


class IssueMoveSerializer(drf.Serializer):
    status = drf.IntegerField()


class StudentComplaintReopenSerializer(drf.Serializer):
    status = drf.IntegerField(required=False)


class StudentCreateComplaintSerializer(drf.Serializer):
    body = drf.CharField(required=False, allow_blank=True, default="")
    is_anonymous = drf.BooleanField(required=False, default=False)
    attachments = drf.ListField(
        child=drf.DictField(),
        required=False,
        default=list,
    )

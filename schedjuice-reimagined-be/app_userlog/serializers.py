from rest_framework import serializers as drf

from app_userlog import models
from app_userlog import services as _services
from utilitas.serializers import BaseModelSerializer


def user_mini(user):
    if user is None:
        return None
    return {"id": user.id, "name": user.name, "email": user.email}


class ReportTypeFieldSerializer(BaseModelSerializer):
    class Meta:
        model = models.ReportTypeField
        fields = "__all__"
        read_only_fields = ("report_type",)


class ReportTypeSerializer(BaseModelSerializer):
    class Meta:
        model = models.ReportType
        fields = "__all__"
        expandable_fields = {
            "fields": (
                "app_userlog.serializers.ReportTypeFieldSerializer",
                {"many": True},
            ),
        }


class ReportTypeFieldInputSerializer(drf.Serializer):
    field_key = drf.SlugField(max_length=100)
    field_label = drf.CharField(max_length=255)
    field_type = drf.ChoiceField(choices=models.ReportTypeField.FieldType.choices)
    is_required = drf.BooleanField(required=False, default=False)
    choices = drf.JSONField(required=False, allow_null=True)
    validation_rules = drf.JSONField(required=False, allow_null=True)
    sort_order = drf.IntegerField(required=False, default=0)


class ReportTypeFieldsReplaceSerializer(drf.Serializer):
    fields = ReportTypeFieldInputSerializer(many=True)


def expand_field_values(report_type, values: dict) -> dict:
    """Return a display copy where FK ids are resolved to mini objects."""
    from app_auth.models import User
    from app_course.models import Course

    values = values or {}
    out = dict(values)
    for field in report_type.fields.all():
        key = field.field_key
        raw = values.get(key)
        if raw in (None, "", []):
            continue
        if field.field_type == models.ReportTypeField.FieldType.STAFF_USER_FK:
            out[key] = user_mini(User.objects.filter(pk=raw).first())
        elif field.field_type == models.ReportTypeField.FieldType.COURSE_FK:
            course = Course.objects.filter(pk=raw).first()
            out[key] = {"id": course.id, "title": course.title} if course else None
    return out


def serialize_attachments(entry):
    from app_attachment.models import Attachment

    qs = Attachment.objects.filter(
        table_name=_services.ATTACHMENT_TABLE,
        foreign_key=entry.id,
        is_deleted=False,
    )
    return [
        {
            "id": a.id,
            "filename": a.filename,
            "is_image": a.is_image,
            "file_type": a.file_type,
            "size": a.size,
        }
        for a in qs
    ]


class LogEntrySerializer(BaseModelSerializer):
    class Meta:
        model = models.LogEntry
        fields = "__all__"
        read_only_fields = ("author", "subject", "is_deleted")
        expandable_fields = {
            "report_type": "app_userlog.serializers.ReportTypeSerializer",
            "author": "app_auth.serializers.UserSerializer",
            "subject": "app_auth.serializers.UserSerializer",
        }

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["field_values_display"] = expand_field_values(
            instance.report_type, instance.field_values
        )
        data["attachments"] = serialize_attachments(instance)
        return data


class LogEntryInputSerializer(drf.Serializer):
    report_type = drf.IntegerField()
    title = drf.CharField(max_length=512)
    body = drf.CharField(required=False, allow_blank=True)
    field_values = drf.JSONField(required=False)


class LogEntryUpdateSerializer(drf.Serializer):
    report_type = drf.IntegerField(required=False)
    title = drf.CharField(max_length=512, required=False)
    body = drf.CharField(required=False, allow_blank=True)
    field_values = drf.JSONField(required=False)

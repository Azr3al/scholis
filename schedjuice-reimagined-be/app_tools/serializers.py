from utilitas.serializers import BaseModelSerializer
from app_tools.models import EmailTemplate, UserEmail
from rest_framework.exceptions import ValidationError
from app_auth.models import User
from premailer import transform


class EmailTemplateSerializer(BaseModelSerializer):
    class Meta:
        model = EmailTemplate
        fields = "__all__"
        expandable_fields = {
            "course": ("app_course.serializers.CourseSerializer"),
            "created_by": ("app_auth.serializers.UserSerializer"),
        }
        extra_kwargs = {
            "created_by": {"required": False, "read_only": True},
        }

    def create(self, validated_data):
        validated_data["created_by"] = User.objects.filter(
            email=self.context.get(
                "request",
            ).user.id
        ).first()
        return super().create(validated_data)


class UserEmailSerializer(BaseModelSerializer):
    class Meta:
        model = UserEmail
        fields = "__all__"
        expandable_fields = {
            "user": ("app_auth.serializers.UserSerializer"),
            "created_by": ("app_auth.serializers.UserSerializer"),
        }
        extra_kwargs = {
            "created_by": {"required": False, "read_only": True},
        }


    def create(self, validated_data):
        if not validated_data.get("is_bound") and not validated_data.get("email"):
            raise ValidationError({"email": "Email must be provided if is_bound is False"})
        validated_data["created_by"] = User.objects.filter(
            email=self.context.get(
                "request",
            ).user.id
        ).first()
        validated_data["html_body"] = transform(validated_data["html_body"])
        return super().create(validated_data)

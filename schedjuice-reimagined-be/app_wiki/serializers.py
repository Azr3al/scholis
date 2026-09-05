from app_auth.models import User
from app_wiki.models import Item
from utilitas.serializers import BaseModelSerializer


class ItemSerializer(BaseModelSerializer):
    class Meta:
        model = Item
        fields = "__all__"
        expandable_fields = {
            "created_by": ("app_auth.serializers.UserSerializer",),
            "parent": ("app_wiki.serializers.ItemSerializer",),
            "course": ("app_course.serializers.CourseSerializer",),
            "children": ("app_wiki.serializers.ItemSerializer", {"many": True}),
        }
        extra_kwargs = {
            "created_by": {"required": False, "read_only": True},
            "code": {"read_only": True},
            "parent": {"required": False},
        }

    def create(self, validated_data):
        validated_data["created_by"] = User.objects.filter(
            email=self.context.get(
                "request",
            ).user.id
        ).first()
        return super().create(validated_data)

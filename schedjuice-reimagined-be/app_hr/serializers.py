from utilitas.serializers import BaseModelSerializer
from app_hr.models import BuildingCheckin


class BuildingCheckinSerializer(BaseModelSerializer):
    class Meta:
        model = BuildingCheckin
        fields = "__all__"
        expandable_fields = {
            "user": ("app_auth.serializers.UserSerializer",),
            "campus": ("app_course.serializers.CampusSerializer",),
        }

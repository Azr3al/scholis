from app_department import models
from utilitas.serializers import BaseModelSerializer


class DepartmentSerializer(BaseModelSerializer):
    class Meta:
        model = models.Department
        fields = "__all__"
        expandable_fields = {
            "user_departments": (
                "app_department.serializers.UserDepartmentSerializer",
                {"many": True},
            ),
        }


class JobSerializer(BaseModelSerializer):
    class Meta:
        model = models.Job
        fields = "__all__"
        expandable_fields = {
            "department": "app_department.serializers.DepartmentSerializer",
            "user_departments": (
                "app_department.serializers.UserDepartmentSerializer",
                {"many": True},
            ),
        }


class UserDepartmentSerializer(BaseModelSerializer):
    class Meta:
        model = models.UserDepartment
        fields = "__all__"
        expandable_fields = {
            "user": "app_auth.serializers.UserSerializer",
            "department": "app_department.serializers.DepartmentSerializer",
            "job": "app_department.serializers.JobSerializer",
        }

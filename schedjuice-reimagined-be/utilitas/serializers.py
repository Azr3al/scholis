from rest_flex_fields import FlexFieldsModelSerializer
from rest_framework import serializers

# Client/URL bugs often send these as string filter values; they are never valid ORM literals.
_INVALID_FILTER_VALUE_SENTINELS = frozenset(
    {"undefined", "nan", "null", "none"}
)


class BaseSerializer(FlexFieldsModelSerializer):
    role_based_fields = None
    pass


class BaseListSerializer(serializers.ListSerializer):
    def create(self, validated_data):
        objs = [self.context["view"].model(**i) for i in validated_data]
        return self.context["view"].model.objects.bulk_create(objs)


from app_auth.models import User


class BaseModelSerializer(FlexFieldsModelSerializer):
    def __init__(self, *args, **kwargs):
        excluded_fields = kwargs.pop("excluded_fields", None)
        kwargs.pop("roles", None)

        super(BaseModelSerializer, self).__init__(*args, **kwargs)

    class Meta:
        list_serializer_class = BaseListSerializer


class FilterParamSerializer(serializers.Serializer):
    field_name = serializers.CharField(max_length=256, required=True)
    operator = serializers.CharField(max_length=256, default="exact")
    value = serializers.CharField(max_length=5000, required=True)

    def validate(self, data, *args, **kwargs):
        self.available_fields = [
            i.name for i in self.context["model"]._meta.get_fields()
        ]
        if data["operator"] not in self.context["model"].valid_operators:
            raise serializers.ValidationError(
                f"{data['operator']} is not in valid operators of {self.context['model'].__name__}. "
                f"Valid operators: {self.context['model'].valid_operators}"
            )
        val_norm = str(data["value"]).strip().lower()
        if val_norm in _INVALID_FILTER_VALUE_SENTINELS:
            raise serializers.ValidationError(
                {
                    "value": (
                        f"Invalid filter value for field {data['field_name']!r} "
                        f"(sentinel {data['value']!r})."
                    )
                }
            )
        from app_custom_fields.filtering import validate_filter_param_for_custom_fields

        validate_filter_param_for_custom_fields(
            model=self.context["model"],
            field_name=data["field_name"],
        )
        return data

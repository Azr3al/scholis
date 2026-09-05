from rest_framework import serializers


class WelcomeBoardWriteSerializer(serializers.Serializer):
    body_html = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    body_plain = serializers.CharField(required=False, allow_null=True, allow_blank=True)

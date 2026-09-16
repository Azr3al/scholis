from rest_framework import serializers


class TelegramConfigSerializer(serializers.Serializer):
    bot_token = serializers.CharField(write_only=True)
    is_telegram_on = serializers.BooleanField(default=True)


class TelegramReRegisterWebhookSerializer(serializers.Serializer):
    rotate_credentials = serializers.BooleanField(default=False)

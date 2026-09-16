from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from app_course.models import Course
from app_auth.models import User
from app_rbac.views import RBACView
from app_telegram.binding import clear_user_telegram_binding, issue_link_token
from app_telegram.client import TelegramClient
from app_telegram.config import TelegramWebhookError, configure_telegram, re_register_telegram_webhook
from app_telegram.linking import start_group_link
from app_telegram.serializers import (
    TelegramConfigSerializer,
    TelegramReRegisterWebhookSerializer,
)
from app_telegram.webhook import process_incoming
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization


def _resolve_user(request):
    """Map JWT TokenUser to tenant-scoped User row (FK-safe)."""
    auth_user = request.user
    if isinstance(auth_user, User):
        return auth_user
    return User.get_user_from_request(request)


class TelegramConfigView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "telegram.configure"}

    def post(self, request):
        ser = TelegramConfigSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        org = configure_telegram(
            request.tenant.schema_name,
            bot_token=ser.validated_data["bot_token"],
            is_telegram_on=ser.validated_data["is_telegram_on"],
        )
        return Response(
            {
                "is_telegram_on": org.is_telegram_on,
                "telegram_bot_username": org.telegram_bot_username,
            },
            status=status.HTTP_200_OK,
        )


class TelegramReRegisterWebhookView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "telegram.configure"}

    def post(self, request):
        ser = TelegramReRegisterWebhookSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            org = re_register_telegram_webhook(
                request.tenant.schema_name,
                rotate_credentials=ser.validated_data["rotate_credentials"],
            )
        except TelegramWebhookError as exc:
            return Response(
                {"message": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {
                "ok": True,
                "telegram_bot_username": org.telegram_bot_username,
            },
            status=status.HTTP_200_OK,
        )


class TelegramWebhookView(APIView):
    authentication_classes: list = []
    permission_classes: list = []

    def post(self, request, routing_key: str):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.filter(telegram_routing_key=routing_key).first()
        if org is None:
            return Response(
                {"message": "Unknown webhook routing key."},
                status=status.HTTP_404_NOT_FOUND,
            )

        secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
        if not secret or secret != org.telegram_webhook_secret:
            return Response(
                {"message": "Invalid webhook secret."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        with schema_context(org.schema_name):
            process_incoming(org, request.data)
        return Response({"ok": True, "message": ""}, status=status.HTTP_200_OK)


class TelegramLinkTokenView(APIView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        org = request.tenant
        if not org.telegram_bot_username:
            return Response(
                {"message": "Telegram is not configured for this school."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = _resolve_user(request)
        if user is None:
            return Response(
                {"message": "User not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        deep_link = issue_link_token(user, org.telegram_bot_username)
        return Response({"deep_link": deep_link}, status=status.HTTP_200_OK)


class TelegramUnlinkView(APIView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = _resolve_user(request)
        if user is None:
            return Response(
                {"message": "User not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        clear_user_telegram_binding(user)
        return Response({"ok": True, "message": ""}, status=status.HTTP_200_OK)


class CourseTelegramLinkView(APIView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, course_id: int):
        org = request.tenant
        if not org.telegram_bot_username:
            return Response(
                {"message": "Telegram not configured."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = _resolve_user(request)
        if user is None:
            return Response(
                {"message": "User not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not user.telegram_user_id:
            return Response(
                {"message": "Link your own Telegram account first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        course = Course.objects.filter(id=course_id).first()
        if course is None:
            return Response(
                {"message": "Course not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        deep_link = start_group_link(course, user, org.telegram_bot_username)
        return Response(
            {"deep_link": deep_link, "suggested_group_name": course.title},
            status=status.HTTP_200_OK,
        )


class CourseTelegramUnlinkView(APIView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, course_id: int):
        org = request.tenant
        course = Course.objects.filter(id=course_id).first()
        if course is None:
            return Response(
                {"message": "Course not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if course.telegram_chat_id:
            try:
                TelegramClient(org).leave_chat(course.telegram_chat_id)
            except Exception:
                pass
            course.telegram_chat_id = None
            course.telegram_chat_title = None
            course.telegram_invite_link = None
            course.telegram_linked_at = None
            course.save(
                update_fields=[
                    "telegram_chat_id",
                    "telegram_chat_title",
                    "telegram_invite_link",
                    "telegram_linked_at",
                ]
            )
        return Response({"ok": True, "message": ""}, status=status.HTTP_200_OK)

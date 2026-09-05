from django.db import connection

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from app_auth.models import User
from app_google.calendar_linking import GoogleCalendarLinkError, clear_google_calendar_binding
from app_google.linking import clear_google_binding
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication


def _resolve_user(request) -> User | None:
    """Map JWT TokenUser to tenant-scoped User row (FK-safe)."""
    auth_user = request.user
    if isinstance(auth_user, User):
        return auth_user
    return User.get_user_from_request(request)


class GoogleUnlinkView(APIView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = _resolve_user(request)
        if user is None:
            return Response(
                {"message": "User not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not user.google_id:
            return Response(
                {"message": "Google is not linked to this account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        clear_google_binding(user)
        return Response({"ok": True, "message": ""}, status=status.HTTP_200_OK)


class GoogleCalendarUnlinkView(APIView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = _resolve_user(request)
        if user is None:
            return Response(
                {"message": "User not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        tenant_schema = getattr(connection, "schema_name", None) or ""
        if not tenant_schema:
            return Response(
                {"message": "Tenant context is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            clear_google_calendar_binding(user, tenant_schema=tenant_schema)
        except GoogleCalendarLinkError as exc:
            return Response(
                {"message": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"ok": True, "message": ""}, status=status.HTTP_200_OK)

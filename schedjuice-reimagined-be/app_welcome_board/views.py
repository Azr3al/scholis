from __future__ import annotations

from app_attachment.serializers import AttachmentSerializer
from app_attachment.views import get_presigned_url
from app_auth.models import User
from app_auth.user_query_helpers import user_has_manager_or_above
from app_rbac.views import RBACPermission, RBACView
from app_welcome_board.models import WelcomeBoard
from app_welcome_board.serializers import WelcomeBoardWriteSerializer
from app_welcome_board.welcome_html import html_is_effectively_empty, sanitize_welcome_body_html
from rest_framework.permissions import IsAuthenticated
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication


def _resolve_audience(user: User) -> str:
    if user.is_student():
        return WelcomeBoard.Audience.STUDENT
    return WelcomeBoard.Audience.STAFF


def _get_or_create_board(audience: str) -> WelcomeBoard:
    b, _ = WelcomeBoard.objects.get_or_create(audience=audience, defaults={})
    return b


def _serialize_attachments(board: WelcomeBoard) -> list[dict]:
    qs = board.attachments.filter(is_deleted=False).order_by("id")
    ser = AttachmentSerializer(qs, many=True)
    rows = list(ser.data)
    for row, att in zip(rows, qs):
        if att.data:
            row["data"] = get_presigned_url(
                att.data,
                row.get("filename") or att.filename,
                row.get("file_type") or att.file_type or "application/octet-stream",
            )
        else:
            row["data"] = None
    return rows


def _board_payload(board: WelcomeBoard, *, user: User, resolved_audience: str | None = None) -> dict:
    attachments = _serialize_attachments(board)
    empty_html = html_is_effectively_empty(board.body_html)
    is_empty = empty_html and len(attachments) == 0
    can_edit = user_has_manager_or_above(user)
    return {
        "id": board.id,
        "audience": board.audience,
        "body_html": board.body_html,
        "body_plain": board.body_plain,
        "updated_at": board.updated_at,
        "updated_by": board.updated_by_id,
        "attachments": attachments,
        "is_effectively_empty": is_empty,
        "can_edit": can_edit,
        "resolved_audience": resolved_audience,
    }


class WelcomeBoardForMeView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    rbac_decision = "authenticated_only"

    def get(self, request):
        user = User.objects.filter(email=request.user.id).first()
        if not user:
            return self.send_response(True, "not_found", {"details": "User not found."}, status=404)
        audience = _resolve_audience(user)
        board = _get_or_create_board(audience)
        payload = _board_payload(board, user=user, resolved_audience=audience)
        return self.send_response(False, "success", {"data": payload})


class WelcomeBoardListView(RBACView):
    """GET: both boards — managers and above only."""

    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    rbac_decision = "authenticated_only"

    def get(self, request):
        user = User.objects.filter(email=request.user.id).first()
        if not user:
            return self.send_response(True, "not_found", {"details": "User not found."}, status=404)
        if not user_has_manager_or_above(user):
            return self.send_response(
                True,
                "forbidden",
                {"details": "Only managers and above can list welcome boards."},
                status=403,
            )
        staff = _get_or_create_board(WelcomeBoard.Audience.STAFF)
        student = _get_or_create_board(WelcomeBoard.Audience.STUDENT)
        data = [
            _board_payload(staff, user=user, resolved_audience=None),
            _board_payload(student, user=user, resolved_audience=None),
        ]
        return self.send_response(False, "success", {"data": data})


class WelcomeBoardAudienceView(RBACView):
    """
    GET/PATCH welcome-boards/<audience>
    GET: staff or student board; non-managers may only read their own audience's board.
    PATCH: managers and above only.
    """

    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    rbac_decision = "authenticated_only"

    def get(self, request, audience: str):
        if audience not in (
            WelcomeBoard.Audience.STAFF,
            WelcomeBoard.Audience.STUDENT,
        ):
            return self.send_response(
                True, "bad_request", {"details": "Invalid audience."}, status=400
            )
        user = User.objects.filter(email=request.user.id).first()
        if not user:
            return self.send_response(True, "not_found", {"details": "User not found."}, status=404)
        mine = _resolve_audience(user)
        if not user_has_manager_or_above(user) and audience != mine:
            return self.send_response(
                True,
                "forbidden",
                {"details": "You can only load your school's welcome page for your account."},
                status=403,
            )
        board = _get_or_create_board(audience)
        payload = _board_payload(board, user=user, resolved_audience=mine)
        return self.send_response(False, "success", {"data": payload})

    def patch(self, request, audience: str):
        if audience not in (
            WelcomeBoard.Audience.STAFF,
            WelcomeBoard.Audience.STUDENT,
        ):
            return self.send_response(
                True, "bad_request", {"details": "Invalid audience."}, status=400
            )
        user = User.objects.filter(email=request.user.id).first()
        if not user:
            return self.send_response(True, "not_found", {"details": "User not found."}, status=404)
        if not user_has_manager_or_above(user):
            return self.send_response(
                True,
                "forbidden",
                {"details": "Only managers and above can edit welcome boards."},
                status=403,
            )
        ser = WelcomeBoardWriteSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        board = _get_or_create_board(audience)
        vd = ser.validated_data
        if "body_html" in vd:
            board.body_html = sanitize_welcome_body_html(vd.get("body_html"))
        if "body_plain" in vd:
            plain = vd.get("body_plain")
            board.body_plain = plain if plain else None
        board.updated_by = user
        board.save()
        payload = _board_payload(board, user=user, resolved_audience=_resolve_audience(user))
        return self.send_response(False, "updated", {"data": payload})

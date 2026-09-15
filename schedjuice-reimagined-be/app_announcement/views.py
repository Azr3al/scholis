from rest_framework.exceptions import MethodNotAllowed, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework import status

from app_announcement import models, serializers
from app_announcement.announcement_batch_create import (
    BatchCreateValidationError,
    batch_result_to_payload,
    create_announcements_batch,
)
from app_announcement.announcement_create_helpers import (
    apply_announcement_attachment_mutations,
    claim_inline_attachments_for_instance,
    finalize_multipart_announcement_create,
    parse_multipart_announcement_data,
)
from app_course.course_scoping import acting_user, check_course_write
from app_course.models import Course
from app_course.teaching_assignment import user_has_teaching_assignment_on_course
from app_rbac.resolution import effective_permissions
from app_rbac.views import (
    RBACDetailsView,
    RBACListView,
    RBACPermission,
    RBACSearchView,
    RBACView,
)
from app_microsoft.announcement_helpers import (
    TeamsSendOutcome,
    _failure_message_for_result,
    resend_announcement_to_teams_sync,
    schedule_announcement_teams_sync,
)


def _acting_user_is_announcement_author(request, announcement) -> bool:
    if announcement.created_by_id is None:
        return True
    actor = acting_user(request)
    return actor is not None and actor.id == announcement.created_by_id


def _has_announcement_manage(user) -> bool:
    return "announcement.manage" in effective_permissions(user)


def _course_id_from_request_data(data) -> int | None:
    raw = data.get("course") if hasattr(data, "get") else None
    if raw in (None, ""):
        return None
    try:
        return int(raw)
    except (ValueError, TypeError):
        return None


def _course_id_from_request(request: Request) -> int | None:
    if (
        request.content_type
        and "multipart/form-data" in request.content_type
    ):
        return parse_multipart_announcement_data(request.data).get("course")
    return _course_id_from_request_data(request.data)


def _require_announcement_write(request, *, course_id: int | None) -> None:
    if _has_announcement_manage(request.user):
        return

    if course_id is None:
        raise PermissionDenied("You don't have permission to manage announcements.")

    course = Course.objects.filter(pk=course_id).first()
    if course is None:
        raise PermissionDenied("Not allowed for this course.")

    actor = acting_user(request)
    if actor is None:
        raise PermissionDenied("You don't have permission to manage announcements.")

    if user_has_teaching_assignment_on_course(actor.id, course_id):
        return

    if "course.manage_content" not in effective_permissions(request.user):
        raise PermissionDenied("You don't have permission to manage announcements.")

    check_course_write(actor, course)


def _reject_course_scoped_create_escalation(request: Request) -> None:
    if _has_announcement_manage(request.user):
        return

    if (
        request.content_type
        and "multipart/form-data" in request.content_type
    ):
        parsed = parse_multipart_announcement_data(request.data)
        if parsed.get("course_filters"):
            raise PermissionDenied("You don't have permission to manage announcements.")
        return

    filters = request.data.get("course_filters")
    if filters not in (None, "", {}):
        raise PermissionDenied("You don't have permission to manage announcements.")


def _check_announcement_write_escalation(request, instance, data: dict) -> None:
    if _has_announcement_manage(request.user):
        return

    if data.get("course_filters"):
        raise PermissionDenied("You don't have permission to manage announcements.")

    if "course" in data:
        new_course_id = data.get("course")
        if new_course_id is None:
            raise PermissionDenied("You don't have permission to manage announcements.")
        if new_course_id != instance.course_id:
            _require_announcement_write(request, course_id=new_course_id)


def _require_news_manage(request):
    if "news.manage" not in effective_permissions(request.user):
        raise PermissionDenied("You don't have permission to manage news.")


class AnnouncementPublicListView(RBACListView):
    name = "Announcement public list view"
    model = models.Announcement
    serializer = serializers.AnnouncementSerializer
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def get(self, request: Request):
        if not request.user:
            announcements = models.Announcement.objects.filter(
                course__isnull=True
            ).values_list("id")
            return super().get(request, announcements)
        return super().get(request)

    def post(self, request: Request):
        raise MethodNotAllowed("POST")


class AnnouncementPublicDetailsView(RBACDetailsView):
    name = "Announcement public details view"
    model = models.Announcement
    serializer = serializers.AnnouncementSerializer
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def put(self, request: Request):
        raise MethodNotAllowed("PUT")

    def delete(self, request: Request, obj_id: int):
        raise MethodNotAllowed("DELETE")


class AnnouncementListView(RBACListView):
    name = "Announcement list view"
    model = models.Announcement
    serializer = serializers.AnnouncementSerializer
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method == "POST":
            _require_announcement_write(
                request, course_id=_course_id_from_request(request)
            )
            _reject_course_scoped_create_escalation(request)

    def post(self, request: Request):
        # Support multipart/form-data with inline file uploads
        is_multipart = (
            request.content_type
            and "multipart/form-data" in request.content_type
        )
        if is_multipart:
            data = parse_multipart_announcement_data(request.data)
            ser = self.get_serializer(data=data, context={"skip_teams_schedule": True})
            if not ser.is_valid():
                return self.send_response(
                    True,
                    "bad_request",
                    {"details": ser.errors},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            instance = ser.save()
            payload_data = finalize_multipart_announcement_create(
                request, instance, self.get_serializer_class()
            )
            return self.send_response(
                False,
                "created",
                {"data": payload_data},
                status=status.HTTP_201_CREATED,
            )
        # Default: JSON body (no inline attachments)
        return super().post(request)


class AnnouncementDetailsView(RBACDetailsView):
    name = "Announcement details view"
    model = models.Announcement
    serializer = serializers.AnnouncementSerializer
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.method in ("PUT", "PATCH", "DELETE"):
            obj_id = kwargs.get("obj_id")
            if obj_id is not None:
                obj = self.get_object(obj_id)
                if obj is not None:
                    _require_announcement_write(request, course_id=obj.course_id)

    def put(self, request: Request, obj_id: int):
        is_multipart = (
            request.content_type
            and "multipart/form-data" in request.content_type
        )
        if not is_multipart:
            obj = self.get_object(obj_id)
            if obj is None:
                return self.send_not_found(obj_id)
            _check_announcement_write_escalation(request, obj, dict(request.data))
            return super().put(request, obj_id)

        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)

        data = parse_multipart_announcement_data(request.data)
        _check_announcement_write_escalation(request, obj, data)
        ser = self.get_serializer(
            obj,
            data=data,
            partial=True,
            context={"skip_teams_schedule": True, "request": request},
        )
        if not ser.is_valid():
            return self.send_response(
                True,
                "bad_request",
                {"details": ser.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        instance = ser.save()
        apply_announcement_attachment_mutations(request, instance)
        claim_inline_attachments_for_instance(request, instance)

        tenant = getattr(request, "tenant", None)
        if (
            tenant
            and instance.send_to_microsoft
            and _acting_user_is_announcement_author(request, instance)
        ):
            schedule_announcement_teams_sync(instance, tenant)

        instance.refresh_from_db()
        out_ser = self.get_serializer(instance)
        return self.send_response(
            False,
            "updated",
            {"data": out_ser.data},
            status=status.HTTP_200_OK,
        )


class AnnouncementBatchCreateView(RBACView):
    name = "Announcement batch create view"
    model = models.Announcement
    serializer = serializers.AnnouncementSerializer
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method == "POST" and not _has_announcement_manage(request.user):
            raise PermissionDenied("You don't have permission to manage announcements.")

    def post(self, request: Request):
        is_multipart = (
            request.content_type
            and "multipart/form-data" in request.content_type
        )
        if not is_multipart:
            return self.send_response(
                True,
                "bad_request",
                {"details": "multipart/form-data is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = create_announcements_batch(request, self.get_serializer_class())
        except BatchCreateValidationError as exc:
            return self.send_response(
                True,
                "bad_request",
                {"details": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = batch_result_to_payload(result)
        if not result.created:
            return self.send_response(
                True,
                "bad_request",
                {"data": payload},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response_status = (
            status.HTTP_207_MULTI_STATUS
            if result.failed
            else status.HTTP_201_CREATED
        )
        message = "partial_success" if result.failed else "created"
        return self.send_response(
            False,
            message,
            {"data": payload},
            status=response_status,
        )


class AnnouncementBatchCreateView(RBACView):
    name = "Announcement batch create view"
    model = models.Announcement
    serializer = serializers.AnnouncementSerializer
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method == "POST" and not _has_announcement_manage(request.user):
            raise PermissionDenied("You don't have permission to manage announcements.")

    def post(self, request: Request):
        is_multipart = (
            request.content_type
            and "multipart/form-data" in request.content_type
        )
        if not is_multipart:
            return self.send_response(
                True,
                "bad_request",
                {"details": "multipart/form-data is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = create_announcements_batch(request, self.get_serializer_class())
        except BatchCreateValidationError as exc:
            return self.send_response(
                True,
                "bad_request",
                {"details": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = batch_result_to_payload(result)
        if not result.created:
            return self.send_response(
                True,
                "bad_request",
                {"data": payload},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response_status = (
            status.HTTP_207_MULTI_STATUS
            if result.failed
            else status.HTTP_201_CREATED
        )
        message = "partial_success" if result.failed else "created"
        return self.send_response(
            False,
            message,
            {"data": payload},
            status=response_status,
        )


class AnnouncementBatchCreateView(RBACView):
    name = "Announcement batch create view"
    model = models.Announcement
    serializer = serializers.AnnouncementSerializer
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method == "POST" and not _has_announcement_manage(request.user):
            raise PermissionDenied("You don't have permission to manage announcements.")

    def post(self, request: Request):
        is_multipart = (
            request.content_type
            and "multipart/form-data" in request.content_type
        )
        if not is_multipart:
            return self.send_response(
                True,
                "bad_request",
                {"details": "multipart/form-data is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = create_announcements_batch(request, self.get_serializer_class())
        except BatchCreateValidationError as exc:
            return self.send_response(
                True,
                "bad_request",
                {"details": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = batch_result_to_payload(result)
        if not result.created:
            return self.send_response(
                True,
                "bad_request",
                {"data": payload},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response_status = (
            status.HTTP_207_MULTI_STATUS
            if result.failed
            else status.HTTP_201_CREATED
        )
        message = "partial_success" if result.failed else "created"
        return self.send_response(
            False,
            message,
            {"data": payload},
            status=response_status,
        )


class AnnouncementSearchView(RBACSearchView):
    name = "Announcement search view"
    model = models.Announcement
    serializer = serializers.AnnouncementSerializer
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]


class AnnouncementResendTeamsView(RBACView):
    name = "Announcement resend to Teams view"
    model = models.Announcement
    serializer = serializers.AnnouncementSerializer
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]

    def post(self, request: Request, obj_id: int):
        announcement = models.Announcement.objects.filter(pk=obj_id).first()
        if announcement is None:
            return self.send_not_found(obj_id)

        _require_announcement_write(request, course_id=announcement.course_id)

        if not _acting_user_is_announcement_author(request, announcement):
            return self.send_response(
                True,
                "forbidden",
                {
                    "details": (
                        "Only the original author can resend this post to Microsoft Teams."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if not announcement.send_to_microsoft:
            return self.send_response(
                True,
                "bad_request",
                {"details": "This post is not marked for Microsoft Teams."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tenant = getattr(request, "tenant", None)
        if not tenant:
            return self.send_response(
                True,
                "bad_request",
                {"details": "Tenant context is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = resend_announcement_to_teams_sync(announcement, tenant)
        announcement.refresh_from_db()
        out_ser = serializers.AnnouncementSerializer(announcement)
        payload = {"data": out_ser.data}
        if result.outcome == TeamsSendOutcome.SUCCESS:
            return self.send_response(
                False,
                "ok",
                payload,
                status=status.HTTP_200_OK,
            )
        return self.send_response(
            True,
            "bad_request",
            {
                **payload,
                "details": _failure_message_for_result(result, attempt=0),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )


class NewsListView(RBACListView):
    name = "News list view"
    model = models.News
    serializer = serializers.NewsSerializer
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method == "POST":
            _require_news_manage(request)


class NewsDetailsView(RBACDetailsView):
    name = "News details view"
    model = models.News
    serializer = serializers.NewsSerializer
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method in ("PUT", "PATCH", "DELETE"):
            _require_news_manage(request)


class NewsSearchView(RBACSearchView):
    name = "News search view"
    model = models.News
    serializer = serializers.NewsSerializer
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]


class NewsPublicDetailsView(RBACDetailsView):
    name = "News public details view"
    model = models.News
    serializer = serializers.NewsSerializer
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def put(self, request: Request):
        raise MethodNotAllowed("PUT")

    def delete(self, request: Request, obj_id: int):
        raise MethodNotAllowed("DELETE")


class NewsPublicListView(RBACListView):
    name = "News public list view"
    model = models.News
    serializer = serializers.NewsSerializer
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def post(self, request: Request):
        raise MethodNotAllowed("POST")


class CommentListView(RBACListView):
    name = "Comment list view"
    model = models.Comment
    serializer = serializers.CommentSerializer
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]


class CommentDetailsView(RBACDetailsView):
    name = "Comment details view"
    model = models.Comment
    serializer = serializers.CommentSerializer
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]


class CommentSearchView(RBACSearchView):
    name = "Comment search view"
    model = models.Comment
    serializer = serializers.CommentSerializer
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]


class ReactionListView(RBACListView):
    name = "Reaction list view"
    model = models.Reaction
    serializer = serializers.ReactionSerializer
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]


class ReactionDetailsView(RBACDetailsView):
    name = "Reaction details view"
    model = models.Reaction
    serializer = serializers.ReactionSerializer
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]


class ReactionSearchView(RBACSearchView):
    name = "Reaction search view"
    model = models.Reaction
    serializer = serializers.ReactionSerializer
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]

from __future__ import annotations

from django.db.models import Q
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from app_attendance.leave_request_approval import approve_leave_request, deny_leave_request
from app_attendance.leave_request_notifications import notify_leave_submitted
from app_attendance.leave_request_serializers import (
    LeaveRequestDenySerializer,
    LeaveRequestSerializer,
    StudentLeaveRequestCreateSerializer,
    StudentLeaveRequestUpdateSerializer,
)
from app_attendance.leave_request_validation import find_overlapping_leave_request
from app_attendance.models import LeaveRequest
from app_course.course_scoping import acting_user
from app_rbac.resolution import effective_permissions
from app_rbac.views import RBACDetailsView, RBACListView, RBACView
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication

_AUTH = [TenantBoundJWTStatelessAuthentication]


def _user_can_view_all_leave(user) -> bool:
    return "leave.view_all" in effective_permissions(user)


def _user_can_view_own_leave(user) -> bool:
    return "leave.view_own" in effective_permissions(user)


def _leave_overlap_response(overlap: LeaveRequest) -> Response:
    return Response(
        {
            "code": "leave_overlap",
            "message": "You already have a leave request for these dates.",
            "existing_request_id": overlap.id,
            "existing_request_status": overlap.status,
        },
        status=status.HTTP_409_CONFLICT,
    )


def _check_leave_overlap(
    *,
    student,
    start_date,
    end_date,
    exclude_id=None,
) -> Response | None:
    overlap = find_overlapping_leave_request(
        student,
        start_date,
        end_date,
        exclude_id=exclude_id,
    )
    if overlap is not None:
        return _leave_overlap_response(overlap)
    return None


def _get_leave_for_actor(request, obj_id: int) -> LeaveRequest | None:
    user = acting_user(request)
    if user is None:
        return None
    leave = LeaveRequest.objects.filter(pk=obj_id).first()
    if leave is None:
        return None
    if _user_can_view_all_leave(user):
        return leave
    if leave.student_id == user.id:
        return leave
    return None


def _admin_list_filter_q(request) -> Q:
    filters = Q()
    status_value = (request.query_params.get("status") or "").strip()
    if status_value:
        filters &= Q(status=status_value)

    student_id = (request.query_params.get("student_id") or "").strip()
    if student_id:
        filters &= Q(student_id=student_id)

    start_date_gte = (request.query_params.get("start_date_gte") or "").strip()
    if start_date_gte:
        filters &= Q(start_date__gte=start_date_gte)

    end_date_lte = (request.query_params.get("end_date_lte") or "").strip()
    if end_date_lte:
        filters &= Q(end_date__lte=end_date_lte)

    return filters


class _LeaveRoleAwareMixin:
    _student_required_permissions: dict = {}

    def initial(self, request, *args, **kwargs):
        user = acting_user(request)
        if (
            user
            and not _user_can_view_all_leave(user)
            and self._student_required_permissions
        ):
            self.required_permissions = dict(self._student_required_permissions)
        super().initial(request, *args, **kwargs)


class LeaveRequestListCreateView(_LeaveRoleAwareMixin, RBACListView):
    name = "Leave request list/create view"
    model = LeaveRequest
    serializer = LeaveRequestSerializer
    authentication_classes = _AUTH
    required_permissions = {"GET": "leave.view_all", "POST": "leave.create"}
    _student_required_permissions = {
        "GET": "leave.view_own",
        "POST": "leave.create",
    }

    def get_queryset(
        self,
        request,
        filter_params=None,
        exclude_params=None,
        is_csv=False,
        fields=None,
        sorts=None,
        expand=None,
        filter_ids=None,
        chained_filter_params=None,
    ):
        user = acting_user(request)
        chained = list(chained_filter_params or [])
        if user is None:
            chained.append(Q(pk__in=[]))
        elif _user_can_view_all_leave(user):
            admin_filter = _admin_list_filter_q(request)
            if admin_filter.children:
                chained.append(admin_filter)
        elif _user_can_view_own_leave(user):
            chained.append(Q(student_id=user.id))
        else:
            chained.append(Q(pk__in=[]))

        return super().get_queryset(
            request,
            filter_params=filter_params,
            exclude_params=exclude_params,
            is_csv=is_csv,
            fields=fields,
            sorts=sorts,
            expand=expand,
            filter_ids=filter_ids,
            chained_filter_params=chained,
        )

    def post(self, request):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")

        serializer = StudentLeaveRequestCreateSerializer(
            data=request.data,
            context={"request": request},
        )
        if not serializer.is_valid():
            return self.bad_request(serializer.errors)

        validated = serializer.validated_data
        overlap_response = _check_leave_overlap(
            student=user,
            start_date=validated["start_date"],
            end_date=validated["end_date"],
        )
        if overlap_response is not None:
            return overlap_response

        leave = serializer.save()
        notify_leave_submitted(leave, request.tenant)
        return self.created(LeaveRequestSerializer(leave).data)


class LeaveRequestDetailView(_LeaveRoleAwareMixin, RBACDetailsView):
    name = "Leave request detail view"
    model = LeaveRequest
    serializer = LeaveRequestSerializer
    authentication_classes = _AUTH
    required_permissions = {"GET": "leave.view_all", "PATCH": "leave.update_own"}
    _student_required_permissions = {
        "GET": "leave.view_own",
        "PATCH": "leave.update_own",
    }

    def get(self, request, obj_id: int):
        leave = _get_leave_for_actor(request, obj_id)
        if leave is None:
            return self.send_not_found(obj_id)
        query_params = self.get_query_params(request)
        query_params.pop("sorts")
        serialized_data = self.get_serializer(leave, **query_params)
        return self.ok(serialized_data.data)

    def patch(self, request, obj_id: int):
        user = acting_user(request)
        leave = _get_leave_for_actor(request, obj_id)
        if leave is None:
            return self.send_not_found(obj_id)
        if user is None or leave.student_id != user.id:
            return self.forbidden("Only the submitting student may edit this request.")
        if leave.status != LeaveRequest.Status.PENDING:
            return self.bad_request("Only pending leave requests can be edited.")

        serializer = StudentLeaveRequestUpdateSerializer(
            leave,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        if not serializer.is_valid():
            return self.bad_request(serializer.errors)

        start_date = serializer.validated_data.get("start_date", leave.start_date)
        end_date = serializer.validated_data.get("end_date", leave.end_date)
        overlap_response = _check_leave_overlap(
            student=user,
            start_date=start_date,
            end_date=end_date,
            exclude_id=leave.id,
        )
        if overlap_response is not None:
            return overlap_response

        leave = serializer.save()
        return self.updated(LeaveRequestSerializer(leave).data)


class LeaveRequestCancelView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"POST": "leave.update_own"}

    def post(self, request, obj_id: int):
        user = acting_user(request)
        leave = _get_leave_for_actor(request, obj_id)
        if leave is None:
            return self.not_found("Leave request not found.")
        if user is None or leave.student_id != user.id:
            return self.forbidden("Only the submitting student may cancel this request.")
        if leave.status != LeaveRequest.Status.PENDING:
            return self.bad_request("Only pending leave requests can be cancelled.")

        leave.status = LeaveRequest.Status.CANCELLED
        leave.save(update_fields=["status"])
        return self.ok(LeaveRequestSerializer(leave).data)


class LeaveRequestApproveView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"POST": "leave.manage_all"}

    def post(self, request, obj_id: int):
        leave = LeaveRequest.objects.filter(pk=obj_id).first()
        if leave is None:
            return self.not_found("Leave request not found.")
        actor = acting_user(request)
        if actor is None:
            return self.forbidden("Authentication required.")
        try:
            leave = approve_leave_request(leave, actor=actor, tenant=request.tenant)
        except ValidationError as exc:
            detail = exc.detail
            message = detail if isinstance(detail, str) else str(detail)
            return self.send_response(
                True,
                "conflict",
                {"details": message},
                status=status.HTTP_409_CONFLICT,
            )
        return self.ok(LeaveRequestSerializer(leave).data)


class LeaveRequestDenyView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"POST": "leave.manage_all"}

    def post(self, request, obj_id: int):
        leave = LeaveRequest.objects.filter(pk=obj_id).first()
        if leave is None:
            return self.not_found("Leave request not found.")
        actor = acting_user(request)
        if actor is None:
            return self.forbidden("Authentication required.")

        body = LeaveRequestDenySerializer(data=request.data)
        if not body.is_valid():
            return self.bad_request(body.errors)

        try:
            leave = deny_leave_request(
                leave,
                actor=actor,
                denial_reason=body.validated_data["denial_reason"],
                tenant=request.tenant,
            )
        except ValidationError as exc:
            detail = exc.detail
            if isinstance(detail, dict):
                return self.bad_request(detail)
            message = detail if isinstance(detail, str) else str(detail)
            return self.send_response(
                True,
                "conflict",
                {"details": message},
                status=status.HTTP_409_CONFLICT,
            )
        return self.ok(LeaveRequestSerializer(leave).data)

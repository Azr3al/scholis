from django.utils.dateparse import parse_date
from rest_framework.exceptions import ValidationError

from app_auth.models import User
from app_course.course_scoping import acting_user
from app_points import models, serializers, services
from app_points.guards import staff_points_enabled
from app_rbac.resolution import effective_permissions
from app_rbac.views import RBACDetailsView, RBACListView, RBACView
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication

_AUTH = [TenantBoundJWTStatelessAuthentication]


class _StaffPointsEnabledMixin:
    def dispatch(self, request, *args, **kwargs):
        if not staff_points_enabled(getattr(request, "tenant", None)):
            request = self.initialize_request(request, *args, **kwargs)
            self.request = request
            self.args = args
            self.kwargs = kwargs
            self.headers = self.default_response_headers
            response = self.send_response(
                True,
                "staff_points_disabled",
                {"details": "Staff points is disabled for this organization."},
                status=404,
            )
            return self.finalize_response(request, response, *args, **kwargs)
        return super().dispatch(request, *args, **kwargs)


class PointTypeListView(_StaffPointsEnabledMixin, RBACListView):
    model = models.PointType
    serializer = serializers.PointTypeSerializer
    authentication_classes = _AUTH
    required_permissions = {"GET": "points.view", "POST": "points.configure"}


class PointTypeDetailView(_StaffPointsEnabledMixin, RBACDetailsView):
    model = models.PointType
    serializer = serializers.PointTypeSerializer
    authentication_classes = _AUTH
    required_permissions = {
        "GET": "points.configure",
        "PUT": "points.configure",
        "PATCH": "points.configure",
    }

    def patch(self, request, obj_id: int):
        return self.put(request, obj_id)

    def delete(self, request, obj_id: int):
        return self.send_response(True, "method_not_allowed", {}, status=405)


class UserPointsView(_StaffPointsEnabledMixin, RBACView):
    model = models.PointTransaction
    authentication_classes = _AUTH
    rbac_decision = "authenticated_only"

    def get(self, request, user_id: int):
        actor = acting_user(request)
        subject = User.objects.filter(pk=user_id).first()
        if not subject:
            return self.not_found("User not found.")

        held = effective_permissions(request.user)
        is_self = actor is not None and actor.id == user_id

        if is_self:
            if not services.is_staff_user(subject):
                return self.forbidden("Students cannot access staff points.")
        elif "points.view" not in held:
            return self.forbidden("You cannot view this user's points.")

        tx_qs = (
            models.PointTransaction.objects.filter(subject=subject)
            .select_related("point_type", "actor")
            .order_by("-created_at", "-id")
        )
        paginated = self.paginate_queryset(tx_qs, request)
        txs = paginated if paginated is not None else tx_qs

        types = models.PointType.objects.all().order_by("sort_order", "id")
        payload = {
            "balances": services.get_balances(subject),
            "point_types": serializers.PointTypeSerializer(types, many=True).data,
            "transactions": serializers.PointTransactionSerializer(txs, many=True).data,
        }
        pagination = self.get_paginated_response() if paginated is not None else {}
        return self.ok(payload, **pagination)


class UserPointTransactionCreateView(_StaffPointsEnabledMixin, RBACView):
    authentication_classes = _AUTH
    required_permissions = {"POST": "points.award"}

    def post(self, request, user_id: int):
        subject = User.objects.filter(pk=user_id).first()
        if not subject:
            return self.not_found("User not found.")

        body = serializers.PostTransactionSerializer(data=request.data)
        body.is_valid(raise_exception=True)

        point_type = models.PointType.objects.filter(
            pk=body.validated_data["point_type_id"]
        ).first()
        if not point_type:
            return self.bad_request("Invalid point type.")

        try:
            tx = services.post_transaction(
                subject=subject,
                actor=acting_user(request),
                point_type=point_type,
                delta=body.validated_data["delta"],
                note=body.validated_data["note"],
            )
        except ValidationError as exc:
            return self.validation_error(exc.detail)

        tx = (
            models.PointTransaction.objects.filter(pk=tx.pk)
            .select_related("point_type", "actor")
            .first()
        )
        payload = {
            "transaction": serializers.PointTransactionSerializer(tx).data,
            "balances": services.get_balances(subject),
        }
        return self.created(payload)


class StaffPointsSheetView(_StaffPointsEnabledMixin, RBACView):
    authentication_classes = _AUTH
    required_permissions = {"GET": "points.view"}

    def get(self, request):
        types = models.PointType.objects.all().order_by("sort_order", "id")
        payload = {
            "point_types": serializers.PointTypeSerializer(types, many=True).data,
            "rows": services.get_staff_sheet_rows(request),
        }
        return self.ok(payload)


class PointTransactionSearchView(_StaffPointsEnabledMixin, RBACView):
    model = models.PointTransaction
    authentication_classes = _AUTH
    required_permissions = {"GET": "points.view"}

    def get(self, request):
        qs = models.PointTransaction.objects.select_related(
            "point_type", "actor", "subject"
        ).order_by("-created_at", "-id")

        subject_id = request.GET.get("subject_id")
        if subject_id:
            qs = qs.filter(subject_id=subject_id)

        point_type_id = request.GET.get("point_type_id")
        if point_type_id:
            qs = qs.filter(point_type_id=point_type_id)

        actor_id = request.GET.get("actor_id")
        if actor_id:
            qs = qs.filter(actor_id=actor_id)

        date_from = request.GET.get("date_from")
        if date_from:
            parsed = parse_date(date_from)
            if parsed is None:
                return self.bad_request("Invalid date_from.")
            qs = qs.filter(created_at__date__gte=parsed)

        date_to = request.GET.get("date_to")
        if date_to:
            parsed = parse_date(date_to)
            if parsed is None:
                return self.bad_request("Invalid date_to.")
            qs = qs.filter(created_at__date__lte=parsed)

        paginated = self.paginate_queryset(qs, request)
        rows = paginated if paginated is not None else qs
        data = serializers.PointTransactionSerializer(rows, many=True).data
        pagination = self.get_paginated_response() if paginated is not None else {}
        return self.ok(data, **pagination)

import datetime
import hashlib
import time
from datetime import timedelta
from uuid import uuid4

from django.core.cache import cache

from app_auth.registration_guards import assert_recent_email_verification
from app_auth.welcome_email_helpers import resend_welcome_email
from app_auth.helpers import generate_verification_code
from app_microsoft.graph_wrapper.user import MSUser
import pytz
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from app_auth.refresh_sessions import (
    refresh_auth_tokens,
    revoke_all_refresh_sessions_for_user,
    revoke_refresh_session,
)

from app_auth import models, serializers
from app_auth.field_stewardship import (
    STEWARD_USER_KEYS,
    record_steward_field_changes,
    request_write_keys,
    user_write_mode,
)
from app_auth.serializers import (
    ExpoTokenSerializer,
    LoginSerializer,
    MSLoginSerializer,
    UserSerializer,
)
from django.db import connection, transaction
from django.db.models import Prefetch
from django.utils import timezone

from app_course.course_search_queryset import (
    annotate_course_queryset_first_event_times,
    build_user_course_queryset_with_optimized_course,
)
from app_course.models import Course, UserCourse, CourseJoinRequest
from app_course.serializers import CourseSerializer
from app_auth.shortcuts_availability_helpers import (
    fetch_busy_user_ids_for_timeslot,
    filter_active_teachers,
    filter_dates_by_day_parity,
    iter_dates_in_month_matching_weekdays,
    parse_day_parity_param,
    parse_iso_weekdays_param,
    parse_time_hhmm,
    validate_thirty_minute_time,
)
from utilitas.pagination import CustomPagination
from app_microsoft.mail import send_mail
from app_custom_fields.form_config import build_registration_form_config
from utilitas.queryset_mixins import ExpandPrefetchSpec, OptimizedSearchMixin
from app_rbac import scoping
from app_rbac.resolution import effective_permissions
from app_rbac.views import (
    RBACDetailsView,
    RBACListView,
    RBACPermission,
    RBACSearchView,
    RBACView,
)
from app_auth.user_scoping import (
    acting_user,
    check_user_read,
    check_user_write,
    scope_users_for_user,
)
from app_auth.role_grants import (
    SYSTEM_ROLE_VALUES,
    has_legacy_role,
    merge_role_add,
    validate_grantable_roles,
)
from app_rbac.realtime import broadcast_rbac_updated_to_user


class UserListView(RBACListView):
    model = models.User
    serializer = serializers.UserSerializer
    required_permissions = {"GET": "user.view", "POST": "user.create"}

    def get(self, request, filter_ids=None):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        held = set(effective_permissions(user))
        if scoping.has_read_breadth("user", held):
            return super().get(request, filter_ids)
        user_ids = list(scope_users_for_user(user).values_list("id", flat=True))
        return super().get(request, user_ids)


def _user_roles_are_changing(current_roles, new_roles) -> bool:
    if new_roles is None:
        return False
    return sorted(new_roles or []) != sorted(current_roles or [])


class UserDetailsView(RBACDetailsView):
    model = models.User
    serializer = serializers.UserSerializer
    required_permissions = {
        "GET": "user.view",
        "PUT": "user.update",
        "PATCH": "user.update",
        "DELETE": "user.delete",
    }

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["include_stewardship"] = True
        return ctx

    def check_permissions(self, request):
        if request.method in ("PUT", "PATCH"):
            actor = acting_user(request)
            obj_id = self.kwargs.get("obj_id")
            if actor is not None and obj_id is not None:
                target = self.model.objects.filter(pk=obj_id).first()
                if target is not None and user_write_mode(actor, target) != "none":
                    return
        super().check_permissions(request)

    def get_object(self, obj_id: int, prefetch_fields=None):
        """
        User profile expands user_courses.course; CourseSerializer runs several
        SerializerMethodFields that otherwise query once per course (primary teacher,
        Teams organizer, first event times). Use one annotated course queryset +
        teacher-roster prefetch aligned with teams_organizer.get_course_primary_teacher_user.
        """
        if prefetch_fields is None:
            prefetch_fields = set()
        elif not isinstance(prefetch_fields, (set, frozenset)):
            prefetch_fields = set(prefetch_fields)

        has_user_courses_expand = any(
            name == "user_courses" or name.startswith("user_courses__")
            for name in prefetch_fields
        )
        if not has_user_courses_expand:
            return (
                self.model.objects.filter(pk=obj_id)
                .prefetch_related(*prefetch_fields)
                .first()
            )

        teacher_roster_qs = UserCourse.objects.filter(
            assigned_as=UserCourse.AssignedAs.TEACHER,
        ).select_related("user", "assigned_as_role")

        course_qs = annotate_course_queryset_first_event_times(
            Course.objects.select_related("program", "level", "section")
        ).prefetch_related(
            Prefetch(
                "user_courses",
                queryset=teacher_roster_qs,
                to_attr="_prefetched_teacher_user_courses",
            )
        )

        user_course_qs = UserCourse.objects.select_related("assigned_as_role")
        # CourseSerializer always needs first-event annotations + teacher roster on course;
        # do not wait for clients to pass user_courses__course (avoids Event N+1).
        user_course_qs = user_course_qs.prefetch_related(
            Prefetch("course", queryset=course_qs)
        )

        remaining = [
            p
            for p in prefetch_fields
            if p != "user_courses" and not p.startswith("user_courses__")
        ]
        remaining.append(Prefetch("user_courses", queryset=user_course_qs))

        return (
            self.model.objects.filter(pk=obj_id).prefetch_related(*remaining).first()
        )

    def get(self, request, obj_id: int):
        query_params = self.get_query_params(request)
        query_params.pop("sorts")
        obj = self.get_object(
            obj_id, self.translate_expand_params(query_params.get("expand", []))
        )
        if obj is None:
            return self.send_not_found(obj_id)
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        check_user_read(user, obj)
        serialized_data = self.get_serializer(obj, **query_params)
        return self.ok(serialized_data.data)

    def put(self, request, obj_id: int):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        mode = user_write_mode(user, obj)
        if mode == "none":
            return self.send_response(
                True,
                "forbidden",
                {"details": "Not allowed for this user."},
                status=403,
            )
        if mode == "steward":
            keys = request_write_keys(request.data)
            bad = sorted(keys - STEWARD_USER_KEYS)
            if bad:
                return self.send_response(
                    True,
                    "forbidden",
                    {"details": {"disallowed_fields": bad}},
                    status=403,
                )
        new_roles = request.data.get("roles") if "roles" in request.data else None
        roles_changing = _user_roles_are_changing(obj.roles, new_roles)
        if mode == "full":
            if roles_changing:
                held = effective_permissions(user)
                if "user.assign_roles" not in held:
                    raise PermissionDenied("You don't have permission to assign roles.")
                validate_grantable_roles(
                    user,
                    new_roles,
                    request.tenant,
                    previous_roles=obj.roles,
                )
            check_user_write(user, obj)
        if "is_active" in request.data:
            from app_auth.user_query_helpers import user_has_manager_or_above

            actor = models.User.get_user_from_request(request)
            if not user_has_manager_or_above(actor):
                return self.send_response(
                    True,
                    "forbidden",
                    {
                        "details": "Only managers and above can change account active status.",
                    },
                    status=403,
                )
            if obj.is_student():
                return self.send_response(
                    True,
                    "forbidden",
                    {
                        "details": "Cannot change active status for student-only accounts.",
                    },
                    status=403,
                )
        should_clear_resigned = (
            "is_active" in request.data
            and request.data.get("is_active") in (True, "true", "True", 1, "1")
            and obj.resigned_at is not None
        )
        previous = {key: getattr(obj, key, None) for key in STEWARD_USER_KEYS}
        response = super().put(request, obj_id)
        if response.status_code == 200:
            obj.refresh_from_db()
            current = {key: getattr(obj, key, None) for key in STEWARD_USER_KEYS}
            record_steward_field_changes(user, obj, mode, previous, current)
        if should_clear_resigned and response.status_code == 200:
            models.User.objects.filter(pk=obj_id).update(resigned_at=None)
            if isinstance(response.data, dict):
                data = response.data.get("data")
                if isinstance(data, dict):
                    data["resigned_at"] = None
        if roles_changing and response.status_code == 200 and isinstance(
            response.data, dict
        ):
            data = response.data.get("data")
            if isinstance(data, dict):
                data["has_legacy_role"] = has_legacy_role(new_roles or [])
            schema = getattr(connection, "schema_name", None) or "public"
            broadcast_rbac_updated_to_user(schema, obj_id)
        return response

    def delete(self, request, obj_id: int):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        check_user_write(user, obj)
        return super().delete(request, obj_id)


class UserSearchView(OptimizedSearchMixin, RBACSearchView):
    model = models.User
    serializer = serializers.UserSearchSerializer
    required_permissions = {"POST": "user.view"}
    expand_prefetch_specs = [
        ExpandPrefetchSpec(
            trigger_expand="user_courses",
            replace_lookup="user_courses",
            queryset_factory=build_user_course_queryset_with_optimized_course,
        ),
    ]

    def get_serializer_class(self):
        if self.get_expand_param(self.request):
            return serializers.UserSerializer
        return serializers.UserSearchSerializer

    def augment_search_queryset(self, queryset, expand, is_csv):
        queryset = super().augment_search_queryset(queryset, expand, is_csv)
        from app_auth.user_search import apply_user_search_q_with_meta, get_search_q

        q = get_search_q(self.request)
        if q:
            queryset, self._search_used_fallback = apply_user_search_q_with_meta(
                queryset, q
            )
        else:
            self._search_used_fallback = False
        if expand:
            queryset = queryset.prefetch_related(
                "scoped_programs", "scoped_categories"
            )
        return queryset

    def post(self, request, filter_ids=None):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        held = set(effective_permissions(user))
        if not scoping.has_read_breadth("user", held):
            filter_ids = list(scope_users_for_user(user).values_list("id", flat=True))
        self._search_used_fallback = False
        response = super().post(request, filter_ids)
        from app_auth.user_search import get_search_q

        q = get_search_q(request)
        if hasattr(response, "data") and isinstance(response.data, dict) and q:
            response.data["used_fallback"] = getattr(
                self, "_search_used_fallback", False
            )
        return response


class UserSuggestView(RBACView):
    """GET /users/suggest?q= — typeahead (FTS when enabled, Redis-cached)."""

    name = "User suggest view"
    model = models.User
    required_permissions = {"GET": "user.view"}

    def get(self, request):
        from app_auth.cache import cached_suggest
        from app_auth.user_query_helpers import _truthy_query_param
        from app_auth.user_search import user_suggest_queryset

        q = (request.query_params.get("q") or "").strip()
        if len(q) < 2:
            return self.ok([])

        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        base_qs = scope_users_for_user(user)
        if not _truthy_query_param(request, "include_inactive"):
            base_qs = base_qs.filter(is_active=True)

        def load():
            qs = user_suggest_queryset(base_qs, q, limit=8)
            return list(
                qs.values(
                    "id",
                    "name",
                    "email",
                    "code",
                    "roles",
                    "profile_image",
                )
            )

        results = cached_suggest(q, load)
        return self.ok(results)


class UserProfileView(RBACView):
    model = models.User
    serializer = serializers.UserSerializer
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["include_stewardship"] = True
        return ctx

    def get(self, request):
        from django.db import connection
        from app_rbac.cache import matrix_generation

        user = self.model.objects.filter(email=request.user.id).first()
        serialized_data = self.get_serializer(user)
        data = serialized_data.data
        data["permissions"] = user.get_effective_permissions()
        data["rbac_version"] = matrix_generation(
            getattr(connection, "schema_name", "public")
        )
        return self.ok(data)


class ExpoTokenUpsertView(RBACView):
    """POST: Register or update the current user's Expo push token."""

    model = models.User
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]

    def post(self, request):
        serializer = ExpoTokenSerializer(data=request.data)
        if not serializer.is_valid():
            return self.bad_request(serializer.errors)
        user = self.model.objects.filter(email=request.user.id).first()
        if not user:
            return self.not_found("User not found.")
        from expo_notifications.models import Device

        defaults = {"is_active": True}
        if serializer.validated_data.get("lang"):
            defaults["lang"] = serializer.validated_data["lang"]
        device, created = Device.objects.update_or_create(
            user=user,
            push_token=serializer.validated_data["push_token"],
            defaults=defaults,
        )
        return self.send_response(
            False,
            "created" if created else "updated",
            {"data": {"id": device.pk, "push_token": device.push_token}},
            status=200,
        )


class ExpoTokenDeactivateView(RBACView):
    """POST: Deactivate current user's Expo push token."""

    model = models.User
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]

    def post(self, request):
        serializer = ExpoTokenSerializer(data=request.data)
        if not serializer.is_valid():
            return self.bad_request(serializer.errors)
        user = self.model.objects.filter(email=request.user.id).first()
        if not user:
            return self.not_found("User not found.")
        from expo_notifications.models import Device

        count = Device.objects.filter(
            user=user,
            push_token=serializer.validated_data["push_token"],
            is_active=True,
        ).update(is_active=False)
        return self.send_response(
            False,
            "success",
            {"data": {"deactivated": count}},
            status=200,
        )


class WebPushSubscriptionUpsertView(RBACView):
    """POST: Register or update the current user's web push subscription."""

    model = models.User
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]

    def post(self, request):
        serializer = serializers.WebPushSubscriptionSerializer(data=request.data)
        if not serializer.is_valid():
            return self.bad_request(serializer.errors)

        user = self.model.objects.filter(email=request.user.id).first()
        if not user:
            return self.not_found("User not found.")

        endpoint = serializer.validated_data["endpoint"]
        keys = serializer.validated_data["keys"]
        user_agent = serializer.validated_data.get("user_agent", "")

        defaults = {
            "p256dh": keys["p256dh"],
            "auth": keys["auth"],
            "is_active": True,
        }
        if user_agent:
            defaults["user_agent"] = user_agent

        subscription, created = models.WebPushSubscription.objects.update_or_create(
            user=user,
            endpoint=endpoint,
            defaults=defaults,
        )

        return self.send_response(
            False,
            "created" if created else "updated",
            {"data": {"id": subscription.pk, "endpoint": subscription.endpoint}},
            status=200,
        )


class WebPushSubscriptionDeactivateView(RBACView):
    """POST: Deactivate current user's web push subscription."""

    model = models.User
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]

    def post(self, request):
        serializer = serializers.WebPushSubscriptionDeactivateSerializer(data=request.data)
        if not serializer.is_valid():
            return self.bad_request(serializer.errors)

        user = self.model.objects.filter(email=request.user.id).first()
        if not user:
            return self.not_found("User not found.")

        endpoint = serializer.validated_data["endpoint"]

        count = models.WebPushSubscription.objects.filter(
            user=user,
            endpoint=endpoint,
            is_active=True,
        ).update(is_active=False)

        return self.send_response(
            False,
            "success",
            {"data": {"deactivated": count}},
            status=200,
        )


class UserAvailabilityView(RBACView):
    model = Course
    serializer = CourseSerializer
    required_permissions = {"POST": "user.view"}

    def post(self, request, user_id: int):
        user = models.User.objects.filter(id=user_id).first()
        if not user:
            return self.not_found("No such user with the given id")
        actor = acting_user(request)
        if actor is None:
            return self.forbidden("Authentication required.")
        check_user_read(actor, user)


class UsersAvailableForTimeslotView(RBACView):
    """
    GET query params: year_month (YYYY-MM), time_from, time_to (HH:MM tenant-local),
    weekdays (comma-separated ISO 1–7, Monday=1), optional day_parity (all, even, odd),
    page, size.
    Returns active users with the teacher role and no collision-counted conflict on
    every matching calendar date in that month during the timeslot.
    """

    required_permissions = {"GET": "user.view_all"}
    pagination_class = CustomPagination

    def get(self, request):
        actor = models.User.objects.filter(email=request.user.id).first()
        if not actor:
            return self.not_found("User not found.")

        year_month = (request.query_params.get("year_month") or "").strip()
        time_from_s = (request.query_params.get("time_from") or "").strip()
        time_to_s = (request.query_params.get("time_to") or "").strip()
        weekdays_s = (request.query_params.get("weekdays") or "").strip()
        day_parity_s = (request.query_params.get("day_parity") or "").strip()

        try:
            ym = datetime.datetime.strptime(year_month, "%Y-%m").date()
            year, month = ym.year, ym.month
        except (ValueError, TypeError):
            return self.bad_request("Invalid or missing year_month (expected YYYY-MM).")

        try:
            iso_days = parse_iso_weekdays_param(weekdays_s)
            if not iso_days:
                raise ValueError("Select at least one weekday.")
            t_from = parse_time_hhmm(time_from_s)
            t_to = parse_time_hhmm(time_to_s)
            validate_thirty_minute_time(t_from)
            validate_thirty_minute_time(t_to)
            day_parity = parse_day_parity_param(day_parity_s)
        except ValueError as e:
            return self.bad_request(str(e))

        if t_to <= t_from:
            return self.bad_request("time_to must be after time_from.")

        tenant_tz = getattr(request.tenant, "timezone", None) or "UTC"
        candidate_dates = filter_dates_by_day_parity(
            iter_dates_in_month_matching_weekdays(year, month, iso_days),
            day_parity,
        )

        busy_ids: set[int] = set()
        if candidate_dates:
            busy_ids = fetch_busy_user_ids_for_timeslot(
                tenant_tz=tenant_tz,
                candidate_dates=candidate_dates,
                slot_time_from=t_from,
                slot_time_to=t_to,
            )

        users_qs = filter_active_teachers(models.User.objects.all()).order_by("name")
        if busy_ids:
            users_qs = users_qs.exclude(id__in=busy_ids)
        users_qs = users_qs.values("id", "name", "email")

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(users_qs, request, view=self)
        rows = list(page) if page is not None else []
        return self.ok(rows, **paginator.get_paginated_response())


class LoginView(TokenObtainPairView):
    name = "The login endpoint"
    serializer_class = LoginSerializer
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def post(self, request, *args, **kwargs):
        if request.data.get("email") and request.data.get("password"):
            user: models.User = models.User.objects.filter(
                email=request.data.get("email"),
            ).first()
            is_valid_password = False
            if user:
                is_valid_password = user.check_password(
                    request.data.get("password")
                )
            if user and is_valid_password:
                if not user.is_active:
                    if user.is_waiting_for_activation:
                        return Response({
                            "is_error": True,
                            "message": "awaiting_activation",
                            "details": "Your registration is pending administrator approval. You will receive an email when your account is activated.",
                        }, status=400)
                    return Response({
                        "is_error": True,
                        "message": "inactive_user",
                        "details": "Your account is currently disabled. Please contact your administrator.",
                    },
                        status=400
                    )
                if user.is_password_change_required:
                    return Response(
                        {
                            "is_error": True,
                            "message": "password_change_required",
                            "details": "You are required to change your password before logging in.",
                        },
                        status=400,
                    )
                if user.is_student() and request.tenant.is_student_login_disabled:
                    return Response(
                        {
                            "is_error": True,
                            "message": "student_login_disabled",
                            "details": "Student login is disabled. Please contact your administrator.",
                        },
                        status=400,
                    )

        return super().post(request, *args, **kwargs)


class MSLoginView(TokenObtainPairView):
    name = "the new login method"
    serializer_class = MSLoginSerializer
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"


class TelegramLoginView(APIView):
    name = "Telegram Login Widget sign-in"
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def post(self, request, *args, **kwargs):
        serializer = serializers.TelegramLoginSerializer(
            data=request.data,
            context={"request": request},
        )
        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError as exc:
            return _telegram_auth_validation_response(exc)
        return Response(serializer.validated_data, status=status.HTTP_200_OK)


def _telegram_auth_validation_response(exc: ValidationError) -> Response:
    detail = exc.detail
    if isinstance(detail, dict):
        message = detail.get("message", "")
        if isinstance(message, list):
            message = message[0] if message else ""
        details = detail.get("details", "")
        if isinstance(details, list):
            details = details[0] if details else ""
        return Response(
            {
                "is_error": bool(detail.get("is_error", True)),
                "message": str(message),
                "details": str(details),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    raise exc


class TelegramBotLoginSessionView(APIView):
    name = "Telegram bot login session start"
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def post(self, request, *args, **kwargs):
        serializer = serializers.TelegramBotLoginSessionSerializer(
            data=request.data or {},
            context={"request": request},
        )
        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError as exc:
            return _telegram_auth_validation_response(exc)
        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class TelegramBotLoginVerifyView(APIView):
    name = "Telegram bot login OTP verify"
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def post(self, request, *args, **kwargs):
        serializer = serializers.TelegramBotLoginVerifySerializer(
            data=request.data,
            context={"request": request},
        )
        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError as exc:
            return _telegram_auth_validation_response(exc)
        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class TokenRefreshView(RBACView):
    """Rotate refresh token and issue a new access token."""

    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def post(self, request):
        refresh = request.data.get("refresh")
        session_id = request.data.get("session_id")
        try:
            data = refresh_auth_tokens(refresh, session_id, request)
        except AuthenticationFailed as exc:
            return self.send_response(
                True,
                "invalid_refresh",
                {"details": str(exc.detail)},
                status=401,
            )
        return self.ok(data)


class LogoutView(RBACView):
    """Revoke the current refresh session."""

    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def post(self, request):
        revoked = revoke_refresh_session(
            session_id=request.data.get("session_id"),
            refresh_token=request.data.get("refresh"),
            request=request,
        )
        return self.send_response(
            False,
            "success",
            {"revoked": revoked},
            status=200,
        )


class LogoutAllView(RBACView):
    """Revoke all refresh sessions for the authenticated user in this tenant."""

    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]

    def post(self, request):
        user = models.User.objects.filter(email=request.user.id).first()
        if not user:
            return self.not_found("User not found.")
        count = revoke_all_refresh_sessions_for_user(user, request)
        return self.send_response(
            False,
            "success",
            {"revoked_count": count},
            status=200,
        )


def get_hashed_token(token: str):
    return hashlib.md5(("reset-password" + token).encode()).hexdigest()


class PasswordResetView(RBACView):
    permission_classes = [RBACPermission]
    authentication_classes = []
    rbac_decision = "public"

    def post(self, request):
        # check if token exists
        token: str = request.data.get("token")
        if not token:
            return self.send_response(
                True,
                "missing_token",
                {"details": "Token is required."},
                status=400,
            )
        token: models.VerificationCode = models.VerificationCode.objects.filter(
            token=get_hashed_token(token)
        ).first()
        if token:
            if token.is_used or token.created_at < (
                    datetime.datetime.now(tz=pytz.UTC) - timedelta(minutes=5)
            ):
                return self.not_found("No such token exists.")
            token.is_used = True
            token.save()
            if not request.data.get("password"):
                return self.send_response(
                    True,
                    "missing_password",
                    {"details": "Password is required."},
                    status=400,
                )

            user: models.User = models.User.objects.filter(email=token.email).first()
            if user:
                user.set_password(request.data["password"])
                user.is_password_change_required = False
                user.save()
                revoke_all_refresh_sessions_for_user(user, request)
                tokens = models.VerificationCode.objects.filter(
                    email=user.email, is_used=False
                ).all()
                for i in tokens:
                    i.is_used = True
                models.VerificationCode.objects.bulk_update(tokens, ["is_used"])

                user.send_password_reset_email_notification(request.tenant)
                return self.send_response(
                    False, "success", {"details": "Password reset successfully."}
                )

        return self.send_response(
            True, "not_found", {"details": "No such token exists."}, status=404
        )


class PasswordResetRequestView(RBACView):
    permission_classes = [RBACPermission]
    authentication_classes = []
    rbac_decision = "public"

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        if not email:
            return self.send_response(
                True,
                "missing_email",
                {"details": "Email is required."},
                status=400,
            )
        allowed, retry = _check_rate_limit(
            "pwd_reset_req",
            email,
            PASSWORD_RESET_REQUEST_LIMIT,
            PASSWORD_RESET_REQUEST_WINDOW,
        )
        if not allowed:
            return self.send_response(
                True,
                "rate_limited",
                {
                    "details": f"Too many requests. Try again in {retry} seconds.",
                    "retry_after_seconds": retry,
                },
                status=429,
            )
        user: models.User = models.User.objects.filter(email=email).first()

        if user:
            t = uuid4()
            token = models.VerificationCode(
                email=user.email, token=get_hashed_token(str(t))
            )
            token.save()
            user.send_password_reset_token_email(request.tenant, str(t))
        return self.send_response(False, "success", {"details": "Token sent."})


class VisibilityListView(RBACListView):
    model = models.Visibility
    serializer = serializers.VisibilitySerializer
    required_permissions = {"GET": "visibility.manage", "POST": "visibility.manage"}


class VisibilityDetailsView(RBACDetailsView):
    model = models.Visibility
    serializer = serializers.VisibilitySerializer
    required_permissions = {
        "GET": "visibility.manage",
        "PUT": "visibility.manage",
        "PATCH": "visibility.manage",
        "DELETE": "visibility.manage",
    }


class VisibilitySearchView(RBACSearchView):
    model = models.Visibility
    serializer = serializers.VisibilitySerializer
    required_permissions = {"POST": "visibility.manage"}


class DataVerificationRequestListView(RBACListView):
    model = models.DataVerificationRequest
    serializer = serializers.DataVerificationRequestSerializer
    required_permissions = {"GET": "verification.view", "POST": "verification.process"}


class DataVerificationRequestDetailsView(RBACDetailsView):
    model = models.DataVerificationRequest
    serializer = serializers.DataVerificationRequestSerializer
    required_permissions = {
        "GET": "verification.view",
        "PUT": "verification.process",
        "PATCH": "verification.process",
        "DELETE": "verification.process",
    }


class DataVerificationRequestSearchView(RBACSearchView):
    model = models.DataVerificationRequest
    serializer = serializers.DataVerificationRequestSerializer
    required_permissions = {"POST": "verification.view"}


class UserDataVerificationRequestListView(RBACListView):
    model = models.UserDataVerificationRequest
    serializer = serializers.UserDataVerificationRequestSerializer
    required_permissions = {"GET": "verification.view", "POST": "verification.process"}


class UserDataVerificationRequestDetailsView(RBACDetailsView):
    model = models.UserDataVerificationRequest
    serializer = serializers.UserDataVerificationRequestSerializer
    required_permissions = {
        "GET": "verification.view",
        "PUT": "verification.process",
        "PATCH": "verification.process",
        "DELETE": "verification.process",
    }


class UserDataVerificationRequestSearchView(RBACSearchView):
    model = models.UserDataVerificationRequest
    serializer = serializers.UserDataVerificationRequestSerializer
    required_permissions = {"POST": "verification.view"}


class OauthPasswordResetView(RBACView):
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]
    required_permissions = {"POST": "user.update"}

    def post(self, request):
        if not request.tenant.is_microsoft_on:
            return self.send_response(
                True,
                "not_supported",
                {"details": "This endpoint is only supported for Microsoft tenants."},
                status=400,
            )
        if request.data.get("email"):
            email = request.data.get("email")
            local_user = models.User.objects.filter(email=email).first()
            if not local_user:
                return self.not_found("No user found with the provided email.")
            ms_user = MSUser(request.tenant)
            x = ms_user.reset_password(local_user.microsoft_id, request.tenant)
            return self.send_response(
                False, "success", {"details": "Password reset successfully."}
            )
        return self.send_response(True,
                                  "missing_emails",
                                  {"details": "Email is required."},
                                  status=400)


# Rate limits for verification endpoints (prevents brute force and enumeration)
VERIFICATION_REQUEST_LIMIT_EMAIL = 3
VERIFICATION_REQUEST_WINDOW_EMAIL = 3600  # 1 hour
VERIFICATION_VALIDATE_LIMIT = 5
VERIFICATION_VALIDATE_WINDOW = 900  # 15 min
VERIFICATION_CODE_TTL_HOURS = 2
SEARCH_USER_BY_EMAIL_LIMIT = 20
SEARCH_USER_BY_EMAIL_WINDOW = 3600  # 1 hour
PASSWORD_RESET_REQUEST_LIMIT = 1
PASSWORD_RESET_REQUEST_WINDOW = 30  # 30 seconds between requests per email


def _check_rate_limit(key_prefix: str, identifier: str, limit: int, window: int):
    """Return (allowed: bool, retry_after_seconds: int)."""
    key = f"{key_prefix}:{identifier}"
    now = int(time.time())
    window_start = now - window
    existing = cache.get(key) or []
    existing = [t for t in existing if t > window_start]
    if len(existing) >= limit:
        retry_after = int(existing[0]) + window - now
        return False, max(1, retry_after)
    existing.append(now)
    cache.set(key, existing, timeout=window + 60)
    return True, 0


def generate_and_send_verification_code(email: str, tenant, source=None):
    from app_microsoft.email_templates import build_subject, render_email, tenant_label

    code = generate_verification_code()
    verification_code = models.VerificationCode(
        email=email,
        digit_code=code,
        source=source or models.VerificationCode.Source.EMAIL_VERIFICATION,
    )
    verification_code.save()
    subject = build_subject(tenant, "OTP code")
    body = render_email(
        tenant=tenant,
        heading=f"Your verification code for {tenant_label(tenant) or 'Schedjuice'}",
        intro_html="Enter this code to verify your account. It expires in 2 hours.",
        code=code,
        preheader=f"Your code is {code}, expires in 2 hours.",
    )
    send_mail(tenant, subject, body, email)


class VerificationCodeRequestView(RBACView):
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def post(self, request):
        email = request.data.get("email")
        source = request.data.get("source")

        if not email or not source:
            return self.send_response(
                True,
                "missing_email",
                {"details": "Email and source are required."},
                status=400,
            )
        if source == models.VerificationCode.Source.EMAIL_VERIFICATION:
            allowed, retry = _check_rate_limit(
                "vc_req_email", email, VERIFICATION_REQUEST_LIMIT_EMAIL, VERIFICATION_REQUEST_WINDOW_EMAIL
            )
            if not allowed:
                return self.send_response(
                    True,
                    "rate_limited",
                    {"details": f"Too many requests. Try again in {retry} seconds."},
                    status=429,
                )
            generate_and_send_verification_code(email, request.tenant)
            return self.send_response(
                False, "success", {"details": "Verification code sent."}
            )

        return self.send_response(
            True,
            "invalid_source",
            {"details": "Unsupported verification source."},
            status=400,
        )


class SearchUserByEmailView(RBACView):
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def get(self, request, email: str):
        client_ip = (
            request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
            or request.META.get("REMOTE_ADDR", "")
            or "unknown"
        )
        allowed, retry = _check_rate_limit(
            "search_user_email",
            f"{client_ip}:{email.lower()}",
            SEARCH_USER_BY_EMAIL_LIMIT,
            SEARCH_USER_BY_EMAIL_WINDOW,
        )
        if not allowed:
            return self.send_response(
                True,
                "rate_limited",
                {"details": f"Too many attempts. Try again in {retry} seconds."},
                status=429,
            )
        user: models.User = models.User.objects.filter(
            email__iexact=email.strip()
        ).first()
        if not user:
            return self.send_response(
                False,
                "not_found",
                {"details": "No user found with the provided email."},
                status=200,
            )
        if not user.is_active and user.is_waiting_for_activation:
            return self.send_response(
                False,
                "pending_activation",
                {
                    "details": "An account with this email is awaiting administrator approval."
                },
                status=202,
            )
        return self.send_response(
            False,
            "found",
            {}, status=201
        )


class VerificationCodeValidateView(RBACView):
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def post(self, request):
        email = request.data.get("email")
        code = request.data.get("code")

        if not email or not code:
            return self.send_response(
                True,
                "missing_parameters",
                {"details": "Email and code are required."},
                status=400,
            )

        # Rate limit validate attempts (prevents OTP brute force)
        allowed, retry = _check_rate_limit(
            "vc_validate", email, VERIFICATION_VALIDATE_LIMIT, VERIFICATION_VALIDATE_WINDOW
        )
        if not allowed:
            return self.send_response(
                True,
                "rate_limited",
                {"details": f"Too many attempts. Try again in {retry} seconds."},
                status=429,
            )

        verification_code: models.VerificationCode = models.VerificationCode.objects.filter(
            email=email,
            digit_code=code,
            is_used=False,
            created_at__gte=datetime.datetime.now(tz=pytz.UTC)
            - timedelta(hours=VERIFICATION_CODE_TTL_HOURS),
        ).first()

        if not verification_code:
            return self.send_response(
                True,
                "invalid_code",
                {"details": "The provided code is invalid or has expired."},
                status=400,
            )

        verification_code.is_used = True
        verification_code.save()

        return self.send_response(
            False,
            "success",
            {"details": "Verification successful."}
        )


class RegistrationFormConfigView(RBACView):
    """Public form-config for student self-registration (no auth)."""

    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def get(self, request):
        if request.tenant.is_student_login_disabled:
            return self.send_response(
                True,
                "self_registration_disabled",
                {"details": "Student self-registration is disabled."},
                status=400,
            )
        return self.ok(build_registration_form_config())


class StudentSelfRegisterView(RBACView):
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def post(self, request):
        if request.tenant.is_student_login_disabled:
            return self.send_response(
                True,
                "self_registration_disabled",
                {"details": "Student self-registration is disabled."},
                status=400,
            )
        course_id = request.data.get("course_id", None)

        email = (request.data.get("email") or "").strip()
        if not assert_recent_email_verification(email):
            return self.send_response(
                True,
                "email_not_verified",
                {"details": "Email verification is required before registration."},
                status=400,
            )

        user = serializers.UserSerializer(
            data=request.data,
            context={"request": request, "registration_stage": True},
        )
        if user.is_valid():
            if course_id is not None:
                if not Course.objects.filter(id=course_id).exists():
                    return self.send_response(
                        True,
                        "invalid_course",
                        {"details": {"course_id": "Course not found."}},
                        status=400,
                    )
            user.save()
            db_user = models.User.objects.get(email=user.data["email"])
            db_user.is_active = False
            db_user.is_waiting_for_activation = True
            db_user.is_password_change_required = False
            db_user.roles = [models.User.UserRole.STUDENT]
            db_user.is_staff = False
            db_user.save()
            if course_id is not None:
                CourseJoinRequest.objects.get_or_create(
                    course_id=course_id,
                    user_id=db_user.id,
                    status=CourseJoinRequest.Status.PENDING,
                    defaults={},
                )

            return self.send_response(
                False,
                "success",
                {"details": "User registered successfully."},
                status=200,
            )
        return self.send_response(
            True,
            "invalid_data",
            {"details": user.errors},
            status=400,
        )


class StudentActivationView(RBACView):
    required_permissions = {"GET": "user.create"}

    def get(self, request, user_id: str):
        user = models.User.objects.filter(id=user_id).first()
        if not user:
            return self.send_response(True, "not_found", {"details": "User not found."}, status=404)
        from app_course.join_request_approval import (
            approve_all_pending_join_requests_for_user,
        )
        from app_course.models import CourseJoinRequest

        if user.is_active and not CourseJoinRequest.objects.filter(
            user_id=user.id, status=CourseJoinRequest.Status.PENDING
        ).exists():
            return self.send_response(
                False, "success", {"details": "User already active."}, status=200
            )

        actor = models.User.get_user_from_request(request)
        approve_all_pending_join_requests_for_user(
            user,
            actor=actor,
            tenant=request.tenant,
            send_activation_email=True,
        )
        return self.send_response(
            False,
            "success",
            {"details": "User activated successfully."},
            status=200,
        )


class UserResendWelcomeEmailView(RBACView):
    required_permissions = {"POST": "user.update"}

    def post(self, request, user_id: int):
        user = models.User.objects.filter(id=user_id).first()
        if not user:
            return self.not_found("User not found.")
        actor = acting_user(request)
        if actor is None:
            return self.forbidden("Authentication required.")
        check_user_write(actor, user)

        if not (user.communication_email or "").strip():
            return self.send_response(
                True,
                "missing_communication_email",
                {"details": "User has no communication email."},
                status=400,
            )

        try:
            result = resend_welcome_email(user, request.tenant)
        except ValueError as exc:
            return self.send_response(
                True,
                "invalid_request",
                {"details": str(exc)},
                status=400,
            )

        status_code = result.get("mail_status_code")
        if status_code is None or not (199 < status_code < 300):
            return self.send_response(
                True,
                "mail_send_failed",
                {
                    "details": "Welcome email could not be sent.",
                    **result,
                },
                status=502,
            )

        return self.send_response(
            False,
            "success",
            {"details": "Welcome email sent.", **result},
            status=200,
        )


class UserResignView(RBACView):
    """POST users/<id>/resign — record resignation metadata and disable the account."""

    required_permissions = {"POST": "user.update"}

    def post(self, request, user_id: int):
        user = models.User.objects.filter(id=user_id).first()
        if not user:
            return self.not_found("User not found.")
        actor = acting_user(request)
        if actor is None:
            return self.forbidden("Authentication required.")
        check_user_write(actor, user)

        from app_auth.user_query_helpers import user_has_manager_or_above

        if not user_has_manager_or_above(actor):
            return self.send_response(
                True,
                "forbidden",
                {
                    "details": "Only managers and above can mark accounts as resigned.",
                },
                status=403,
            )
        if user.is_student():
            return self.send_response(
                True,
                "forbidden",
                {
                    "details": "Cannot mark student-only accounts as resigned.",
                },
                status=403,
            )

        serializer = serializers.UserResignSerializer(data=request.data)
        if not serializer.is_valid():
            return self.send_response(
                True,
                "validation_error",
                {"details": serializer.errors},
                status=400,
            )

        data = serializer.validated_data
        with transaction.atomic():
            user.resignation_inform_date = data.get("inform_date")
            user.resignation_last_working_date = data["last_working_date"]
            user.resignation_type_of_pay = data.get("type_of_pay")
            user.resignation_employment_type = data.get("employment_type")
            user.resignation_remark = data.get("remark") or None
            user.resigned_at = timezone.now()
            user.is_active = False
            user.save(
                update_fields=[
                    "resignation_inform_date",
                    "resignation_last_working_date",
                    "resignation_type_of_pay",
                    "resignation_employment_type",
                    "resignation_remark",
                    "resigned_at",
                    "is_active",
                ]
            )

        return self.ok(UserSerializer(user).data)


class UserCreateMicrosoftAccountView(RBACView):
    """POST users/<id>/create-microsoft-account — provision MS account for a null-id user."""

    model = models.User
    serializer = serializers.UserSerializer
    required_permissions = {"POST": "user.update"}

    def post(self, request, user_id: int):
        from app_microsoft.flows import MicrosoftAlreadyExistsError
        from app_microsoft.provisioning import (
            assign_license_to_user,
            evaluate_user_candidate,
            provision_user_account,
            REPAIRABLE_STATUSES,
        )
        from rest_framework.exceptions import ValidationError as DRFValidationError

        user = models.User.objects.filter(id=user_id).first()
        if not user:
            return self.not_found("User not found.")
        actor = acting_user(request)
        if actor is None:
            return self.forbidden("Authentication required.")
        check_user_write(actor, user)
        if not request.tenant.is_microsoft_on:
            return self.bad_request(
                "Microsoft integration is not enabled for this organization."
            )
        allow_unlicensed = bool((request.data or {}).get("allow_unlicensed"))

        if user.microsoft_id:
            if not getattr(user, "microsoft_license_assigned", True) and not allow_unlicensed:
                try:
                    assign_license_to_user(user, request.tenant)
                except MicrosoftAlreadyExistsError as exc:
                    return self.send_response(
                        True,
                        "ms_conflict",
                        {"details": exc.detail},
                        status=status.HTTP_409_CONFLICT,
                    )
                except DRFValidationError as exc:
                    return self.send_response(
                        True,
                        "ms_error",
                        {"details": exc.detail},
                        status=status.HTTP_502_BAD_GATEWAY,
                    )
                user.refresh_from_db()
                return self.ok(self.get_serializer(user).data, message="licensed")
            return self.ok(
                self.get_serializer(user).data,
                message="already_linked",
            )

        evaluation = evaluate_user_candidate(user, request.tenant)
        if evaluation["status"] not in REPAIRABLE_STATUSES:
            if not (allow_unlicensed and evaluation["status"] == "missing_license"):
                return self.bad_request(evaluation["detail"])

        try:
            provision_user_account(
                user, request.tenant, assign_license=not allow_unlicensed
            )
        except MicrosoftAlreadyExistsError as exc:
            return self.send_response(
                True,
                "ms_conflict",
                {"details": exc.detail},
                status=status.HTTP_409_CONFLICT,
            )
        except DRFValidationError as exc:
            return self.send_response(
                True,
                "ms_error",
                {"details": exc.detail},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        user.refresh_from_db()
        return self.ok(self.get_serializer(user).data, message="created")


class UserLinkMicrosoftAccountView(RBACView):
    """POST users/<id>/link-microsoft-account {identifier} — link existing MS account."""

    model = models.User
    serializer = serializers.UserSerializer
    required_permissions = {"POST": "user.update"}

    def post(self, request, user_id: int):
        from app_microsoft.provisioning import link_user_account

        if not request.tenant.is_microsoft_on:
            return self.bad_request(
                "Microsoft integration is not enabled for this organization."
            )
        user = models.User.objects.filter(id=user_id).first()
        if not user:
            return self.not_found("User not found.")
        actor = acting_user(request)
        if actor is None:
            return self.forbidden("Authentication required.")
        check_user_write(actor, user)

        identifier = (request.data or {}).get("identifier") or (request.data or {}).get(
            "microsoft_id"
        )
        try:
            link_user_account(user, request.tenant, identifier)
        except ValueError as exc:
            return self.bad_request(str(exc))
        except Exception as exc:  # noqa: BLE001
            return self.send_response(
                True,
                "ms_error",
                {"details": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        user.refresh_from_db()
        return self.ok(self.get_serializer(user).data, message="linked")


class UserMicrosoftSuggestionsView(RBACView):
    """GET users/<id>/microsoft-suggestions?q= — suggest linkable MS accounts."""

    model = models.User
    serializer = serializers.UserSerializer
    required_permissions = {"GET": "user.update"}

    def get(self, request, user_id: int):
        from app_microsoft.provisioning import suggest_microsoft_matches

        if not request.tenant.is_microsoft_on:
            return self.bad_request(
                "Microsoft integration is not enabled for this organization."
            )
        user = models.User.objects.filter(id=user_id).first()
        if not user:
            return self.not_found("User not found.")
        actor = acting_user(request)
        if actor is None:
            return self.forbidden("Authentication required.")
        check_user_write(actor, user)

        query = (request.query_params.get("q") or "").strip() or None
        try:
            suggestions = suggest_microsoft_matches(user, request.tenant, query)
        except ValueError as exc:
            return self.bad_request(str(exc))
        except Exception as exc:  # noqa: BLE001
            return self.send_response(
                True,
                "ms_error",
                {"details": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return self.ok(suggestions, message="ok")


class UserTelegramLinkTokenView(RBACView):
    """POST users/<id>/telegram-link-token — issue binding deep link for target user."""

    model = models.User
    serializer = serializers.UserSerializer
    required_permissions = {"POST": "telegram.link_on_behalf"}

    def post(self, request, user_id: int):
        from app_telegram.binding import issue_link_token

        org = request.tenant
        if not org.telegram_bot_username:
            return self.bad_request("Telegram is not configured for this school.")
        user = models.User.objects.filter(id=user_id).first()
        if not user:
            return self.not_found("User not found.")
        if user.telegram_user_id:
            return self.bad_request("This user already has Telegram linked.")
        deep_link = issue_link_token(user, org.telegram_bot_username)
        return Response({"deep_link": deep_link}, status=status.HTTP_200_OK)


class UserUnlinkTelegramView(RBACView):
    """POST users/<id>/unlink-telegram — clear target user's Telegram binding."""

    model = models.User
    serializer = serializers.UserSerializer
    required_permissions = {"POST": "telegram.link_on_behalf"}

    def post(self, request, user_id: int):
        from app_telegram.binding import clear_user_telegram_binding

        user = models.User.objects.filter(id=user_id).first()
        if not user:
            return self.not_found("User not found.")
        if not user.telegram_user_id:
            return self.bad_request("This user does not have Telegram linked.")
        clear_user_telegram_binding(user)
        return Response({"ok": True, "message": ""}, status=status.HTTP_200_OK)


class UserUnlinkGoogleView(RBACView):
    """POST users/<id>/unlink-google — clear target user's Google binding."""

    model = models.User
    serializer = serializers.UserSerializer
    required_permissions = {"POST": "google.link_on_behalf"}

    def post(self, request, user_id: int):
        from app_google.linking import clear_google_binding

        user = models.User.objects.filter(id=user_id).first()
        if not user:
            return self.not_found("User not found.")
        if not user.google_id:
            return self.bad_request("This user does not have Google linked.")
        clear_google_binding(user)
        return Response({"ok": True, "message": ""}, status=status.HTTP_200_OK)


class UserAssignRoleBulkView(RBACView):
    """POST /users/assign-role-bulk — add one role to many users."""

    name = "User assign role bulk view"
    rbac_decision = "authenticated_only"
    MAX_USER_IDS = 100

    def post(self, request):
        actor = acting_user(request)
        if actor is None:
            return self.forbidden("Authentication required.")

        held = effective_permissions(actor)
        if "user.assign_roles" not in held and "rbac.manage" not in held:
            return self.forbidden("You don't have permission to assign roles.")

        role_slug = request.data.get("role_slug")
        raw_ids = request.data.get("user_ids")
        if not isinstance(role_slug, str) or not role_slug.strip():
            return self.bad_request("role_slug is required.")
        role_slug = role_slug.strip()

        if not isinstance(raw_ids, list) or len(raw_ids) == 0:
            return self.bad_request("user_ids must be a non-empty array.")

        try:
            user_ids = list(dict.fromkeys(int(i) for i in raw_ids))
        except (TypeError, ValueError):
            return self.bad_request("user_ids must contain integers.")

        if len(user_ids) > self.MAX_USER_IDS:
            return self.bad_request(f"At most {self.MAX_USER_IDS} users per request.")

        is_system = role_slug in SYSTEM_ROLE_VALUES
        if is_system:
            if "user.assign_roles" not in held:
                return self.forbidden("You don't have permission to assign roles.")
        elif "rbac.manage" not in held:
            return self.forbidden(
                "Cannot assign custom roles without rbac.manage permission."
            )

        updated = []
        skipped = []
        failed = []

        for user_id in user_ids:
            user = models.User.objects.filter(id=user_id).first()
            if user is None:
                failed.append({"id": user_id, "reason": "not_found"})
                continue
            if role_slug in (user.roles or []):
                skipped.append({"id": user_id, "reason": "already_assigned"})
                continue
            if user.is_student():
                failed.append({"id": user_id, "reason": "student_only"})
                continue

            merged = merge_role_add(user.roles, role_slug)
            try:
                validate_grantable_roles(
                    actor, merged, request.tenant, previous_roles=user.roles
                )
                check_user_write(actor, user)
            except ValidationError as exc:
                detail = exc.detail
                reason = detail[0] if isinstance(detail, list) else str(detail)
                failed.append({"id": user_id, "reason": str(reason)})
                continue
            except PermissionDenied:
                failed.append({"id": user_id, "reason": "forbidden"})
                continue

            user.roles = merged
            user.save(update_fields=["roles"])
            schema = getattr(connection, "schema_name", None) or "public"
            broadcast_rbac_updated_to_user(schema, user.id)
            updated.append({"id": user.id, "name": user.name})

        payload = {"updated": updated, "skipped": skipped, "failed": failed}
        if not updated and not skipped:
            return self.send_response(
                True,
                "bad_request",
                {"data": payload, "details": "No users were updated."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return self.ok(payload)


class UserResolveBulkView(RBACView):
    """POST /users/resolve-bulk — bulk email lookup for Import Wizard."""

    name = "User bulk resolve view"
    required_permissions = {"POST": "user.import"}

    def post(self, request):
        from app_auth.import_resolve import resolve_users_by_email

        emails = request.data.get("emails") or []
        emails = [str(e) for e in emails if isinstance(e, str)]
        return self.ok(resolve_users_by_email(emails))


class UserMatchBulkView(RBACView):
    """POST /users/match-bulk — multi-column existing-user matching for Import Wizard."""

    name = "User bulk match view"
    required_permissions = {"POST": "user.import"}

    def post(self, request):
        from app_auth.import_user_match import match_users

        raw_specs = request.data.get("specs") or []
        specs = []
        for spec in raw_specs:
            if not isinstance(spec, dict):
                continue
            spec_type = spec.get("type")
            if spec_type not in ("email", "phone"):
                continue
            values = [
                str(v) for v in (spec.get("values") or []) if isinstance(v, str)
            ]
            specs.append(
                {
                    "key": str(spec.get("key") or spec_type),
                    "type": spec_type,
                    "fuzzy": bool(spec.get("fuzzy")),
                    "values": values,
                }
            )
        return self.ok({"results": match_users(specs)})


class PublicProfileView(RBACView):
    """Public staff profile — no authentication required."""

    name = "Public profile view"
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def get(self, request, slug: str):
        from app_auth.qualifications_media import resolve_qualifications_media_urls
        from app_auth.staff_helpers import STAFF_ROLES, staff_role_label, user_is_staff
        from schedjuice_backend.storages import PrivateMediaStorage

        user = models.User.objects.filter(
            public_profile_slug=slug,
            is_public_profile_enabled=True,
            roles__overlap=list(STAFF_ROLES),
        ).first()
        if user is None or not user_is_staff(user):
            return self.not_found("Profile not found.")

        storage = PrivateMediaStorage()
        profile_image_url = None
        if user.profile_image:
            try:
                profile_image_url = storage.url(user.profile_image.name, expire=3600)
            except Exception:
                profile_image_url = None

        certifications = []
        if user.show_certifications_on_public_profile:
            for cert in user.certifications.select_related("attachment").all():
                file_url = None
                file_filename = None
                if cert.attachment and cert.attachment.data:
                    file_filename = cert.attachment.filename
                    try:
                        file_url = storage.url(cert.attachment.data.name, expire=3600)
                    except Exception:
                        file_url = None
                certifications.append(
                    {
                        "title": cert.title,
                        "issuing_organization": cert.issuing_organization,
                        "issued_on": cert.issued_on,
                        "expires_on": cert.expires_on,
                        "file_url": file_url,
                        "file_filename": file_filename,
                    }
                )

        payload = {
            "name": user.name,
            "role_label": staff_role_label(user),
            "qualifications": resolve_qualifications_media_urls(user.qualifications),
            "profile_image_url": profile_image_url,
            "certifications": certifications,
        }
        serializer = serializers.PublicProfileSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        response = self.ok(serializer.data)
        response["Cache-Control"] = "public, max-age=0, must-revalidate"
        return response


class PublicIdVerifyView(RBACView):
    """Public ID-card verify — resolves a short code or signed JWT to minimal identity."""

    name = "Public ID verify view"
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def _verified_identity_payload(self, request, user):
        def _signed(image_field):
            if not image_field:
                return None
            try:
                return image_field.url
            except Exception:
                return None

        return {
            "verified": True,
            "user_id": user.pk,
            "name": user.name,
            "roles": user.roles,
            "id_photo_url": _signed(user.id_photo) or _signed(user.profile_image),
            "org_name": request.tenant.id_card_org_name or request.tenant.name,
            "public_profile_slug": user.public_profile_slug,
        }

    def get(self, request, token: str):
        from app_auth.id_card_tokens import InvalidIdVerifyToken, decode_id_verify_token
        from app_auth.id_verify_code import is_id_verify_code

        if is_id_verify_code(token):
            user = models.User.objects.filter(
                id_verify_code=token,
                is_active=True,
            ).first()
            if user is None:
                return self.bad_request("This badge could not be verified.")
            return self.ok(data=self._verified_identity_payload(request, user))

        try:
            payload = decode_id_verify_token(token)
        except InvalidIdVerifyToken:
            return self.bad_request("This badge could not be verified.")

        if payload.get("schema") != request.tenant.schema_name:
            return self.bad_request("This badge could not be verified.")

        connection.set_schema(payload["schema"])
        user = models.User.objects.filter(pk=payload["uid"]).first()
        if user is None or user.is_active is False:
            return self.not_found("This badge could not be verified.")

        return self.ok(data=self._verified_identity_payload(request, user))

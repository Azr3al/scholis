import requests
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from jsonschema import validate
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from app_auth.refresh_sessions import create_refresh_session, revoke_all_refresh_sessions_for_user

from app_auth.id_photo_thumbs import sync_id_photo_thumb
from app_auth.models import (
    DataVerificationRequest,
    User,
    UserDataVerificationRequest,
    Visibility,
)
from app_course.models import Category, Program
from app_custom_fields.constants import ENTITY_TYPE_USER
from app_custom_fields.validation import (
    active_definitions_qs,
    prime_representation_keys_from_definitions,
    representation_custom_data,
    validate_user_custom_data_for_write,
)
from app_auth.public_profile_helpers import (
    ensure_public_profile_slug,
    should_assign_public_profile_slug,
    validate_qualifications_size,
)
from app_auth.welcome_email_helpers import should_send_welcome_email
from app_auth.staff_helpers import user_is_staff
from app_auth.jwt_token_helpers import reissue_tokens_with_tenant_claim
from app_auth.microsoft_display_name import resolve_microsoft_display_name
from app_course.course_scoping import acting_user
from app_microsoft.flows import CreateUserFlow
from app_microsoft.oauth import connect_personal_teams_from_login_token
from app_reports.models import Log
from datetime import date, timedelta

from django.utils import timezone
from tenant_schemas.utils import schema_context
from app_auth.dvr import (
    dvr_verify_allow_user_admin_keys,
    normalize_dvr_fields,
    user_missing_required_fields,
    users_matching_roles,
    validate_dvr_fields,
)
from django_q.tasks import async_task
from utilitas.serializers import BaseModelSerializer

visibility_settings_schema = {}

HR_FIELD_NAMES = (
    "contract_expiry_date",
    "probation_end_date",
    "employment_start_date",
    "employment_type",
)


def _actor_can_view_hr_fields(actor, tenant) -> bool:
    if not actor or not tenant or not getattr(tenant, "is_hr_fields_enabled", False):
        return False
    return bool(
        {User.UserRole.SUPERADMIN, User.UserRole.ADMIN}.intersection(
            getattr(actor, "roles", None) or []
        )
    )


def _redact_hr_fields(payload: dict) -> None:
    for key in HR_FIELD_NAMES:
        payload.pop(key, None)


class ExpoTokenSerializer(serializers.Serializer):
    """Serializer for Expo push token registration."""

    push_token = serializers.CharField(max_length=4096, required=True)
    lang = serializers.CharField(max_length=5, required=False, allow_blank=True)

    def validate_push_token(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("push_token cannot be empty.")
        if not value.startswith("ExponentPushToken[") and not value.startswith(
            "ExpoPushToken["
        ):
            raise serializers.ValidationError(
                "push_token must be a valid Expo push token (ExponentPushToken[...] or ExpoPushToken[...])."
            )
        return value.strip()


class WebPushSubscriptionSerializer(serializers.Serializer):
    """Serializer for web push subscription registration/upsert."""

    endpoint = serializers.URLField(max_length=512, required=True)
    keys = serializers.DictField(required=True)
    user_agent = serializers.CharField(max_length=512, required=False, allow_blank=True)

    def validate_endpoint(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("endpoint cannot be empty.")
        return value.strip()

    def validate_keys(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("keys must be a dictionary.")

        p256dh = value.get("p256dh")
        auth = value.get("auth")

        if not p256dh or not p256dh.strip():
            raise serializers.ValidationError("keys.p256dh cannot be empty.")
        if not auth or not auth.strip():
            raise serializers.ValidationError("keys.auth cannot be empty.")

        return value


class WebPushSubscriptionDeactivateSerializer(serializers.Serializer):
    """Serializer for web push subscription deactivation."""

    endpoint = serializers.URLField(max_length=512, required=True)

    def validate_endpoint(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("endpoint cannot be empty.")
        return value.strip()


def set_settings_to_users(role, id: int, include_delete_step=False):
    if include_delete_step:
        users = User.objects.filter(visibility_id=id)
        for i in users:
            i.visibility_id = None
        User.objects.bulk_update(users, ["visibility_id"])

    users = User.objects.filter(roles__contains=[role])
    for i in users:
        if i.get_sorted_roles().index(role) == 0:
            i.visibility_id = id

    User.objects.bulk_update(users, ["visibility_id"])


class VisibilitySerializer(BaseModelSerializer):
    class Meta:
        model = Visibility
        fields = "__all__"
        expandable_fields = {
            "users": ("app_auth.serializers.UserSerializer", {"many": True}),
            "created_by": ("app_auth.serializers.UserSerializer"),
        }
        extra_kwargs = {
            "created_by": {"required": False},
        }

    def validate(self, attrs):
        if attrs.get("settings"):
            validate(attrs.get("settings"), visibility_settings_schema)
        return attrs

    def create(self, validated_data):
        validated_data["created_by"] = User.objects.filter(
            email=self.context.get(
                "request",
            ).user.id
        ).first()
        x = super().create(validated_data)
        set_settings_to_users(x.role, x.id)
        return x

    def update(self, instance, validated_data):
        x = super().update(instance, validated_data)
        set_settings_to_users(x.role, x.id, True)
        return x


class PublicCertificationSerializer(serializers.Serializer):
    title = serializers.CharField()
    issuing_organization = serializers.CharField()
    issued_on = serializers.DateField()
    expires_on = serializers.DateField(allow_null=True)
    file_url = serializers.CharField(allow_null=True, allow_blank=True)
    file_filename = serializers.CharField(allow_null=True, allow_blank=True)


class PublicProfileSerializer(serializers.Serializer):
    name = serializers.CharField()
    role_label = serializers.CharField()
    qualifications = serializers.JSONField(allow_null=True)
    profile_image_url = serializers.CharField(allow_null=True, allow_blank=True)
    certifications = PublicCertificationSerializer(many=True, required=False)


class UserSearchSerializer(BaseModelSerializer):
    """Lightweight serializer for User Hub list/search."""

    class Meta:
        model = User
        fields = (
            "id",
            "name",
            "alternative_name",
            "email",
            "phone_number",
            "roles",
            "is_active",
            "profile_image",
            "profile_completeness",
            "created_at",
            "microsoft_id",
            "per_hour_rate",
            "student_bonus_hourly_rate",
            "per_session_rate",
        )


class UserSerializer(BaseModelSerializer):
    # Admin-only opt-out: when False (and requester is superadmin/admin), the local
    # user is created without a Microsoft account. Defaults True; lower roles cannot
    # disable it. Not a model field, so it is popped before model create.
    create_microsoft_account = serializers.BooleanField(
        write_only=True, required=False, default=True
    )
    allow_unlicensed_microsoft_account = serializers.BooleanField(
        write_only=True, required=False, default=False
    )
    confirm_password = serializers.CharField(
        write_only=True, required=False, allow_blank=True
    )
    id_photo_url = serializers.SerializerMethodField(read_only=True)
    profile_image_url = serializers.SerializerMethodField(read_only=True)
    user_signature_url = serializers.SerializerMethodField(read_only=True)
    id_verify_token = serializers.SerializerMethodField(read_only=True)
    id_verify_code = serializers.SerializerMethodField(read_only=True)
    id_card_class_display = serializers.SerializerMethodField(read_only=True)
    id_card_expiry_display = serializers.SerializerMethodField(read_only=True)
    roles = serializers.ListField(
        child=serializers.CharField(max_length=128),
        required=False,
    )
    scoped_program_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Program.objects.all(),
        source="scoped_programs",
        required=False,
    )
    scoped_category_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Category.objects.all(),
        source="scoped_categories",
        required=False,
    )
    telegram_user_id = serializers.IntegerField(read_only=True)
    telegram_chat_id = serializers.IntegerField(read_only=True)
    telegram_username = serializers.CharField(read_only=True)
    telegram_linked_at = serializers.DateTimeField(read_only=True)
    google_id = serializers.CharField(read_only=True)
    google_linked_at = serializers.DateTimeField(read_only=True)
    user_write_mode = serializers.SerializerMethodField()
    writable_fields = serializers.SerializerMethodField()

    def _signed_url(self, image_field):
        if not image_field:
            return None
        try:
            return image_field.url
        except Exception:
            return None

    def get_id_photo_url(self, obj):
        return self._signed_url(obj.id_photo)

    def get_profile_image_url(self, obj):
        return self._signed_url(obj.profile_image)

    def get_user_signature_url(self, obj):
        return self._signed_url(obj.user_signature)

    def get_id_verify_token(self, obj):
        from django.db import connection

        from app_auth.id_card_tokens import encode_id_verify_token

        if not obj.pk:
            return None
        return encode_id_verify_token(uid=obj.pk, schema=connection.schema_name)

    def get_id_verify_code(self, obj):
        from app_auth.id_verify_code import ensure_id_verify_code

        if not obj.pk:
            return None
        return ensure_id_verify_code(obj)

    def get_id_card_class_display(self, obj):
        if self.context.get("omit_nested_user_scopes"):
            return obj.id_card_class_name or None
        # Class resolution only applies to student enrollments — skip the course
        # queries for staff-only accounts (common on DVR / self-edit PUT).
        roles = set(getattr(obj, "roles", None) or [])
        if User.UserRole.STUDENT not in roles:
            return obj.id_card_class_name or None
        request = self.context.get("request")
        cache = getattr(request, "_id_card_class_names", None) if request else None
        if isinstance(cache, dict) and obj.pk in cache:
            return cache[obj.pk]
        from app_auth.id_card_class import resolve_id_card_class_name

        return resolve_id_card_class_name(obj)

    def get_id_card_expiry_display(self, obj):
        roles = set(getattr(obj, "roles", None) or [])
        if User.UserRole.STUDENT not in roles:
            return None
        request = self.context.get("request")
        cache = getattr(request, "_id_card_expiry_dates", None) if request else None
        if isinstance(cache, dict) and obj.pk in cache:
            return cache[obj.pk]
        from app_auth.id_card_expiry import resolve_id_card_expiry_date

        tenant = getattr(request, "tenant", None) if request else None
        return resolve_id_card_expiry_date(obj, tenant=tenant)

    def get_user_write_mode(self, obj):
        if not self.context.get("include_stewardship"):
            return None
        request = self.context.get("request")
        actor = acting_user(request) if request else None
        if actor is None:
            return "none"
        from app_auth.field_stewardship import user_write_mode

        return user_write_mode(actor, obj)

    def get_writable_fields(self, obj):
        if self.get_user_write_mode(obj) != "steward":
            return []
        from app_auth.field_stewardship import STEWARD_USER_KEYS

        return sorted(STEWARD_USER_KEYS)

    class Meta:
        model = User
        fields = "__all__"
        extra_kwargs = {
            "password": {"write_only": True},
            "code": {"required": False},
            "date_of_birth": {"required": False, "allow_null": True},
            "custom_data": {"required": False},
            "phone_number_digits": {"read_only": True},
            "emergency_contact_phone_number_digits": {"read_only": True},
            "search_vector": {"read_only": True},
            "public_profile_slug": {"read_only": True},
            "id_verify_code": {"read_only": True},
            # Exposed via scoped_*_ids; keep M2M write-only so representation
            # does not double-query the same relations.
            "scoped_programs": {"write_only": True},
            "scoped_categories": {"write_only": True},
        }
        # list_serializer_class = UserListSerializer
        expandable_fields = {
            "courses": ("app_course.serializers.CourseSerializer", {"many": True}),
            "user_courses": (
                "app_course.serializers.UserCourseSerializer",
                {"many": True},
            ),
            "user_events": (
                "app_attendance.serializers.UserEventSerializer",
                {"many": True},
            ),
            "submissions": (
                "app_course.serializers.SubmissionSerializer",
                {"many": True},
            ),
            "user_departments": (
                "app_department.serializers.UserDepartmentSerializer",
                {"many": True},
            ),
            "visibility": ("app_auth.serializers.VisibilitySerializer"),
            "course_histories": (
                "app_course.serializers.CourseHistorySerializer",
                {"many": True},
            ),
            "course_join_requests": (
                "app_course.serializers.CourseJoinRequestSerializer",
                {"many": True},
            ),
        }

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        field_names = set(self.fields)

        if "custom_data" in field_names:
            ret["custom_data"] = representation_custom_data(
                ENTITY_TYPE_USER,
                getattr(instance, "custom_data", None),
                self.context.get("request"),
            )
        created = getattr(instance, "created_at", None)
        if created:
            ret["show_welcome_nav_hint"] = (
                timezone.now() - created
            ) < timedelta(hours=30 * 24)
        else:
            ret["show_welcome_nav_hint"] = False

        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        ret["microsoft_status"] = self._microsoft_status(instance, tenant)
        ret["telegram_status"] = self._telegram_status(instance, tenant)
        ret["google_status"] = self._google_status(instance, tenant)
        if not tenant or not getattr(tenant, "is_microsoft_on", False):
            ret.pop("microsoft_display_name", None)
        if not self.context.get("include_stewardship"):
            ret.pop("user_write_mode", None)
            ret.pop("writable_fields", None)
        ret.pop("scoped_programs", None)
        ret.pop("scoped_categories", None)
        needs_scoped_programs = "scoped_program_ids" in field_names
        needs_scoped_categories = "scoped_category_ids" in field_names
        if needs_scoped_programs or needs_scoped_categories:
            if self.context.get("omit_nested_user_scopes"):
                if needs_scoped_programs:
                    ret["scoped_program_ids"] = []
                if needs_scoped_categories:
                    ret["scoped_category_ids"] = []
            else:
                if needs_scoped_programs and "scoped_program_ids" not in ret:
                    ret["scoped_program_ids"] = list(
                        instance.scoped_programs.values_list("id", flat=True)
                    )
                if needs_scoped_categories and "scoped_category_ids" not in ret:
                    ret["scoped_category_ids"] = list(
                        instance.scoped_categories.values_list("id", flat=True)
                    )
        actor = acting_user(request) if request else None
        if not _actor_can_view_hr_fields(actor, tenant):
            _redact_hr_fields(ret)
        return ret

    @staticmethod
    def _telegram_status(instance, tenant) -> str:
        """Lightweight status for UI chips (no Bot API calls)."""
        if not tenant or not getattr(tenant, "is_telegram_on", False):
            return "tg_off"
        if getattr(instance, "telegram_user_id", None):
            return "linked"
        return "not_linked"

    @staticmethod
    def _google_status(instance, tenant) -> str:
        """Lightweight status for UI chips."""
        if not tenant or not getattr(tenant, "is_google_on", False):
            return "google_off"
        if getattr(instance, "google_id", None):
            return "linked"
        return "not_linked"

    @staticmethod
    def _microsoft_status(instance, tenant) -> str:
        """Lightweight status for UI chips (no Graph calls)."""
        if not tenant or not getattr(tenant, "is_microsoft_on", False):
            return "ms_off"
        if getattr(instance, "microsoft_id", None):
            if not getattr(instance, "microsoft_license_assigned", True):
                return "unlicensed"
            return "linked"
        from app_organization.domain_utils import (
            email_domain_allowed,
            get_organization_approved_domains,
        )

        approved = get_organization_approved_domains(tenant)
        if not email_domain_allowed(getattr(instance, "email", "") or "", approved):
            return "domain_blocked"
        return "not_created"

    def validate_qualifications(self, value):
        validate_qualifications_size(value)
        return value

    def validate_code(self, value):
        if value in (None, ""):
            return value
        cleaned = value.strip()
        from app_auth.user_code import validate_code_unique

        try:
            validate_code_unique(
                cleaned,
                exclude_user_id=self.instance.pk if self.instance else None,
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages[0])
        return cleaned

    def validate(self, attrs):
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        actor = acting_user(request) if request else None
        if not _actor_can_view_hr_fields(actor, tenant):
            for key in HR_FIELD_NAMES:
                attrs.pop(key, None)
        if not tenant or not getattr(tenant, "is_microsoft_on", False):
            attrs.pop("microsoft_display_name", None)
        elif self.instance is not None and "microsoft_display_name" in attrs:
            if not (attrs.get("microsoft_display_name") or "").strip():
                raise ValidationError(
                    {"microsoft_display_name": ["This field may not be blank."]}
                )

        if request and tenant and getattr(tenant, "is_microsoft_on", False):
            if attrs.get("email"):
                from app_organization.domain_utils import (
                    email_domain_allowed,
                    get_organization_approved_domains,
                )

                approved = get_organization_approved_domains(
                    self.context["request"].tenant
                )
                if not email_domain_allowed(attrs["email"], approved):
                    raise ValidationError(
                        {
                            "email": (
                                "Email must use one of your approved domains: "
                                f"{', '.join(approved) if approved else '(none configured)'}"
                            )
                        }
                    )

        actor = "admin"
        subject_roles = attrs.get("roles")
        inst = self.instance
        if inst is not None:
            # JWT auth sets request.user.id to email; resolve the ORM User first.
            req_user = acting_user(request) if request is not None else None
            if (
                req_user is not None
                and getattr(inst, "id", None) is not None
                and getattr(inst, "id", None) == getattr(req_user, "id", None)
            ):
                actor = "user"
            if subject_roles is None:
                subject_roles = list(getattr(inst, "roles", []) or [])

        # Registration path sets context flag "registration_stage" (self-register view).
        is_registration = bool(self.context.get("registration_stage"))

        allow_user_admin_keys = None
        skip_registration_required = False
        raw_dvr_id = None
        if isinstance(self.initial_data, dict):
            raw_dvr_id = self.initial_data.get("dvr_verify_id")
        if raw_dvr_id is not None and actor == "user" and inst is not None:
            try:
                resolved = dvr_verify_allow_user_admin_keys(
                    user=inst, dvr_id=int(raw_dvr_id)
                )
            except (TypeError, ValueError):
                resolved = None
            if resolved is not None:
                allow_user_admin_keys = resolved
                # Narrow DVR writes must not force unrelated registration-floor fields.
                skip_registration_required = True
            else:
                allow_user_admin_keys = set()

        if inst is None:
            incoming_cd = attrs.get("custom_data", {}) or {}
            defs = list(active_definitions_qs(ENTITY_TYPE_USER))
            self._cached_user_field_defs = defs
            prime_representation_keys_from_definitions(
                request, ENTITY_TYPE_USER, defs
            )
            attrs["custom_data"] = validate_user_custom_data_for_write(
                incoming=incoming_cd,
                existing={},
                partial=False,
                stage="registration" if is_registration else "create",
                subject_roles=subject_roles,
                actor="user" if is_registration else actor,
                definitions=defs,
                actor_user=acting_user(request) if request is not None else None,
            )
        elif "custom_data" in attrs:
            defs = list(active_definitions_qs(ENTITY_TYPE_USER))
            self._cached_user_field_defs = defs
            prime_representation_keys_from_definitions(
                request, ENTITY_TYPE_USER, defs
            )
            attrs["custom_data"] = validate_user_custom_data_for_write(
                incoming=attrs["custom_data"],
                existing=inst.custom_data or {},
                partial=self.partial,
                stage="edit",
                subject_roles=subject_roles,
                actor=actor,
                allow_user_admin_keys=allow_user_admin_keys,
                skip_registration_required=skip_registration_required,
                definitions=defs,
                actor_user=acting_user(request) if request is not None else None,
            )

        attrs.pop("public_profile_slug", None)
        attrs.pop("dvr_verify_id", None)

        if is_registration:
            password = attrs.get("password")
            confirm = self.initial_data.get("confirm_password")
            if password and confirm and password != confirm:
                raise ValidationError(
                    {"confirm_password": "Passwords do not match."}
                )
            if password:
                try:
                    validate_password(password)
                except DjangoValidationError as exc:
                    raise ValidationError({"password": list(exc.messages)})
            attrs.pop("confirm_password", None)

        public_profile_keys = {
            "qualifications",
            "is_public_profile_enabled",
            "show_certifications_on_public_profile",
        }
        if inst is not None and public_profile_keys.intersection(attrs.keys()):
            if not user_is_staff(inst):
                for key in public_profile_keys:
                    attrs.pop(key, None)

        attrs = super().validate(attrs)
        if attrs.get("custom_data") is None:
            attrs["custom_data"] = {}

        if "user_signature" in attrs and self.instance is not None:
            req_user = acting_user(request) if request is not None else None
            if req_user is None or req_user.id != self.instance.id:
                raise PermissionDenied("Only the user can set their own signature.")
            if not user_is_staff(self.instance):
                raise ValidationError(
                    {"user_signature": "Signatures are for staff only."}
                )

        return attrs

    def _merge_partial_custom_data_into_validated(self, instance, validated_data):
        """Apply only keys present in the request onto fresh DB custom_data."""
        if not self.partial or "custom_data" not in validated_data:
            return
        from app_custom_fields.validation import _is_empty_value

        incoming_raw = {}
        if isinstance(self.initial_data, dict):
            incoming_raw = self.initial_data.get("custom_data") or {}
        if not isinstance(incoming_raw, dict):
            return

        incoming_keys = set(incoming_raw.keys())
        validated_cd = validated_data["custom_data"]
        instance.refresh_from_db(fields=["custom_data"])
        base = dict(instance.custom_data or {})
        for key in incoming_keys:
            if key in validated_cd:
                base[key] = validated_cd[key]
            elif _is_empty_value(incoming_raw.get(key)):
                base.pop(key, None)
        validated_data["custom_data"] = base

    def update(self, instance, validated_data):
        self._merge_partial_custom_data_into_validated(instance, validated_data)
        if "password" in validated_data:
            instance.set_password(validated_data["password"])
            instance.save()
            request = self.context.get("request")
            if request is not None:
                revoke_all_refresh_sessions_for_user(instance, request)
        scope_changed = (
            "scoped_programs" in validated_data or "scoped_categories" in validated_data
        )
        prev_program_ids: set = set()
        prev_category_ids: set = set()
        if scope_changed:
            prev_program_ids = set(
                instance.scoped_programs.values_list("id", flat=True)
            )
            prev_category_ids = set(
                instance.scoped_categories.values_list("id", flat=True)
            )
        assign_slug = should_assign_public_profile_slug(instance, validated_data)
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        if "microsoft_display_name" in validated_data:
            resolved = resolve_microsoft_display_name(
                raw=validated_data["microsoft_display_name"],
                name=getattr(instance, "name", "") or "",
            )
            validated_data["microsoft_display_name"] = resolved
            if (
                tenant
                and getattr(tenant, "is_microsoft_on", False)
                and getattr(instance, "microsoft_id", None)
                and resolved != (instance.microsoft_display_name or "")
            ):
                from app_microsoft.graph_wrapper.user import MSUser

                res = MSUser(tenant).update_name(instance.microsoft_id, resolved)
                if res.status_code not in range(199, 300):
                    raise ValidationError({"MS_ERROR": res.json()})
        x = super().update(instance, validated_data)
        if assign_slug:
            ensure_public_profile_slug(x)
        if validated_data.get("roles"):
            visibility = Visibility.objects.filter(
                role=instance.get_sorted_roles()[0]
            ).first()
            if visibility:
                x.visibility = visibility
                x.save()
        refresh_profile_completeness(
            x, definitions=getattr(self, "_cached_user_field_defs", None)
        )
        if "id_photo" in validated_data:
            sync_id_photo_thumb(x)
        if scope_changed:
            request = self.context.get("request")
            tenant = getattr(request, "tenant", None) if request else None
            if tenant is not None:
                from app_microsoft.scope_team_sync import (
                    schedule_scoped_team_owner_reconcile_for_user_after_commit,
                )

                schedule_scoped_team_owner_reconcile_for_user_after_commit(
                    x.id,
                    tenant,
                    previous_program_ids=prev_program_ids,
                    previous_category_ids=prev_category_ids,
                )
        return x

    def create(self, validated_data):
        if validated_data.get("custom_data") is None:
            validated_data["custom_data"] = {}
        password = validated_data.pop("password")
        validated_data.pop("confirm_password", None)

        # Admin-only opt-out toggle (defaults True). Lower roles / hidden clients
        # always provision; only superadmin/admin may skip Microsoft account creation.
        create_microsoft_account = validated_data.pop("create_microsoft_account", True)
        allow_unlicensed = validated_data.pop(
            "allow_unlicensed_microsoft_account", False
        )
        request = self.context.get("request")
        actor = User.get_user_from_request(request) if request else None
        actor_is_admin = bool(
            actor
            and {User.UserRole.SUPERADMIN, User.UserRole.ADMIN}.intersection(actor.roles or [])
        )
        if not actor_is_admin:
            create_microsoft_account = True
            allow_unlicensed = False

        is_registration = bool(self.context.get("registration_stage"))

        ms_display_name = resolve_microsoft_display_name(
            raw=validated_data.get("microsoft_display_name"),
            name=validated_data.get("name", ""),
        )
        if request and request.tenant.is_microsoft_on:
            validated_data["microsoft_display_name"] = ms_display_name
        else:
            validated_data.pop("microsoft_display_name", None)

        if (
            request
            and request.tenant.is_microsoft_on
            and create_microsoft_account
            and not is_registration
        ):
            user_type = "staff"
            if (
                    len(validated_data["roles"]) == 1
                    and User.UserRole.STUDENT in validated_data["roles"]
            ):
                user_type = "student"

            flow = CreateUserFlow(
                validated_data["email"],
                password,
                user_type,
                ms_display_name,
                self.context["request"].tenant,
                assign_license=not allow_unlicensed,
            )
            validated_data["microsoft_id"] = flow.start()
            validated_data["microsoft_license_assigned"] = not allow_unlicensed

        user = super().create(validated_data)
        user.set_password(password)
        roles = validated_data.get("roles") or []
        is_student_only = (
            len(roles) == 1 and User.UserRole.STUDENT in roles
        )
        user.is_active = True
        user.is_staff = not is_student_only
        user.visibility = Visibility.objects.filter(
            role=user.get_sorted_roles()[0]
        ).first()
        user.save()

        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        if (
            request
            and not is_registration
            and not user.is_waiting_for_activation
            and tenant is not None
            and should_send_welcome_email(user, tenant)
        ):
            async_task(
                "app_microsoft.mail.send_user_create_email",
                user.communication_email,
                user.email,
                password,
                user.name,
                tenant,
            )
        refresh_profile_completeness(user)
        return user


def refresh_profile_completeness(user, *, definitions=None) -> None:
    """Recompute and persist denormalized completeness without re-running save hooks."""
    from app_custom_fields.completeness import compute_profile_completeness

    percent = compute_profile_completeness(user, definitions=definitions)["percent"]
    if user.profile_completeness != percent:
        type(user).objects.filter(pk=user.pk).update(profile_completeness=percent)
        user.profile_completeness = percent


def create_user_login_log(user):
    log = Log()
    log.level = Log.LogLevel.INFO
    log.message = f"User {user.email} logged in."
    log.entity = "user"
    log.entity_id = user.id
    log.entity_description = user.email
    log.category = "LOGIN"
    log.save()
    # Microsoft login bypasses TokenObtainPairSerializer; keep last_login in sync for all paths.
    User.objects.filter(pk=user.pk).update(last_login=timezone.now())


def enrich_user_payload_for_auth(user, payload: dict, schema_name: str) -> dict:
    """Attach RBAC fields expected by the frontend auth cookie (mirrors UserProfileView)."""
    from app_rbac.cache import matrix_generation

    payload["permissions"] = user.get_effective_permissions()
    payload["rbac_version"] = matrix_generation(schema_name)
    return payload


class LoginSerializer(TokenObtainPairSerializer):
    remember = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        super().validate(attrs)
        request = self.context["request"]
        remembered = attrs.get("remember", False)
        data = create_refresh_session(self.user, request, remembered=remembered)
        schema_name = request.tenant.schema_name
        data["schema_name"] = schema_name
        user_data = UserSerializer(self.user, expand=["visibility"]).data
        data["user"] = enrich_user_payload_for_auth(self.user, user_data, schema_name)
        create_user_login_log(self.user)
        return data


class DataVerificationRequestSerializer(BaseModelSerializer):
    class Meta:
        model = DataVerificationRequest
        fields = "__all__"
        expandable_fields = {
            "created_by": ("app_auth.serializers.UserSerializer"),
        }

    def validate_fields(self, value):
        return validate_dvr_fields(value)

    def validate_requested_user_types(self, value):
        if not value:
            raise serializers.ValidationError("Select at least one user type.")
        return value

    def validate_expires_on(self, value):
        if value is None:
            raise serializers.ValidationError("Expiry date is required.")
        return value

    def create(self, validated_data):
        request = self.context.get("request")
        # Keep existing created_by lookup behavior (do not expand into a refactor).
        validated_data["created_by"] = User.objects.filter(
            email=getattr(request.user, "id", None)
        ).first()
        if "expires_on" not in validated_data or validated_data["expires_on"] is None:
            validated_data["expires_on"] = date.today() + timedelta(days=7)

        dvr = super().create(validated_data)
        role_types = validated_data.get("requested_user_types") or []
        user_ids = list(users_matching_roles(role_types).values_list("id", flat=True))
        UserDataVerificationRequest.objects.bulk_create(
            [
                UserDataVerificationRequest(
                    user_id=uid,
                    data_verification_request=dvr,
                    status=UserDataVerificationRequest.Status.PENDING,
                )
                for uid in user_ids
            ],
            ignore_conflicts=True,
        )
        return dvr


class UserDataVerificationRequestSerializer(BaseModelSerializer):
    class Meta:
        model = UserDataVerificationRequest
        fields = "__all__"

    expandable_fields = {
        "user": ("app_auth.serializers.UserSerializer"),
        "data_verification_request": (
            "app_auth.serializers.DataVerificationRequestSerializer"
        ),
    }

    def validate(self, attrs):
        attrs = super().validate(attrs)
        new_status = attrs.get("status", getattr(self.instance, "status", None))
        if new_status != UserDataVerificationRequest.Status.VERIFIED:
            return attrs
        instance = self.instance
        if instance is None:
            return attrs
        dvr = instance.data_verification_request
        fields = normalize_dvr_fields(dvr.fields)
        missing = user_missing_required_fields(instance.user, fields)
        if missing:
            raise serializers.ValidationError(
                {
                    "status": (
                        "Cannot verify until required fields are filled: "
                        + ", ".join(missing)
                    )
                }
            )
        return attrs


def get_user_from_MS_token(ms_access: str):
    from app_microsoft.graph_wrapper.base import IN_REQUEST_GRAPH_TIMEOUT

    res = requests.get(
        "https://graph.microsoft.com/v1.0/" + "me",
        headers={
            "Authorization": "Bearer " + ms_access,
            "Content-Type": "application/json",
        },
        timeout=IN_REQUEST_GRAPH_TIMEOUT,
    )
    if res.status_code not in range(199, 300):
        raise ValidationError({"error_type": "MS ERROR", "details": {**res.json()}})
    user_id = res.json()["id"]
    user = User.objects.filter(microsoft_id=user_id).first()
    if not user:
        raise ValidationError(
            {"error_type": "MS ERROR", "details": "No such user exists in this tenant."}
        )

    return user


class MSLoginSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=5280)
    teams_assertion = serializers.CharField(
        max_length=5280, required=False, allow_blank=True
    )
    remember = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        user = get_user_from_MS_token(attrs["token"])
        request = self.context["request"]
        teams_connected, teams_detail = connect_personal_teams_from_login_token(
            request.tenant,
            user,
            obo_assertion=attrs.get("teams_assertion"),
        )
        tenant_schema = request.tenant.schema_name
        remembered = attrs.get("remember", False)
        session_data = create_refresh_session(
            user, request, remembered=remembered
        )
        data = super().validate(attrs)
        data.update(session_data)
        data["schema_name"] = tenant_schema
        data["microsoft_teams_connected"] = teams_connected
        if teams_detail:
            data["microsoft_teams_oauth_detail"] = teams_detail
        user_data = UserSerializer(user).data
        data["user"] = enrich_user_payload_for_auth(user, user_data, tenant_schema)
        create_user_login_log(user)
        return data


class TelegramLoginSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    auth_date = serializers.IntegerField()
    hash = serializers.CharField(max_length=128)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    username = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    photo_url = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    remember = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        request = self.context["request"]
        org = request.tenant
        from app_telegram.login_user import verify_widget_and_resolve_user

        with schema_context(org.schema_name):
            user = verify_widget_and_resolve_user(org, attrs)

        session_data = create_refresh_session(
            user,
            request,
            remembered=attrs.get("remember", False),
        )
        tenant_schema = request.tenant.schema_name
        data = super().validate(attrs)
        data.update(session_data)
        data["schema_name"] = tenant_schema
        user_data = UserSerializer(user, expand=["visibility"]).data
        data["user"] = enrich_user_payload_for_auth(user, user_data, tenant_schema)
        create_user_login_log(user)
        return data


class TelegramBotLoginSessionSerializer(serializers.Serializer):
    def validate(self, attrs):
        from app_telegram.bot_login import create_bot_login_session

        request = self.context["request"]
        org = request.tenant
        session = create_bot_login_session(org)
        data = super().validate(attrs)
        data.update(session)
        return data


class TelegramBotLoginVerifySerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
    otp = serializers.CharField(max_length=16)
    remember = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        from app_telegram.bot_login import verify_bot_login

        request = self.context["request"]
        org = request.tenant
        with schema_context(org.schema_name):
            user = verify_bot_login(
                org,
                session_id=str(attrs["session_id"]),
                otp=attrs["otp"],
            )

        session_data = create_refresh_session(
            user,
            request,
            remembered=attrs.get("remember", False),
        )
        tenant_schema = request.tenant.schema_name
        data = super().validate(attrs)
        data.update(session_data)
        data["schema_name"] = tenant_schema
        user_data = UserSerializer(user, expand=["visibility"]).data
        data["user"] = enrich_user_payload_for_auth(user, user_data, tenant_schema)
        create_user_login_log(user)
        return data


class UserResignSerializer(serializers.Serializer):
    inform_date = serializers.DateField(required=False, allow_null=True)
    last_working_date = serializers.DateField(required=True)
    type_of_pay = serializers.ChoiceField(
        choices=User.TypeOfPay.choices, required=False, allow_null=True
    )
    employment_type = serializers.ChoiceField(
        choices=User.EmploymentType.choices, required=False, allow_null=True
    )
    remark = serializers.CharField(required=False, allow_null=True, allow_blank=True)

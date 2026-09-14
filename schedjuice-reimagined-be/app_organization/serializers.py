from jsonschema import validate
from decimal import Decimal
from django.utils import timezone
from rest_framework import serializers

from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.program_helpers import create_default_general_program
from app_rbac.resolution import effective_permissions
from app_rbac.seeding import seed_rbac
from app_organization import models
from app_organization.domain_utils import normalize_available_domains
from utilitas.serializers import BaseModelSerializer

MOBILE_DEVICE_POLICY_CONFIGURE = "mobile_device_policy.configure"

color_schema = {
    "type": "object",
    "properties": {
        "r": {"type": "number", "minimum": 0, "maximum": 255},
        "g": {"type": "number", "minimum": 0, "maximum": 255},
        "b": {"type": "number", "minimum": 0, "maximum": 255},
    },
}
theme_json_schema = {
    "type": "object",
    "properties": {
        "background": color_schema,
        "cardBackground": color_schema,
        "mutedBackground": color_schema,
        "popoverBackground": color_schema,
        "text": color_schema,
        "cardText": color_schema,
        "mutedText": color_schema,
        "popoverText": color_schema,
    },
}


class OrganizationSerializer(BaseModelSerializer):
    has_connected_zoom_account = serializers.SerializerMethodField(read_only=True)
    program_count = serializers.SerializerMethodField(read_only=True)
    telegram_bot_token = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        help_text="Paste BotFather token to set or rotate. Never returned on read.",
    )

    def get_has_connected_zoom_account(self, obj):
        return obj.has_active_zoom_account()

    def get_program_count(self, obj):
        from django.db import ProgrammingError
        from django.db.utils import OperationalError

        from app_course.models import Program

        schema_name = getattr(obj, "schema_name", None)
        # Course/Program tables exist per tenant schema, not on public.
        if not schema_name or schema_name == get_public_schema_name():
            return 0
        try:
            with schema_context(schema_name):
                return Program.objects.filter(is_active=True).count()
        except (ProgrammingError, OperationalError):
            # Tenant migrations not applied yet (e.g. Program tables missing).
            return 0

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for i in [
            "schema_name",
            "thumbprint",
            "certificate_id",
            "private_key",
            "client_secret",
            "staff_license_id",
            "student_license_id",
            "default_owner_id",
            "delegated_account_upn",
            "delegated_account_password",
            "delegated_account_object_id",
        ]:
            fld = self.fields.get(i)
            if fld is not None:
                fld.write_only = True

    class Meta:
        model = models.Organization
        exclude = (
            "zoom_account_id",
            "zoom_client_id",
            "zoom_client_secret",
            "telegram_bot_token_ct",
            "telegram_webhook_secret",
            "telegram_routing_key",
            # AI settings — use /organizations/{id}/ai-settings instead
            "is_ai_enabled",
            "ai_default_model",
            "ai_max_context_turns",
            "ai_max_tool_iterations",
            "ai_school_context",
            "ai_assistant_instructions",
            "ai_monthly_usd_limit",
            "ai_monthly_token_limit",
            "ai_hard_enforce",
            "ai_alert_thresholds",
            "ai_budget_active",
        )
        extra_kwargs = {
            "schema_name": {"required": False},
            "single_mobile_device_enabled_at": {"read_only": True},
        }

    def validate(self, attrs):
        if attrs.get("theme"):
            try:
                validate(instance=attrs["theme"], schema=theme_json_schema)
            except Exception as e:
                raise serializers.ValidationError({"theme": str(e)})

        if "available_domains" in attrs:
            attrs["available_domains"] = normalize_available_domains(
                attrs["available_domains"]
            )

        instance = getattr(self, "instance", None)
        use_student_attendance = attrs.get(
            "use_student_attendance",
            getattr(instance, "use_student_attendance", True) if instance else True,
        )
        use_student_checkin = attrs.get(
            "use_student_checkin",
            getattr(instance, "use_student_checkin", False) if instance else False,
        )
        if use_student_attendance and use_student_checkin:
            raise serializers.ValidationError(
                {
                    "use_student_checkin": (
                        "Student attendance marking and student check-in "
                        "cannot both be enabled."
                    )
                }
            )

        duration = attrs.get("default_session_duration_minutes")
        if duration is None and self.instance is not None:
            duration = getattr(
                self.instance, "default_session_duration_minutes", None
            )
        if duration is not None and duration < 1:
            raise serializers.ValidationError(
                {
                    "default_session_duration_minutes": (
                        "Default session duration must be at least 1 minute."
                    )
                }
            )

        is_telegram_login_on = attrs.get(
            "is_telegram_login_on",
            getattr(instance, "is_telegram_login_on", False) if instance else False,
        )
        is_telegram_on = attrs.get(
            "is_telegram_on",
            getattr(instance, "is_telegram_on", False) if instance else False,
        )
        bot_username = attrs.get(
            "telegram_bot_username",
            getattr(instance, "telegram_bot_username", None) if instance else None,
        )
        if is_telegram_login_on:
            if not is_telegram_on:
                raise serializers.ValidationError(
                    {
                        "is_telegram_login_on": (
                            "Enable Telegram integration before allowing Telegram login."
                        )
                    }
                )
            has_bot = bool(bot_username) or bool(
                instance and instance.telegram_bot_username
            )
            if not has_bot:
                raise serializers.ValidationError(
                    {
                        "is_telegram_login_on": (
                            "Configure a Telegram bot before allowing Telegram login."
                        )
                    }
                )

        if attrs.get("is_telegram_on") is False:
            attrs["is_telegram_login_on"] = False

        is_google_login_on = attrs.get(
            "is_google_login_on",
            getattr(instance, "is_google_login_on", False) if instance else False,
        )
        is_google_on = attrs.get(
            "is_google_on",
            getattr(instance, "is_google_on", False) if instance else False,
        )
        if is_google_login_on:
            if not is_google_on:
                raise serializers.ValidationError(
                    {
                        "is_google_login_on": (
                            "Enable Google integration before allowing Google login."
                        )
                    }
                )
            from django.conf import settings

            if not (getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "") or "").strip():
                raise serializers.ValidationError(
                    {
                        "is_google_login_on": (
                            "Google OAuth is not configured on this platform."
                        )
                    }
                )

        if attrs.get("is_google_on") is False:
            attrs["is_google_login_on"] = False

        is_students_dm_admins_only = attrs.get(
            "is_students_dm_admins_only_enabled",
            getattr(instance, "is_students_dm_admins_only_enabled", False)
            if instance
            else False,
        )
        contact_id = attrs.get(
            "student_dm_contact_user_id",
            getattr(instance, "student_dm_contact_user_id", None)
            if instance
            else None,
        )
        if is_students_dm_admins_only and not contact_id:
            raise serializers.ValidationError(
                {
                    "student_dm_contact_user_id": (
                        "Select a student DM contact when admins-only direct "
                        "messages are enabled."
                    )
                }
            )
        if contact_id is not None and instance and instance.schema_name:
            from django.core.exceptions import ValidationError as DjangoValidationError

            from app_chat.services import validate_student_dm_contact_user

            try:
                validate_student_dm_contact_user(contact_id, instance.schema_name)
            except DjangoValidationError as exc:
                if hasattr(exc, "message_dict"):
                    raise serializers.ValidationError(exc.message_dict) from exc
                raise serializers.ValidationError(
                    {"student_dm_contact_user_id": exc.messages}
                ) from exc

        if "is_single_mobile_device_enabled" in attrs:
            new_enabled = attrs["is_single_mobile_device_enabled"]
            old_enabled = (
                getattr(instance, "is_single_mobile_device_enabled", False)
                if instance
                else False
            )
            if new_enabled != old_enabled:
                request = self.context.get("request")
                actor = getattr(request, "user", None) if request else None
                if (
                    actor is None
                    or MOBILE_DEVICE_POLICY_CONFIGURE
                    not in effective_permissions(actor)
                ):
                    raise serializers.ValidationError(
                        {
                            "is_single_mobile_device_enabled": (
                                "You do not have permission to configure the "
                                "mobile device policy."
                            )
                        }
                    )

        return super().validate(attrs)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if "available_domains" in data:
            data["available_domains"] = normalize_available_domains(
                instance.available_domains
            )
        return data

    def _apply_telegram_config(self, instance, *, bot_token: str | None, is_telegram_on: bool):
        from app_telegram.client import TelegramApiError
        from app_telegram.config import configure_telegram
        from app_telegram.crypto import TokenEncryptionError

        token = (bot_token or "").strip()
        if not token:
            try:
                token = instance.get_telegram_bot_token()
            except TokenEncryptionError as exc:
                raise serializers.ValidationError(
                    {"telegram_bot_token": str(exc)}
                ) from exc
        if is_telegram_on and not token:
            raise serializers.ValidationError(
                {
                    "telegram_bot_token": "Bot token is required when Telegram is enabled.",
                }
            )
        if not token and not is_telegram_on:
            return
        try:
            configure_telegram(
                instance.schema_name,
                bot_token=token,
                is_telegram_on=is_telegram_on,
            )
        except TelegramApiError as exc:
            raise serializers.ValidationError(
                {
                    "telegram_bot_token": (
                        f"Telegram rejected the bot token: {exc.description}"
                    )
                }
            ) from exc

    def update(self, instance, validated_data):
        bot_token = validated_data.pop("telegram_bot_token", None)
        telegram_on_before = instance.is_telegram_on
        if "is_single_mobile_device_enabled" in validated_data:
            new_enabled = validated_data["is_single_mobile_device_enabled"]
            if new_enabled != instance.is_single_mobile_device_enabled:
                validated_data["single_mobile_device_enabled_at"] = (
                    timezone.now() if new_enabled else None
                )
        cache_fields = {
            "name",
            "is_fm_hm_course_display_enabled",
            "is_staff_points_enabled",
        }
        should_invalidate_cache = bool(cache_fields & set(validated_data.keys()))
        instance = super().update(instance, validated_data)
        if bot_token is not None or instance.is_telegram_on != telegram_on_before:
            self._apply_telegram_config(
                instance,
                bot_token=bot_token,
                is_telegram_on=instance.is_telegram_on,
            )
            instance.refresh_from_db()
        if should_invalidate_cache:
            from app_ai.prompt_cache import bump_org_prompt_cache_version

            bump_org_prompt_cache_version(instance)
        return instance

    def create(self, validated_data):
        bot_token = validated_data.pop("telegram_bot_token", None)
        is_telegram_on = validated_data.get("is_telegram_on", False)
        validated_data["schema_name"] = "x" + validated_data[
            "domain_url"
        ].lower().replace(".", "")
        instance = super().create(validated_data)
        with schema_context(instance.schema_name):
            create_default_general_program()
            seed_rbac()
        if is_telegram_on or (bot_token and str(bot_token).strip()):
            self._apply_telegram_config(
                instance,
                bot_token=bot_token,
                is_telegram_on=is_telegram_on,
            )
            instance.refresh_from_db()
        return instance


class OrganizationTenantPublicSerializer(OrganizationSerializer):
    """Public tenant payload for unauthenticated / tenant resolution endpoints."""

    active_student_id_card_template = serializers.SerializerMethodField(read_only=True)
    active_staff_id_card_template = serializers.SerializerMethodField(read_only=True)

    class Meta(OrganizationSerializer.Meta):
        exclude = OrganizationSerializer.Meta.exclude

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields.pop("telegram_bot_token", None)

    def _serialize_active_template(self, template):
        if template is None:
            return None
        from app_organization.id_card_template_serializers import (
            IdCardTemplateSummarySerializer,
        )

        return IdCardTemplateSummarySerializer(
            template,
            context=self.context,
        ).data

    def get_active_student_id_card_template(self, obj):
        template = getattr(obj, "active_student_id_card_template", None)
        if template is None and hasattr(obj, "active_student_id_card_template_id"):
            template_id = obj.active_student_id_card_template_id
            if template_id:
                from app_organization.models import IdCardTemplate

                template = IdCardTemplate.objects.filter(pk=template_id).first()
        return self._serialize_active_template(template)

    def get_active_staff_id_card_template(self, obj):
        template = getattr(obj, "active_staff_id_card_template", None)
        if template is None and hasattr(obj, "active_staff_id_card_template_id"):
            template_id = obj.active_staff_id_card_template_id
            if template_id:
                from app_organization.models import IdCardTemplate

                template = IdCardTemplate.objects.filter(pk=template_id).first()
        return self._serialize_active_template(template)


from app_ai.defaults import get_platform_ai_defaults
from app_ai.pricing import list_available_models
from app_ai.prompts import build_platform_base_prompt
from app_ai.tenant_context import build_system_context_preview


class OrganizationAISettingsSerializer(BaseModelSerializer):
    name = serializers.CharField(read_only=True)
    ai_platform_base_prompt = serializers.SerializerMethodField()
    ai_system_prompt_preview = serializers.SerializerMethodField()
    ai_platform_defaults = serializers.SerializerMethodField()
    ai_available_models = serializers.SerializerMethodField()
    ai_enabled_packs = serializers.JSONField(required=False)
    ai_available_packs = serializers.SerializerMethodField()
    available_tools = serializers.SerializerMethodField()
    can_edit_ai_packs = serializers.SerializerMethodField()

    class Meta:
        model = models.Organization
        fields = [
            "name",
            "is_ai_enabled",
            "ai_default_model",
            "ai_max_context_turns",
            "ai_max_tool_iterations",
            "ai_school_context",
            "ai_assistant_instructions",
            "ai_monthly_usd_limit",
            "ai_monthly_token_limit",
            "ai_hard_enforce",
            "ai_alert_thresholds",
            "ai_budget_active",
            "ai_default_user_monthly_usd_limit",
            "ai_enabled_packs",
            "ai_available_packs",
            "available_tools",
            "can_edit_ai_packs",
            "ai_platform_base_prompt",
            "ai_system_prompt_preview",
            "ai_platform_defaults",
            "ai_available_models",
        ]
        read_only_fields = [
            "name",
            "ai_platform_base_prompt",
            "ai_system_prompt_preview",
            "ai_platform_defaults",
            "ai_available_models",
            "ai_available_packs",
            "available_tools",
            "can_edit_ai_packs",
        ]

    def get_ai_platform_base_prompt(self, obj):
        return build_platform_base_prompt(obj)

    def get_ai_system_prompt_preview(self, obj):
        return build_system_context_preview(obj)

    def get_ai_platform_defaults(self, obj):
        return get_platform_ai_defaults()

    def get_ai_available_models(self, obj):
        return list_available_models()

    def get_ai_available_packs(self, obj):
        from app_ai.packs import list_available_packs

        return list_available_packs()

    def get_available_tools(self, obj):
        from app_ai.packs import list_available_tools_for_org
        from tenant_schemas.utils import schema_context

        # Binders may need the tenant schema for Subject rows.
        try:
            with schema_context(obj.schema_name):
                return list_available_tools_for_org(obj)
        except Exception:
            return list_available_tools_for_org(obj)

    def get_can_edit_ai_packs(self, obj):
        request = self.context.get("request")
        if request is None:
            return False
        from app_organization.permissions import RequiresPlatformAdminTenant

        return RequiresPlatformAdminTenant().has_permission(request, None)

    def validate_ai_enabled_packs(self, value):
        from app_ai.packs import CORE_PACK_ID, PACK_REGISTRY

        if value is None:
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("Must be a list of pack ids.")
        cleaned = []
        for item in value:
            pid = str(item)
            if pid == CORE_PACK_ID:
                continue
            if pid not in PACK_REGISTRY:
                raise serializers.ValidationError(f"Unknown pack id: {pid}")
            if pid not in cleaned:
                cleaned.append(pid)
        return cleaned

    def validate_ai_default_model(self, value):
        if value is None or not str(value).strip():
            return None
        model = str(value).strip()
        if model not in list_available_models():
            raise serializers.ValidationError(
                f"Must be one of: {', '.join(list_available_models())}."
            )
        return model

    def validate_ai_max_context_turns(self, value):
        if not 1 <= value <= 20:
            raise serializers.ValidationError("Must be between 1 and 20.")
        return value

    def validate_ai_max_tool_iterations(self, value):
        if not 1 <= value <= 10:
            raise serializers.ValidationError("Must be between 1 and 10.")
        return value

    def validate_ai_school_context(self, value):
        if len(value or "") > 2000:
            raise serializers.ValidationError("Max 2000 characters.")
        return value

    def validate_ai_assistant_instructions(self, value):
        if len(value or "") > 2000:
            raise serializers.ValidationError("Max 2000 characters.")
        return value

    def validate_ai_alert_thresholds(self, value):
        if value is None:
            return []
        for item in value:
            f = float(item)
            if not 0 <= f <= 1:
                raise serializers.ValidationError(
                    "Each threshold must be between 0 and 1."
                )
        return sorted(float(x) for x in value)

    def validate_ai_default_user_monthly_usd_limit(self, value):
        if value is None:
            return None
        if value <= 0:
            raise serializers.ValidationError("Must be greater than 0.")
        if value > Decimal("99999.99"):
            raise serializers.ValidationError("Must be at most 99999.99.")
        return value

    def update(self, instance, validated_data):
        cache_fields = {
            "ai_default_model",
            "ai_school_context",
            "ai_assistant_instructions",
            "ai_enabled_packs",
        }
        should_invalidate_cache = bool(cache_fields & set(validated_data.keys()))
        instance = super().update(instance, validated_data)
        if should_invalidate_cache:
            from app_ai.prompt_cache import bump_org_prompt_cache_version

            bump_org_prompt_cache_version(instance)
        return instance


class OrganizationPlatformBillingConfigSerializer(BaseModelSerializer):
    currency_symbol = serializers.CharField(read_only=True)
    currency_iso4217 = serializers.CharField(read_only=True)

    class Meta:
        model = models.Organization
        fields = [
            "platform_monthly_flat_rate",
            "cost_per_account_per_day",
            "currency_symbol",
            "currency_iso4217",
        ]
        read_only_fields = [
            "cost_per_account_per_day",
            "currency_symbol",
            "currency_iso4217",
        ]

    def validate_platform_monthly_flat_rate(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Flat rate must be zero or greater.")
        return value


class PlatformInvoiceSerializer(BaseModelSerializer):
    organization_id = serializers.IntegerField(source="organization.id", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = models.PlatformInvoice
        fields = (
            "id",
            "invoice_number",
            "organization_id",
            "organization_name",
            "billing_year",
            "billing_month",
            "status",
            "line_items",
            "totals",
            "generated_by_user_id",
            "generated_by_name",
            "generated_by_email",
            "generated_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

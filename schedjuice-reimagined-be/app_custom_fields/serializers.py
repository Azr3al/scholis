import regex

from rest_framework.exceptions import ValidationError

from app_custom_fields.attachment_rules import (
    DEFAULT_ATTACHMENT_RULES,
    validate_attachment_definition_rules,
)
from app_custom_fields.builtin_fields import get_builtin_field
from app_custom_fields.constants import (
    ALLOWED_DEFINITION_ENTITY_TYPES,
    ENTITY_TYPE_USER,
    FILLED_BY_ADMIN,
    REQUIRED_AT_REGISTRATION,
    SOURCE_BUILTIN,
)
from app_custom_fields.models import FieldDefinition, FieldGroup
from app_custom_fields.validation import MAX_PATTERN_LENGTH
from utilitas.serializers import BaseModelSerializer


class FieldGroupSerializer(BaseModelSerializer):
    class Meta:
        model = FieldGroup
        fields = "__all__"

    def validate_entity_type(self, value):
        if value not in ALLOWED_DEFINITION_ENTITY_TYPES:
            raise ValidationError({"entity_type": "Unsupported entity type."})
        return value


def _validate_choices_json(choices, *, field_label="choices"):
    if choices is None:
        raise ValidationError({field_label: "This field is required for this type."})
    if not isinstance(choices, list) or len(choices) == 0:
        raise ValidationError({field_label: "Must be a non-empty JSON array of objects."})
    for i, item in enumerate(choices):
        if not isinstance(item, dict):
            raise ValidationError({field_label: f"Item {i} must be an object with value and label."})
        if "value" not in item or "label" not in item:
            raise ValidationError({field_label: f"Item {i} must include value and label."})
        if not isinstance(item["value"], str) or not isinstance(item["label"], str):
            raise ValidationError({field_label: f"Item {i} value and label must be strings."})


def _has_active_duplicate(*, entity_type, field_name, value, exclude_pk=None):
    """True when another active definition shares field_key or field_label."""
    if value is None or value == "":
        return False
    qs = FieldDefinition.objects.filter(
        entity_type=entity_type,
        is_active=True,
        **{field_name: value},
    )
    if exclude_pk is not None:
        qs = qs.exclude(pk=exclude_pk)
    return qs.exists()


def reactivate_or_conflict(*, entity_type, field_key, field_type, validated_data):
    """If an inactive definition holds this key: reactivate it (same type) or raise.

    Returns the reactivated definition, or None when the key is unused.
    Most recent inactive row wins when several share the key.
    """
    inactive = (
        FieldDefinition.objects.filter(
            entity_type=entity_type,
            field_key=field_key,
            is_active=False,
        )
        .order_by("-id")
        .first()
    )
    if inactive is None:
        return None
    if inactive.field_type != field_type:
        raise ValidationError(
            {
                "field_key": (
                    f"This key was previously used as {inactive.field_type!r}. "
                    "Pick a new key, or use the same type to reactivate the old field."
                )
            }
        )
    for attr, value in validated_data.items():
        setattr(inactive, attr, value)
    inactive.is_active = True
    inactive.save()
    return inactive


class CustomFieldDefinitionSerializer(BaseModelSerializer):
    class Meta:
        model = FieldDefinition
        fields = "__all__"

    def validate_entity_type(self, value):
        if value not in ALLOWED_DEFINITION_ENTITY_TYPES:
            raise ValidationError({"entity_type": "Unsupported entity type."})
        return value

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # Compatibility shim (Phase 1 window): keep emitting legacy fields derived
        # from the new policy columns so the current FE keeps working.
        ret["is_required"] = (
            getattr(instance, "required_at", "never") == REQUIRED_AT_REGISTRATION
        )
        ret["form_input_mode"] = (
            "read_only"
            if getattr(instance, "filled_by", "both") == FILLED_BY_ADMIN
            else "editable"
        )
        # Hydrate builtin rows from the registry (effective type, label fallback,
        # choices) so the FE never needs registry knowledge. Builtin rows store
        # null field_type/choices; the registry is authoritative.
        if getattr(instance, "source", "custom") == SOURCE_BUILTIN:
            spec = get_builtin_field(instance.entity_type, instance.field_key)
            if spec is not None:
                ret["field_type"] = spec.field_type
                if not ret.get("field_label"):
                    ret["field_label"] = spec.default_label
                resolved = spec.resolve_choices()
                if resolved is not None:
                    ret["choices"] = resolved
        return ret

    def validate(self, attrs):
        attrs.setdefault("entity_type", ENTITY_TYPE_USER)
        instance = getattr(self, "instance", None)
        ft = attrs.get("field_type", getattr(instance, "field_type", None))
        choices = attrs.get("choices")
        if choices is None and instance is not None:
            choices = instance.choices

        rules = attrs.get("validation_rules")
        if rules is None and instance is not None:
            rules = instance.validation_rules

        if ft in (
            FieldDefinition.FieldType.CHOICE,
            FieldDefinition.FieldType.MULTICHOICE,
        ):
            _validate_choices_json(choices)
        elif ft == FieldDefinition.FieldType.ATTACHMENT:
            if attrs.get("choices"):
                raise ValidationError({"choices": "Not allowed for attachment type."})
            normalized_rules = validate_attachment_definition_rules(rules)
            attrs["validation_rules"] = normalized_rules
            attrs["is_filterable"] = False
            required_at = attrs.get(
                "required_at", getattr(instance, "required_at", "never")
            )
            if required_at == REQUIRED_AT_REGISTRATION:
                raise ValidationError(
                    {
                        "required_at": (
                            "Attachment fields cannot be required at registration."
                        )
                    }
                )
        else:
            if attrs.get("choices"):
                raise ValidationError({"choices": "Only allowed for choice or multichoice types."})

        pattern = (rules or {}).get("pattern")
        if pattern is not None:
            if not isinstance(pattern, str) or len(pattern) > MAX_PATTERN_LENGTH:
                raise ValidationError(
                    {
                        "validation_rules": (
                            f"pattern must be a string of at most "
                            f"{MAX_PATTERN_LENGTH} characters."
                        )
                    }
                )
            try:
                regex.compile(pattern)
            except regex.error:
                raise ValidationError(
                    {"validation_rules": "pattern is not a valid regular expression."}
                )

        if instance is not None and "field_key" in attrs:
            if attrs["field_key"] != instance.field_key:
                raise ValidationError({"field_key": "field_key cannot be changed."})

        if instance is not None and "field_type" in attrs:
            if attrs["field_type"] != instance.field_type:
                raise ValidationError({"field_type": "field_type cannot be changed."})

        if (
            ft == FieldDefinition.FieldType.ATTACHMENT
            or getattr(instance, "field_type", None)
            == FieldDefinition.FieldType.ATTACHMENT
        ):
            if attrs.get("is_filterable"):
                raise ValidationError(
                    {"is_filterable": "Attachment fields cannot be filterable."}
                )
            if attrs.get("required_at") == REQUIRED_AT_REGISTRATION or (
                instance is not None
                and attrs.get("required_at", instance.required_at) == REQUIRED_AT_REGISTRATION
            ):
                raise ValidationError(
                    {
                        "required_at": (
                            "Attachment fields cannot be required at registration."
                        )
                    }
                )
            if ft == FieldDefinition.FieldType.ATTACHMENT and not attrs.get(
                "validation_rules"
            ):
                if instance is None or not instance.validation_rules:
                    attrs["validation_rules"] = dict(DEFAULT_ATTACHMENT_RULES)

        # Validate roles against User.UserRole (lazy import to avoid circular import).
        roles = attrs.get("roles")
        if roles:
            from app_auth.models import User

            allowed = {r for r, _ in User.UserRole.choices}
            bad = [r for r in roles if r not in allowed]
            if bad:
                raise ValidationError({"roles": f"Unknown role(s): {', '.join(bad)}"})

        required_at = attrs.get(
            "required_at", getattr(instance, "required_at", "never")
        )
        if required_at == REQUIRED_AT_REGISTRATION:
            if "show_on_create" in attrs and attrs["show_on_create"] is False:
                raise ValidationError(
                    {"show_on_create": "Registration-stage fields must show on create."}
                )
            attrs["show_on_create"] = True

        # Built-in rows: lock identity/type attributes.
        if instance is not None and getattr(instance, "source", "custom") == "builtin":
            for locked in ("source", "field_key", "field_type", "entity_type"):
                if locked in attrs and attrs[locked] != getattr(instance, locked):
                    raise ValidationError(
                        {locked: f"{locked} cannot be changed on a built-in field."}
                    )

        show_c = attrs.get("show_on_create", getattr(instance, "show_on_create", True))
        show_e = attrs.get("show_on_edit", getattr(instance, "show_on_edit", True))
        show_d = attrs.get("show_on_detail", getattr(instance, "show_on_detail", True))
        if not any([show_c, show_e, show_d]):
            raise ValidationError(
                "At least one of show_on_create, show_on_edit, or show_on_detail must be true."
            )

        entity_type = attrs.get(
            "entity_type", getattr(instance, "entity_type", ENTITY_TYPE_USER)
        )
        field_key = attrs.get("field_key", getattr(instance, "field_key", None))
        field_label = attrs.get(
            "field_label", getattr(instance, "field_label", None)
        )
        exclude_pk = instance.pk if instance is not None else None
        if _has_active_duplicate(
            entity_type=entity_type,
            field_name="field_key",
            value=field_key,
            exclude_pk=exclude_pk,
        ):
            raise ValidationError(
                {"field_key": "A field with this key already exists."}
            )
        if _has_active_duplicate(
            entity_type=entity_type,
            field_name="field_label",
            value=field_label,
            exclude_pk=exclude_pk,
        ):
            raise ValidationError(
                {"field_label": "A field with this label already exists."}
            )
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None)
        if tenant is None:
            raise ValidationError("Missing tenant on request.")
        entity_type = validated_data.get("entity_type", ENTITY_TYPE_USER)
        count = FieldDefinition.objects.filter(
            entity_type=entity_type,
            is_active=True,
        ).count()
        cap = tenant.max_custom_field_definitions_per_entity
        if count >= cap:
            raise ValidationError(
                f"Maximum number of active custom field definitions reached ({cap})."
            )
        reused = reactivate_or_conflict(
            entity_type=entity_type,
            field_key=validated_data.get("field_key"),
            field_type=validated_data.get("field_type"),
            validated_data=validated_data,
        )
        if reused is not None:
            return reused
        validated_data.setdefault("entity_type", ENTITY_TYPE_USER)
        return super().create(validated_data)

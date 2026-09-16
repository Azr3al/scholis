from __future__ import annotations

from rest_framework import serializers

from app_auth.models import UserTeachingSubject
from app_course.models import Category, ProgramLevel, Subject

MAX_TEACHING_SUBJECTS_PER_USER = 200


class UserTeachingSubjectSubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ("id", "name")


class UserTeachingSubjectCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ("id", "name")


class UserTeachingSubjectLevelSerializer(serializers.ModelSerializer):
    default_category = UserTeachingSubjectCategorySerializer(read_only=True)

    class Meta:
        model = ProgramLevel
        fields = ("id", "name", "default_category")


class UserTeachingSubjectSerializer(serializers.ModelSerializer):
    subject_id = serializers.PrimaryKeyRelatedField(
        source="subject",
        queryset=Subject.objects.all(),
        required=False,
        allow_null=True,
    )
    program_level_id = serializers.PrimaryKeyRelatedField(
        source="program_level",
        queryset=ProgramLevel.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    category_id = serializers.PrimaryKeyRelatedField(
        source="category",
        queryset=Category.objects.all(),
        required=False,
        allow_null=True,
    )
    subject = UserTeachingSubjectSubjectSerializer(read_only=True, allow_null=True)
    program_level = UserTeachingSubjectLevelSerializer(read_only=True, allow_null=True)
    category = UserTeachingSubjectCategorySerializer(read_only=True, allow_null=True)

    class Meta:
        model = UserTeachingSubject
        fields = (
            "id",
            "entity_type",
            "subject_id",
            "program_level_id",
            "category_id",
            "subject",
            "program_level",
            "category",
            "sort_order",
            "created_at",
        )
        read_only_fields = (
            "id",
            "created_at",
            "subject",
            "program_level",
            "category",
        )

    def _allow_level_category_search(self) -> bool:
        tenant = self.context.get("tenant")
        if tenant is None:
            return False
        return bool(getattr(tenant, "teaching_subjects_allow_level_category_search", False))

    def validate(self, attrs):
        entity_type = attrs.get("entity_type") or getattr(
            self.instance, "entity_type", None
        )
        if entity_type is None:
            raise serializers.ValidationError({"entity_type": "This field is required."})

        subject = attrs.get("subject", serializers.empty)
        program_level = attrs.get("program_level", serializers.empty)
        category = attrs.get("category", serializers.empty)

        if self.instance is not None:
            if subject is serializers.empty:
                subject = self.instance.subject
            if program_level is serializers.empty:
                program_level = self.instance.program_level
            if category is serializers.empty:
                category = self.instance.category
        else:
            if subject is serializers.empty:
                subject = None
            if program_level is serializers.empty:
                program_level = None
            if category is serializers.empty:
                category = None

        if entity_type == UserTeachingSubject.EntityType.SUBJECT:
            if subject is None:
                raise serializers.ValidationError({"subject_id": "Subject is required."})
            attrs["subject"] = subject
            attrs["program_level"] = None
            attrs["category"] = None
        elif entity_type == UserTeachingSubject.EntityType.PROGRAM_LEVEL:
            if not self._allow_level_category_search():
                raise serializers.ValidationError(
                    "Program levels cannot be added for this school."
                )
            if program_level is None:
                raise serializers.ValidationError(
                    {"program_level_id": "Program level is required."}
                )
            attrs["program_level"] = program_level
            attrs["subject"] = None
            attrs["category"] = None
        elif entity_type == UserTeachingSubject.EntityType.CATEGORY:
            if not self._allow_level_category_search():
                raise serializers.ValidationError(
                    "Categories cannot be added for this school."
                )
            if category is None:
                raise serializers.ValidationError({"category_id": "Category is required."})
            attrs["category"] = category
            attrs["subject"] = None
            attrs["program_level"] = None
        else:
            raise serializers.ValidationError({"entity_type": "Invalid entity type."})

        user = self.context.get("subject_user")
        if user is None:
            return attrs

        duplicate_qs = UserTeachingSubject.objects.filter(
            user=user,
            entity_type=entity_type,
        )
        if entity_type == UserTeachingSubject.EntityType.SUBJECT:
            duplicate_qs = duplicate_qs.filter(subject=attrs["subject"])
        elif entity_type == UserTeachingSubject.EntityType.PROGRAM_LEVEL:
            duplicate_qs = duplicate_qs.filter(program_level=attrs["program_level"])
        else:
            duplicate_qs = duplicate_qs.filter(category=attrs["category"])

        if self.instance is not None:
            duplicate_qs = duplicate_qs.exclude(pk=self.instance.pk)
        if duplicate_qs.exists():
            raise serializers.ValidationError("This item is already on the list.")

        return attrs

    def create(self, validated_data):
        user = self.context["subject_user"]
        count = UserTeachingSubject.objects.filter(user=user).count()
        if count >= MAX_TEACHING_SUBJECTS_PER_USER:
            raise serializers.ValidationError("Maximum teaching subjects limit reached.")
        validated_data["user"] = user
        return super().create(validated_data)

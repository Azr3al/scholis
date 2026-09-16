import pytz
from datetime import datetime
from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework import serializers

from app_auth.models import User
from app_auth.serializers import UserSerializer
from app_custom_fields.constants import ENTITY_TYPE_COURSE
from app_custom_fields.validation import (
    representation_custom_data,
    validate_custom_data_for_write,
)
from app_course import models
from app_course.course_member_counts import refresh_course_member_counts_now
from app_course.course_status import (
    clear_ended_override_on_date_change,
    compute_effective_status,
)
from app_course.rate_utils import get_hourly_rate_for_teacher_course, get_rate_from_user_course_rates
from app_course.teams_organizer import (
    get_course_primary_teacher_user,
    get_course_teams_organizer_user,
)
from app_microsoft.meeting_helpers import (
    graph_organizer_user_id_for_course,
    schedule_update_course_meeting_attendees,
)
from app_microsoft.flows import CreateTeamFlow
from app_microsoft.team_provisioning_helpers import (
    create_course_team_async,
    schedule_post_team_provisioning,
    tenant_syncs_course_team_roster,
)
from app_microsoft.graph_wrapper.group import MSGroup
from utilitas.serializers import BaseModelSerializer
from django.db import transaction
from app_course.zoom_manual_meeting import resolve_manual_zoom_meeting_for_tenant
from app_course.youtube import extract_youtube_video_id, normalize_youtube_url
from app_course.course_program_validation import validate_course_program_fields


class CategorySerializer(BaseModelSerializer):
    class Meta:
        model = models.Category
        fields = "__all__"
        extra_kwargs = {
            "search_vector": {"read_only": True},
        }
        expandable_fields = {
            "courses": ("app_course.serializers.CourseSerializer", {"many": True}),
        }


class CampusSerializer(BaseModelSerializer):
    class Meta:
        model = models.Campus
        fields = "__all__"
        expandable_fields = {
            "courses": ("app_course.serializers.CourseSerializer", {"many": True}),
        }


class SubjectSerializer(BaseModelSerializer):
    class Meta:
        model = models.Subject
        fields = "__all__"
        expandable_fields = {
            "courses": ("app_course.serializers.CourseSerializer", {"many": True}),
        }


class ProgramSerializer(BaseModelSerializer):
    intake_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Program
        fields = "__all__"
        expandable_fields = {
            "levels": ("app_course.serializers.ProgramLevelSerializer", {"many": True}),
            "program_subjects": (
                "app_course.serializers.ProgramSubjectSerializer",
                {"many": True},
            ),
            "intakes": ("app_course.serializers.IntakeSerializer", {"many": True}),
            "courses": ("app_course.serializers.CourseSerializer", {"many": True}),
        }

    def get_intake_count(self, obj):
        if self.context.get("omit_nested_fk_counts"):
            return None
        if hasattr(obj, "_intake_count"):
            return obj._intake_count
        return obj.intakes.count()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance and self.instance.is_protected:
            if attrs.get("is_protected") is False:
                raise ValidationError(
                    {"is_protected": "Cannot remove protection from a protected program."}
                )
        from app_course.session_credit_services import (
            validate_session_credit_program_attrs,
        )

        validate_session_credit_program_attrs(attrs, self.instance)
        return attrs

    def update(self, instance, validated_data):
        turning_on = (
            validated_data.get("is_session_credit_scheduling") is True
            and not instance.is_session_credit_scheduling
        )
        instance = super().update(instance, validated_data)
        if turning_on:
            from app_course.session_credit_services import (
                backfill_max_sessions_for_program,
            )

            backfill_max_sessions_for_program(instance)
        return instance


class ProgramSubjectSerializer(BaseModelSerializer):
    class Meta:
        model = models.ProgramSubject
        fields = "__all__"
        expandable_fields = {
            "program": "app_course.serializers.ProgramSerializer",
            "subject": "app_course.serializers.SubjectSerializer",
        }


class ProgramLevelSubjectSerializer(BaseModelSerializer):
    class Meta:
        model = models.ProgramLevelSubject
        fields = "__all__"
        expandable_fields = {
            "level": "app_course.serializers.ProgramLevelSerializer",
            "subject": "app_course.serializers.SubjectSerializer",
        }


class ProgramLevelSerializer(BaseModelSerializer):
    class Meta:
        model = models.ProgramLevel
        fields = "__all__"
        expandable_fields = {
            "program": "app_course.serializers.ProgramSerializer",
            "default_category": "app_course.serializers.CategorySerializer",
            "sections": (
                "app_course.serializers.ProgramLevelSectionSerializer",
                {"many": True},
            ),
        }


class ProgramLevelSectionSerializer(BaseModelSerializer):
    class Meta:
        model = models.ProgramLevelSection
        fields = "__all__"
        expandable_fields = {
            "level": "app_course.serializers.ProgramLevelSerializer",
            "default_teacher": "app_auth.serializers.UserSerializer",
            "default_campus": "app_course.serializers.CampusSerializer",
        }


class IntakeSerializer(BaseModelSerializer):
    courses_count = serializers.SerializerMethodField()

    class Meta:
        model = models.Intake
        fields = "__all__"
        expandable_fields = {
            "program": "app_course.serializers.ProgramSerializer",
            "courses": ("app_course.serializers.CourseSerializer", {"many": True}),
        }

    def validate(self, attrs):
        program = attrs.get("program") or getattr(self.instance, "program", None)
        name = attrs.get("name") or getattr(self.instance, "name", None)
        if program is not None and name:
            qs = models.Intake.objects.filter(program=program, name=name)
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {
                        "name": (
                            f'An intake named "{name}" already exists for this program.'
                        )
                    }
                )

        generation_defaults = attrs.get("generation_defaults")
        if generation_defaults is not None and not isinstance(generation_defaults, dict):
            raise serializers.ValidationError(
                {"generation_defaults": "Must be an object."}
            )

        return super().validate(attrs)

    def get_courses_count(self, obj):
        if self.context.get("omit_nested_fk_counts"):
            return None
        if hasattr(obj, "_courses_count"):
            return obj._courses_count
        return obj.courses.count()


class CourseSubjectSerializer(BaseModelSerializer):
    class Meta:
        model = models.CourseSubject
        fields = "__all__"
        expandable_fields = {
            "course": "app_course.serializers.CourseSerializer",
            "subject": "app_course.serializers.SubjectSerializer",
        }


def _serialize_time_for_api(value):
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _get_first_event_for_course(obj):
    """Single row for time_from/time_to when queryset was not annotated (e.g. detail view)."""
    if hasattr(obj, "_cached_first_event_for_serializer"):
        return obj._cached_first_event_for_serializer
    ev = (
        models.Event.objects.filter(course_id=obj.pk)
        .order_by("date", "time_from")
        .only("time_from", "time_to")
        .first()
    )
    obj._cached_first_event_for_serializer = ev
    return ev


def _get_nearest_event_for_course(obj):
    """Soonest upcoming event (date >= now); most recent past event if the course has ended."""
    if hasattr(obj, "_cached_nearest_event_for_serializer"):
        return obj._cached_nearest_event_for_serializer
    now = timezone.now()
    ev = (
        models.Event.objects.filter(course_id=obj.pk, date__gte=now)
        .order_by("date", "time_from")
        .only("time_from", "time_to")
        .first()
    )
    if ev is None:
        ev = (
            models.Event.objects.filter(course_id=obj.pk, date__lt=now)
            .order_by("-date", "-time_from")
            .only("time_from", "time_to")
            .first()
        )
    obj._cached_nearest_event_for_serializer = ev
    return ev


class CourseSerializer(BaseModelSerializer):
    course_type = serializers.CharField(allow_null=True, allow_blank=True, required=False)
    primary_teacher = serializers.SerializerMethodField()
    has_teams_meeting_organizer = serializers.SerializerMethodField()
    teams_meeting_organizer_unresolved = serializers.SerializerMethodField()
    first_event_time_from = serializers.SerializerMethodField()
    first_event_time_to = serializers.SerializerMethodField()
    nearest_event_time_from = serializers.SerializerMethodField()
    nearest_event_time_to = serializers.SerializerMethodField()

    class Meta:
        model = models.Course
        fields = "__all__"
        extra_kwargs = {
            "course_type": {"required": False},
            "meeting_scheduled_at": {"read_only": True},
            "student_count": {"read_only": True},
            "main_teacher_count": {"read_only": True},
            "assistant_teacher_count": {"read_only": True},
            "custom_data": {"required": False},
            "zoom_personal_user": {"read_only": True},
            "status": {"read_only": True},
            "status_override": {"read_only": True},
            "status_override_reason": {"read_only": True},
            "status_override_at": {"read_only": True},
            "status_override_by": {"read_only": True},
        }
        expandable_fields = {
            "events": ("app_course.serializers.EventSerializer", {"many": True}),
            "user_courses": (
                "app_course.serializers.UserCourseSerializer",
                {"many": True},
            ),
            "category": ("app_course.serializers.CategorySerializer",),
            "course_histories": (
                "app_course.serializers.CourseHistorySerializer",
                {"many": True},
            ),
            "payment_plan": (
                "app_finance.serializers.PaymentPlanSerializer",
                {"many": False},
            ),
            "join_requests": (
                "app_course.serializers.CourseJoinRequestSerializer", {"many": True}
            ),
            "payment_courses": (
                "app_finance.serializers.PaymentCourseSerializer", {"many": True}
            ),
            "created_by": "app_auth.serializers.UserSerializer",
            "subject": ("app_course.serializers.SubjectSerializer",),
            "program": ("app_course.serializers.ProgramSerializer",),
            "intake": ("app_course.serializers.IntakeSerializer",),
            "level": ("app_course.serializers.ProgramLevelSerializer",),
            "section": ("app_course.serializers.ProgramLevelSectionSerializer",),
            "course_subjects": (
                "app_course.serializers.CourseSubjectSerializer",
                {"many": True},
            ),
        }

    def _search_text_for_create(self, validated_data) -> str | None:
        """
        Return search_text from validated FK instances, or None to keep post_save refresh.
        None only when we cannot safely resolve names for FKs that are set.
        """
        from app_course.search_signals import compute_course_search_text_from_fks

        fks = {
            "subject": validated_data.get("subject"),
            "level": validated_data.get("level"),
            "section": validated_data.get("section"),
            "category": validated_data.get("category"),
            "program": validated_data.get("program"),
            "campus": validated_data.get("campus"),
            "intake": validated_data.get("intake"),
        }
        for _key, obj in fks.items():
            if obj is not None and not getattr(obj, "name", None):
                return None
        return compute_course_search_text_from_fks(**fks)

    def _create_course_row(self, validated_data, *, skip_search_text_refresh: bool):
        """Create Course like ModelSerializer.create, with optional refresh skip."""
        from app_course.search_signals import SKIP_SEARCH_TEXT_REFRESH_ATTR

        ModelClass = self.Meta.model
        instance = ModelClass(**validated_data)
        if skip_search_text_refresh:
            setattr(instance, SKIP_SEARCH_TEXT_REFRESH_ATTR, True)
        instance.save()
        return instance

    def create(self, validated_data):
        if validated_data.get("custom_data") is None:
            validated_data["custom_data"] = {}
        request = self.context.get("request")
        if request and "created_by" not in validated_data:
            validated_data["created_by"] = User.get_user_from_request(request)

        validated_data.pop("create_microsoft_team", None)

        defer_team_provisioning = self.context.get("defer_team_provisioning", False)
        flow = None
        tenant = request.tenant if request else None
        create_microsoft_team = bool(
            tenant
            and tenant.is_microsoft_on
            and tenant.is_teams_creation_enabled
        )
        if (
            request
            and tenant.is_microsoft_on
            and tenant.is_teams_creation_enabled
            and create_microsoft_team
            and not defer_team_provisioning
        ):
            flow = CreateTeamFlow(validated_data["title"], tenant)
            res = flow.start()
            validated_data["microsoft_group_id"] = res["group_id"]
            validated_data["microsoft_channel_id"] = res.get("channel_id")

        search_text = self._search_text_for_create(validated_data)
        skip_refresh = False
        if search_text is not None:
            validated_data["search_text"] = search_text
            skip_refresh = True

        with transaction.atomic():
            instance = self._create_course_row(
                validated_data, skip_search_text_refresh=skip_refresh
            )

            from app_course.course_scoping import assign_creator_as_teacher_if_applicable

            assign_creator_as_teacher_if_applicable(
                validated_data.get("created_by"),
                instance,
                tenant=tenant,
            )

        if (
            request
            and tenant.is_microsoft_on
            and tenant.is_teams_creation_enabled
            and create_microsoft_team
        ):
            if defer_team_provisioning:
                schema_name = tenant.schema_name
                course_id = instance.id
                transaction.on_commit(
                    lambda: create_course_team_async.delay(course_id, schema_name)
                )
            elif flow and instance.microsoft_group_id:
                from app_microsoft.scope_team_sync import (
                    sync_scoped_team_owners_for_course_async,
                )

                schema_name = tenant.schema_name
                course_id = instance.id
                transaction.on_commit(
                    lambda: sync_scoped_team_owners_for_course_async.delay(
                        course_id, schema_name
                    )
                )
                schedule_post_team_provisioning(instance, tenant, flow)

        from app_course.course_search_queryset import (
            attach_course_create_representation_caches,
        )

        attach_course_create_representation_caches(instance)
        return instance

    def to_representation(self, instance):
        request = self.context.get("request")
        if request is not None:
            from app_custom_fields.validation import prime_custom_field_representation_cache

            prime_custom_field_representation_cache(request)
        ret = super().to_representation(instance)
        ret["status"] = compute_effective_status(instance)
        ret["custom_data"] = representation_custom_data(
            ENTITY_TYPE_COURSE,
            getattr(instance, "custom_data", None),
            self.context.get("request"),
        )
        tenant = getattr(request, "tenant", None) if request else None
        ret["microsoft_status"] = self._microsoft_status(instance, tenant)
        return ret

    @staticmethod
    def _microsoft_status(instance, tenant) -> str:
        """Lightweight status for UI chips (no Graph calls)."""
        if not tenant or not getattr(tenant, "is_microsoft_on", False):
            return "ms_off"
        if not getattr(tenant, "is_teams_creation_enabled", True):
            return "teams_disabled"
        if getattr(instance, "microsoft_group_id", None):
            return "linked"
        return "not_created"

    def validate(self, attrs):
        inst = self.instance
        for blocked in (
            "status",
            "status_override",
            "status_override_reason",
            "status_override_at",
            "status_override_by",
        ):
            if blocked in attrs:
                raise ValidationError(
                    {blocked: "Use course status actions to change status."}
                )
        request = self.context.get("request")
        actor_user = User.get_user_from_request(request) if request is not None else None
        if inst is None:
            incoming_cd = attrs.get("custom_data", {})
            if incoming_cd is None:
                incoming_cd = {}
            attrs["custom_data"] = validate_custom_data_for_write(
                entity_type=ENTITY_TYPE_COURSE,
                incoming=incoming_cd,
                existing={},
                partial=False,
                actor_user=actor_user,
            )
        elif "custom_data" in attrs:
            attrs["custom_data"] = validate_custom_data_for_write(
                entity_type=ENTITY_TYPE_COURSE,
                incoming=attrs["custom_data"],
                existing=inst.custom_data or {},
                partial=self.partial,
                actor_user=actor_user,
            )
        attrs = super().validate(attrs)
        if attrs.get("custom_data") is None:
            attrs["custom_data"] = {}

        request = self.context.get("request")
        src = attrs.get("zoom_meeting_source")
        if src == models.Course.ZoomMeetingSource.PERSONAL:
            db_user = (
                User.get_user_from_request(request) if request is not None else None
            )
            if not db_user:
                raise ValidationError(
                    {
                        "zoom_meeting_source": (
                            "You must be signed in to switch this class to personal Zoom."
                        )
                    }
                )
            if User.UserRole.STUDENT in db_user.roles:
                raise ValidationError(
                    {
                        "zoom_meeting_source": (
                            "Students cannot set a class to use personal Zoom."
                        )
                    }
                )
            attrs["zoom_personal_user"] = db_user
        elif src == models.Course.ZoomMeetingSource.SCHOOL:
            attrs["zoom_personal_user"] = None

        attrs = self._validate_zoom_meeting_fields(attrs)
        attrs = validate_course_program_fields(
            attrs, instance=inst, partial=bool(self.partial)
        )

        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        mandatory = (
            bool(getattr(tenant, "is_payment_plan_mandatory", False))
            if tenant
            else False
        )
        if mandatory and (inst is None or "payment_plan" in attrs):
            plan = attrs.get("payment_plan")
            plan_id = getattr(plan, "pk", plan) if plan is not None else None
            if not plan_id:
                raise ValidationError(
                    {
                        "payment_plan": (
                            "This organization requires a payment plan on every course."
                        )
                    }
                )

        exam_required = (
            bool(getattr(tenant, "is_exam_board_in_course_enabled", False))
            if tenant
            else False
        )
        if exam_required and not self.context.get("skip_mandatory_exam_fields"):
            errors = {}
            for field, message in (
                (
                    "exam_session_date",
                    "This organization requires an exam session on every course.",
                ),
                (
                    "exam_board",
                    "This organization requires an exam board on every course.",
                ),
            ):
                if inst is not None and field not in attrs:
                    continue
                if not attrs.get(field):
                    errors[field] = message
            if errors:
                raise ValidationError(errors)

        program = attrs.get("program") or getattr(inst, "program", None)
        if isinstance(program, int):
            program = models.Program.objects.filter(id=program).first()
        if program is not None and not program.is_session_credit_scheduling:
            if inst is None:
                attrs["max_sessions"] = None
        elif program is not None and program.is_session_credit_scheduling:
            max_sessions = attrs.get(
                "max_sessions",
                getattr(inst, "max_sessions", None),
            )
            if inst is None and max_sessions is None:
                raise ValidationError(
                    {"max_sessions": "This program requires a max session count."}
                )
            if inst is None and max_sessions is not None and max_sessions < 1:
                raise ValidationError({"max_sessions": "Must be at least 1."})
            if max_sessions is not None and max_sessions > 365:
                raise ValidationError(
                    {"max_sessions": "Must be between 0 and 365."}
                )
            if (
                inst is not None
                and "max_sessions" in attrs
                and not self.context.get("session_credit_events_pending")
            ):
                current_count = models.Event.objects.filter(
                    course_id=inst.id,
                    is_substitution_reserve=False,
                ).count()
                if (
                    attrs["max_sessions"] is not None
                    and attrs["max_sessions"] < current_count
                ):
                    raise ValidationError(
                        {
                            "max_sessions": (
                                "Cannot set max sessions below the current number of sessions."
                            )
                        }
                    )

        return attrs

    def _validate_zoom_meeting_fields(self, attrs):
        incoming_meeting_id = (attrs.get("zoom_meeting_id") or "").strip()
        if not incoming_meeting_id:
            return attrs

        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        if tenant is None:
            return attrs

        inst = self.instance
        src = attrs.get("zoom_meeting_source")
        if src is None and inst is not None:
            src = inst.zoom_meeting_source
        elif src is None:
            src = models.Course.ZoomMeetingSource.SCHOOL

        if src == models.Course.ZoomMeetingSource.PERSONAL:
            oauth_user = attrs.get("zoom_personal_user")
            if oauth_user is None and inst is not None:
                oauth_user = inst.zoom_personal_user
            personal_oauth = (
                getattr(oauth_user, "zoom_oauth", None) if oauth_user is not None else None
            )
            resolved = resolve_manual_zoom_meeting_for_tenant(
                tenant,
                incoming_meeting_id,
                zoom_account_id=(attrs.get("zoom_account_id") or "").strip() or None,
                zoom_meeting_source=models.Course.ZoomMeetingSource.PERSONAL,
                personal_oauth=personal_oauth,
            )
        else:
            resolved = resolve_manual_zoom_meeting_for_tenant(
                tenant,
                incoming_meeting_id,
                zoom_account_id=(attrs.get("zoom_account_id") or "").strip() or None,
            )
        attrs["zoom_account_id"] = resolved["zoom_account_id"]
        attrs["zoom_meeting_uuid"] = resolved["zoom_meeting_uuid"]
        attrs["zoom_meeting_host_id"] = resolved["zoom_meeting_host_id"]
        return attrs

    def get_primary_teacher(self, obj):
        """Roster primary teacher (same priority as Teams organizer, without Microsoft filter)."""
        user = get_course_primary_teacher_user(obj, require_microsoft=False)
        if not user:
            return None
        return {"id": user.id, "name": user.name, "email": user.email}

    def get_first_event_time_from(self, obj):
        if hasattr(obj, "_first_event_time_from"):
            annotated = obj._first_event_time_from
            return (
                _serialize_time_for_api(annotated) if annotated is not None else None
            )
        ev = _get_first_event_for_course(obj)
        return _serialize_time_for_api(ev.time_from) if ev else None

    def get_first_event_time_to(self, obj):
        if hasattr(obj, "_first_event_time_to"):
            annotated = obj._first_event_time_to
            return (
                _serialize_time_for_api(annotated) if annotated is not None else None
            )
        ev = _get_first_event_for_course(obj)
        return _serialize_time_for_api(ev.time_to) if ev else None

    def get_nearest_event_time_from(self, obj):
        ev = _get_nearest_event_for_course(obj)
        return _serialize_time_for_api(ev.time_from) if ev else None

    def get_nearest_event_time_to(self, obj):
        ev = _get_nearest_event_for_course(obj)
        return _serialize_time_for_api(ev.time_to) if ev else None

    def get_has_teams_meeting_organizer(self, obj):
        """True if a teacher on the roster can host a Teams meeting (has microsoft_id)."""
        return bool(get_course_teams_organizer_user(obj))

    def get_teams_meeting_organizer_unresolved(self, obj):
        """
        True when the class has a Teams meeting id but Graph organizer cannot be resolved
        (no stored organizer id and no primary teacher with microsoft_id).
        """
        if not (obj.microsoft_meeting_id and str(obj.microsoft_meeting_id).strip()):
            return False
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        if not tenant:
            return False
        return graph_organizer_user_id_for_course(obj, tenant) is None

    def update(self, instance, validated_data):
        new_program = validated_data.get("program", instance.program)
        if new_program.id != instance.program_id:
            raise ValidationError(
                {"program": "Cannot change a course's program."}
            )
        start_date = validated_data.get("start_date")
        end_date = validated_data.get("end_date")
        if start_date is None:
            start_date = instance.start_date
        if end_date is None:
            end_date = instance.end_date
        events = (
            models.Event.objects.filter(course_id=instance.id)
            .filter(Q(date__lt=start_date) | Q(date__gt=end_date))
            .all()
        )
        events.delete()
        dates_changed = (
            start_date != instance.start_date or end_date != instance.end_date
        )
        prev_category_id = instance.category_id
        instance = super().update(instance, validated_data)
        if dates_changed:
            clear_ended_override_on_date_change(instance)
            instance.refresh_from_db()
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        if tenant is not None and instance.category_id != prev_category_id:
            from app_microsoft.scope_team_sync import sync_scoped_team_owners_for_course_async

            sync_scoped_team_owners_for_course_async.delay(
                instance.id, tenant.schema_name
            )
        refresh_course_member_counts_now([instance.id])
        instance.refresh_from_db(
            fields=["student_count", "main_teacher_count", "assistant_teacher_count"]
        )
        return instance


class CourseReactivateSerializer(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()

    def validate(self, attrs):
        if attrs["end_date"] < attrs["start_date"]:
            raise ValidationError(
                {"end_date": "End date cannot be before start date."}
            )
        return attrs


class AssignedAsRoleSerializer(BaseModelSerializer):
    class Meta:
        model = models.AssignedAsRole
        fields = "__all__"

    def validate(self, attrs):
        from app_course.course_role_policy import assert_assigned_as_role_seniority_unique
        from app_course.substitute_policy import (
            assert_substitute_role_valid,
            substitute_teachers_enabled,
        )

        instance = getattr(self, "instance", None)
        seniority = attrs.get(
            "seniority",
            getattr(instance, "seniority", None),
        )
        is_substitute = attrs.get(
            "is_substitute",
            bool(getattr(instance, "is_substitute", False)),
        )
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        if is_substitute and not substitute_teachers_enabled(tenant):
            raise ValidationError(
                {
                    "is_substitute": (
                        "Substitute course roles are not enabled for this school."
                    )
                }
            )
        assert_substitute_role_valid(is_substitute=is_substitute, seniority=seniority)
        assert_assigned_as_role_seniority_unique(
            seniority=seniority,
            is_substitute=is_substitute,
            exclude_pk=instance.pk if instance else None,
        )
        return attrs


def handle_microsoft_group_membership(user_course: models.UserCourse, add: bool, tenant):
    if not tenant_syncs_course_team_roster(tenant):
        return
    group = MSGroup(tenant)
    try:
        if add:
            x = group.add_member(user_course.user.microsoft_id, user_course.course.microsoft_group_id, "members")
        else:
            x = group.remove_member(user_course.course.microsoft_group_id, user_course.user.microsoft_id,
                                    "members")
    except Exception as e:
        print("Error updating member in MS Group:", str(e))


class UserCourseSerializer(BaseModelSerializer):
    class Meta:
        model = models.UserCourse
        fields = "__all__"
        expandable_fields = {
            "user": "app_auth.serializers.UserSerializer",
            "course": "app_course.serializers.CourseSerializer",
            "assigned_as_role": "app_course.serializers.AssignedAsRoleSerializer",
            "user_payments": (
                "app_finance.serializers.UserPaymentSerializer",
                {"many": True},
            ),
        }

    def create(self, validated_data):
        user = validated_data.get("user")
        course = validated_data.get("course")
        assigned_as = validated_data.get("assigned_as")
        if (
            assigned_as == models.UserCourse.AssignedAs.TEACHER
            and user
            and course
            and "hourly_rate" not in validated_data
        ):
            rate = get_rate_from_user_course_rates(user, course)
            if rate is not None:
                validated_data["hourly_rate"] = rate
        instance = super().create(validated_data)
        if (
            assigned_as == models.UserCourse.AssignedAs.TEACHER
            and course
            and self.context.get("request")
        ):
            tenant = self.context["request"].tenant
            schedule_update_course_meeting_attendees(course, tenant)
        refresh_course_member_counts_now([instance.course_id])
        return instance

    def update(self, instance, validated_data):
        request = self.context.get("request")
        old_course_id = instance.course_id
        instance = super().update(instance, validated_data)
        refresh_course_member_counts_now({old_course_id, instance.course_id})
        return instance


class CachedPkRelatedField(serializers.PrimaryKeyRelatedField):
    """
    Reuse already loaded course instead of querying again for each event
    """

    def to_internal_value(self, data):
        cached_obj = self.context.get("cached_object")
        if cached_obj is not None:
            try:
                if int(data) == int(getattr(cached_obj, "pk", None)):
                    return cached_obj
            except Exception:
                pass
        return super().to_internal_value(data)


class EventSerializer(BaseModelSerializer):
    course = CachedPkRelatedField(queryset=models.Course.objects.all())
    has_checkin = serializers.BooleanField(read_only=True, default=False)

    class Meta:
        model = models.Event
        fields = "__all__"
        expandable_fields = {
            "course": "app_course.serializers.CourseSerializer",
            "daily_note": "app_course.serializers.DailyNoteSerializer",
        }


class AssignmentSerializer(BaseModelSerializer):
    class Meta:
        model = models.Assignment
        fields = "__all__"
        expandable_fields = {
            "attachments": ("app_attachment.serializers.AttachmentSerializer", {"many": True}),
            "course": "app_course.serializers.CourseSerializer",
            "submissions": (
                "app_course.serializers.SubmissionSerializer",
                {"many": True},
            ),
        }


class SubmissionSerializer(BaseModelSerializer):
    class Meta:
        model = models.Submission
        fields = "__all__"
        expandable_fields = {
            "assignment": "app_course.serializers.AssignmentSerializer",
            "created_by": "app_auth.serializers.UserSerializer",
            "attachments": ("app_attachment.serializers.AttachmentSerializer", {"many": True}),
        }
        extra_kwargs = {
            "created_by": {"required": False},
            "attempt_count": {"read_only": True},
        }

    def create(self, validated_data):
        validated_data["created_by"] = User.objects.get(email=self.context["request"].user.id)
        if validated_data["assignment"].due_datetime < datetime.now(tz=pytz.UTC):
            raise ValidationError(
                {
                    "non_field_errors": [
                        "Cannot submit anymore. Assignment due date reached."
                    ]
                }
            )
        latest_sub = (
            models.Submission.objects.filter(
                created_by=validated_data["created_by"],
                assignment_id=validated_data["assignment"].id,
            )
            .order_by("-attempt_count")
            .first()
        )

        if latest_sub:
            validated_data["attempt_count"] = latest_sub.attempt_count + 1
        else:
            validated_data["attempt_count"] = 1
        if validated_data["attempt_count"] > validated_data["assignment"].max_attempts:
            raise ValidationError({"attempt_count": "Max attempts exceeded."})

        # only delete ungraded submissions to keep graded work and feedback
        models.Submission.objects.filter(
            created_by_id=validated_data["created_by"].id,
            assignment_id=validated_data["assignment"].id,
            is_graded=False,
        ).delete()
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if 'user_score' in validated_data and validated_data['user_score'] is not None:
            validated_data['is_graded'] = True
        return super().update(instance, validated_data)

class DailyNoteSerializer(BaseModelSerializer):
    class Meta:
        model = models.DailyNote
        fields = "__all__"
        expandable_fields = {
            "event": "app_course.serializers.EventSerializer",
        }


class CourseHistorySerializer(BaseModelSerializer):
    class Meta:
        model = models.CourseHistory
        fields = "__all__"
        expandable_fields = {
            "course": "app_course.serializers.CourseSerializer",
            "user": "app_auth.serializers.UserSerializer",
            "created_by": "app_auth.serializers.UserSerializer",
        }

    def create(self, validated_data):
        if self.context.get(
                "request",
        ):
            validated_data["created_by"] = User.objects.filter(
                email=self.context.get(
                    "request",
                ).user.id
            ).first()
        return super().create(validated_data)


class UserAttendanceSerializer(BaseModelSerializer):
    class Meta:
        model = models.UserAttendance
        fields = "__all__"
        expandable_fields = {
            "user": "app_auth.serializers.UserSerializer",
            "course": "app_course.serializers.CourseSerializer",
        }

    def create(self, validated_data):
        user = validated_data.get("user")
        course = validated_data.get("course")
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        if user and course and tenant:
            rate = get_hourly_rate_for_teacher_course(user, course, tenant)
            if rate is not None:
                validated_data["hourly_rate_at_creation"] = rate
        join_datetime = validated_data.get("join_datetime")
        if join_datetime and tenant:
            tz = pytz.timezone(getattr(tenant, "timezone", None) or "UTC")
            validated_data["attendance_date"] = join_datetime.astimezone(tz).date()
        return super().create(validated_data)


class CourseJoinRequestSerializer(BaseModelSerializer):
    class Meta:
        model = models.CourseJoinRequest
        fields = "__all__"
        expandable_fields = {
            "course": "app_course.serializers.CourseSerializer",
            "user": "app_auth.serializers.UserSerializer",
        }

    def create(self, validated_data):
        if self.context.get("request"):
            user = User.objects.get(email=self.context["request"].user.id)
            if user.is_student() and validated_data["status"] != models.CourseJoinRequest.Status.PENDING:
                raise ValidationError(
                    {
                        "status": "Students can only create join requests with 'PENDING' status."
                    }
                )
        return super().create(validated_data)

    def update(self, instance, validated_data):
        user = User.objects.get(email=self.context["request"].user.id)
        if user.is_student():
            raise ValidationError(
                {
                    "non_field_errors": [
                        "Students are not allowed to update join requests."
                    ]
                }
            )
        if validated_data.get("status") == models.CourseJoinRequest.Status.APPROVED:
            from app_course.join_request_approval import approve_course_join_request

            return approve_course_join_request(
                instance,
                actor=user,
                tenant=self.context.get("request").tenant,
                send_activation_email=True,
            )
        return super().update(instance, validated_data)


class ProcessedTeamsRecordingSerializer(BaseModelSerializer):
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = models.ProcessedTeamsRecording
        fields = "__all__"
        expandable_fields = {
            "course": ("app_course.serializers.CourseSerializer",),
        }

    def get_download_url(self, obj):
        """Presigned URL to stream/download the recording file."""
        if not obj.file_path:
            return None
        try:
            from schedjuice_backend.storages import PrivateMediaStorage
            storage = PrivateMediaStorage()
            return storage.url(
                obj.file_path,
                parameters={"ResponseContentDisposition": "inline", "ResponseContentType": "video/mp4"},
                expire=settings.RECORDING_PRESIGNED_EXPIRES_SECONDS,
            )
        except Exception:
            return None


class UserUploadedRecordingSerializer(BaseModelSerializer):
    display_label = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()
    playback = serializers.SerializerMethodField()

    class Meta:
        model = models.UserUploadedRecording
        fields = "__all__"
        expandable_fields = {
            "course": ("app_course.serializers.CourseSerializer",),
            "uploaded_by": ("app_auth.serializers.UserSerializer",),
        }

    def validate(self, attrs):
        instance = getattr(self, "instance", None)
        source_type = attrs.get(
            "source_type",
            instance.source_type if instance else models.UserUploadedRecording.SourceType.FILE,
        )
        youtube_url = attrs.get("youtube_url", instance.youtube_url if instance else "")

        if source_type == models.UserUploadedRecording.SourceType.YOUTUBE:
            if not youtube_url:
                raise ValidationError({"youtube_url": "YouTube URL is required."})
            video_id = extract_youtube_video_id(youtube_url)
            if not video_id:
                raise ValidationError({"youtube_url": "Enter a valid YouTube link."})
            attrs["youtube_video_id"] = video_id
            attrs["youtube_url"] = normalize_youtube_url(youtube_url, video_id)
        else:
            attrs["youtube_url"] = ""
            attrs["youtube_video_id"] = ""

        return super().validate(attrs)

    def get_playback(self, obj):
        if obj.source_type == models.UserUploadedRecording.SourceType.YOUTUBE:
            return {
                "kind": "youtube",
                "video_id": obj.youtube_video_id or None,
                "url": obj.youtube_url or None,
            }
        return {
            "kind": "file",
            "url": self.get_download_url(obj),
        }

    def get_display_label(self, obj):
        """
        Returns a label like "2.2.2026" or "2.2.2026 (2)" when multiple recordings
        exist for the same course and date.
        """
        date = obj.recorded_date
        label = f"{date.day}.{date.month}.{date.year}"
        siblings = list(
            models.UserUploadedRecording.objects.filter(
                course_id=obj.course_id, recorded_date=obj.recorded_date
            ).order_by("created_at").values_list("id", flat=True)
        )
        if len(siblings) > 1:
            position = siblings.index(obj.id) + 1
            label = f"{label} ({position})"
        return label

    def get_download_url(self, obj):
        """Presigned URL via the juice-box-managed attachment."""
        if obj.source_type == models.UserUploadedRecording.SourceType.YOUTUBE:
            return None
        try:
            from app_attachment.models import Attachment
            from app_attachment.views import get_presigned_url

            attachment = Attachment.objects.filter(
                table_name="app_course_useruploadedrecording",
                foreign_key=obj.id,
                is_deleted=False,
            ).first()
            if attachment and attachment.data:
                return get_presigned_url(
                    attachment.data.name,
                    "recording",
                    "video/mp4",
                    expires_in=settings.RECORDING_PRESIGNED_EXPIRES_SECONDS,
                )
        except Exception:
            pass
        return None

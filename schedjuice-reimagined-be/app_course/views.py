from django.core.exceptions import BadRequest
from django.conf import settings
from django.db import IntegrityError, connection, transaction
from rest_framework import status
from rest_framework.exceptions import MethodNotAllowed, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.serializers import ValidationError as SerializerValidationError
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication

from app_auth.models import User
from app_course import models, serializers
from app_microsoft.graph_wrapper.group import MSGroup
from app_microsoft.team_provisioning_helpers import tenant_syncs_course_team_roster
from app_tasks.models import Task
from app_course.zoom_manual_meeting import resolve_manual_zoom_meeting_for_tenant
from app_attendance.models import UserEvent
from app_attendance.userevent_lifecycle import soft_delete_userevents
from app_attendance.attendance_scoping import (
    check_userevent_write,
    scope_userevents_for_user,
)
from app_attendance.serializers import UserEventSerializer
from datetime import datetime, timedelta, timezone as dt_timezone
from django.db.models import Prefetch, Count, Q, Exists, OuterRef
from app_course.join_code_helpers import (
    get_course_by_join_code,
    is_join_code_expired,
)
from app_course.models import generate_join_code
from app_course.rate_utils import get_rate_from_user_course_rates
import pytz
from django.utils import timezone as django_timezone

from app_course.zoom_meeting_context import resolve_zoom_course_context
from app_zoom.client import (
    create_user_meeting,
    get_meeting,
    list_user_meetings,
    update_meeting,
)
from app_zoom.scheduling import (
    apply_meeting_response_to_course,
    build_create_meeting_payload,
    detect_conflicts,
)
import jwt
from decouple import config
from django_q.tasks import async_task
from requests import RequestException

from app_microsoft.meeting_helpers import schedule_update_course_meeting_attendees

from app_course.course_member_counts import refresh_course_member_counts_now
from app_course.student_management import (
    CourseStudentAddSerializer,
    CourseStudentCandidateSearchSerializer,
    build_student_candidates_queryset,
)
from app_course.course_search_queryset import (
    annotate_course_queryset_first_event_times,
    annotate_intake_queryset_courses_count,
    annotate_program_queryset_intake_count,
    build_assignment_queryset_with_optimized_course,
    build_course_subject_queryset_for_expand,
    build_intake_queryset_for_course_expand,
    build_program_queryset_for_course_expand,
    build_user_course_queryset_for_roster_user_expand,
    build_user_queryset_for_roster_expand,
    normalize_user_course_sorts,
    optimized_course_queryset_for_serializer,
    prefetch_course_teacher_roster_for_list_serializer,
    prime_course_roster_id_card_cache,
    prime_id_card_class_cache,
    prime_user_course_roster_id_card_cache,
)
from utilitas.queryset_mixins import (
    ExpandPrefetchSpec,
    OptimizedDetailMixin,
    OptimizedSearchMixin,
    expand_includes_prefix,
)
from utilitas.views import apply_expand_lookups
from app_course.helpers import check_and_release_results
from app_course.meeting_attendance_dashboard import build_meeting_attendance_dashboard
from app_attendance.marking_services import build_attendance_marking_bootstrap
from app_attendance.removed_students import parse_include_removed_students
from app_attendance.attendance_scoping import check_course_attendance_access
from app_microsoft.payment_assignment_helpers import get_payment_assignment_month_status
from app_rbac import scoping
from app_rbac.resolution import effective_permissions
from app_rbac.views import RBACDetailsView, RBACListView, RBACPermission, RBACSearchView, RBACView
from app_course.membership_history import (
    record_membership_event,
)
from app_course.user_course_lifecycle import close_teacher_user_course
from app_course.course_scoping import (
    acting_user,
    check_course_read,
    check_course_write,
    check_teacher_event_assignment,
    check_user_attendance_read,
    check_user_course_read,
    check_user_course_write,
    require_superadmin_or_admin,
    scope_courses_for_user,
    scope_events_for_user,
    scope_user_attendances_for_user,
    scope_user_courses_for_user,
    user_can_access_course,
)

def get_user_categories(user_id: int):
    return models.Category.objects.filter(
        courses__id__in=models.UserCourse.objects.filter(user_id=user_id).values_list(
            "course_id", flat=True
        )
    ).values_list("id", flat=True)


class CategoryListView(RBACListView):
    name = "Category list view"
    model = models.Category
    serializer = serializers.CategorySerializer
    required_permissions = {
        "GET": "category.manage",
        "POST": "category.manage",
    }


class CategoryDetailsView(RBACDetailsView):
    name = "Category details view"
    model = models.Category
    serializer = serializers.CategorySerializer
    required_permissions = {
        "GET": "category.manage",
        "PUT": "category.manage",
        "PATCH": "category.manage",
        "DELETE": "category.manage",
    }


class CategorySearchView(RBACSearchView):
    name = "Category search view"
    model = models.Category
    serializer = serializers.CategorySerializer
    required_permissions = {"POST": "category.manage"}

    def augment_search_queryset(self, queryset, expand, is_csv):
        from app_course.category_search import apply_category_search_q_with_meta, get_search_q

        queryset = super().augment_search_queryset(queryset, expand, is_csv)
        q = get_search_q(self.request)
        if q:
            queryset, self._search_used_fallback = apply_category_search_q_with_meta(
                queryset, q
            )
        else:
            self._search_used_fallback = False
        return queryset.order_by("sort_order", "name")


class CategoryReorderView(RBACView):
    name = "Category reorder view"
    model = models.Category
    serializer = serializers.CategorySerializer
    required_permissions = {"POST": "category.manage"}

    def post(self, request: Request):
        ordered_ids = request.data.get("ordered_ids")
        if not isinstance(ordered_ids, list) or not ordered_ids:
            return self.send_response(
                True,
                "bad_request",
                {"details": "ordered_ids must be a non-empty list."},
                status=400,
            )
        existing = set(
            models.Category.objects.filter(id__in=ordered_ids).values_list("id", flat=True)
        )
        if existing != set(ordered_ids):
            return self.send_response(
                True,
                "bad_request",
                {"details": "ordered_ids contains unknown category ids."},
                status=400,
            )
        with transaction.atomic():
            for index, cat_id in enumerate(ordered_ids):
                models.Category.objects.filter(id=cat_id).update(sort_order=index)
        return self.ok({"updated": len(ordered_ids)}, message="ok")


class CampusListView(RBACListView):
    name = "Campus list view"
    model = models.Campus
    serializer = serializers.CampusSerializer
    required_permissions = {"GET": "category.manage", "POST": "category.manage"}


class CampusDetailsView(RBACDetailsView):
    name = "Campus details view"
    model = models.Campus
    serializer = serializers.CampusSerializer
    required_permissions = {
        "GET": "category.manage",
        "PUT": "category.manage",
        "PATCH": "category.manage",
        "DELETE": "category.manage",
    }


class CampusSearchView(RBACSearchView):
    name = "Campus search view"
    model = models.Campus
    serializer = serializers.CampusSerializer
    required_permissions = {"POST": "category.manage"}


class SubjectListView(RBACListView):
    name = "Subject list view"
    model = models.Subject
    serializer = serializers.SubjectSerializer
    required_permissions = {"GET": "subject.view", "POST": "subject.manage"}


class SubjectDetailsView(RBACDetailsView):
    name = "Subject details view"
    model = models.Subject
    serializer = serializers.SubjectSerializer
    required_permissions = {
        "GET": "subject.view",
        "PUT": "subject.manage",
        "PATCH": "subject.manage",
        "DELETE": "subject.manage",
    }


class SubjectSearchView(RBACSearchView):
    name = "Subject search view"
    model = models.Subject
    serializer = serializers.SubjectSerializer
    required_permissions = {"POST": "subject.view"}


class ProgramListView(RBACListView):
    name = "Program list view"
    model = models.Program
    serializer = serializers.ProgramSerializer
    required_permissions = {"GET": "program.view", "POST": "program.manage"}

    def augment_search_queryset(self, queryset, expand, is_csv):
        queryset = super().augment_search_queryset(queryset, expand, is_csv)
        return annotate_program_queryset_intake_count(queryset)


class ProgramDetailsView(OptimizedDetailMixin, RBACDetailsView):
    name = "Program details view"
    model = models.Program
    serializer = serializers.ProgramSerializer
    required_permissions = {
        "GET": "program.view",
        "PUT": "program.manage",
        "PATCH": "program.manage",
        "DELETE": "program.manage",
    }

    def annotate_detail_queryset(self, queryset):
        return annotate_program_queryset_intake_count(queryset)


class ProgramSearchView(RBACSearchView):
    name = "Program search view"
    model = models.Program
    serializer = serializers.ProgramSerializer
    required_permissions = {"POST": "program.view"}

    def augment_search_queryset(self, queryset, expand, is_csv):
        queryset = super().augment_search_queryset(queryset, expand, is_csv)
        return annotate_program_queryset_intake_count(queryset)


class ProgramSetupStructureView(RBACView):
    name = "Program setup structure"
    model = models.Program
    serializer = serializers.ProgramSerializer
    required_permissions = {"POST": "program.manage"}

    def post(self, request: Request, obj_id: int):
        from app_course.program_structure_services import (
            ProgramStructureValidationError,
            setup_program_structure,
        )

        levels_data = request.data.get("levels")
        if levels_data is None:
            return self.validation_error("Missing 'levels' in request body.")

        try:
            created_levels = setup_program_structure(obj_id, levels_data)
        except ProgramStructureValidationError as e:
            return self.validation_error(str(e))

        level_serializer = serializers.ProgramLevelSerializer(
            created_levels,
            many=True,
            expand=["sections"],
            context={"request": request},
        )
        return self.send_response(
            False,
            "ok",
            {"program_id": obj_id, "levels": level_serializer.data},
            status=status.HTTP_201_CREATED,
        )


class ProgramSetupCurriculumView(RBACView):
    name = "Program setup curriculum"
    model = models.Program
    serializer = serializers.ProgramSerializer
    required_permissions = {"POST": "program.manage"}

    def post(self, request: Request, obj_id: int):
        from app_course.program_structure_services import (
            ProgramStructureValidationError,
            setup_program_curriculum,
        )

        assignments_data = request.data.get("assignments")
        if assignments_data is None:
            return self.validation_error("Missing 'assignments' in request body.")

        try:
            created = setup_program_curriculum(obj_id, assignments_data)
        except ProgramStructureValidationError as e:
            return self.validation_error(str(e))

        serializer = serializers.ProgramLevelSubjectSerializer(
            created,
            many=True,
            expand=["level", "subject"],
            context={"request": request},
        )
        return self.send_response(
            False,
            "ok",
            {"program_id": obj_id, "assignments": serializer.data, "count": len(created)},
            status=status.HTTP_200_OK,
        )


class ProgramAddSubjectsView(RBACView):
    name = "Program add subjects"
    model = models.Program
    serializer = serializers.ProgramSerializer
    required_permissions = {"POST": "program.manage"}

    def post(self, request: Request, obj_id: int):
        from app_course.program_subject_services import (
            ProgramSubjectValidationError,
            add_subjects_to_program,
        )

        names = request.data.get("names")
        if names is None:
            return self.validation_error("Missing 'names' in request body.")

        try:
            summary = add_subjects_to_program(obj_id, names)
        except ProgramSubjectValidationError as e:
            return self.validation_error(str(e))

        return self.send_response(
            False, "ok", summary, status=status.HTTP_201_CREATED
        )


class ProgramSubjectListView(RBACListView):
    name = "ProgramSubject list view"
    model = models.ProgramSubject
    serializer = serializers.ProgramSubjectSerializer
    required_permissions = {"GET": "program.view", "POST": "program.manage"}


class ProgramSubjectDetailsView(RBACDetailsView):
    name = "ProgramSubject details view"
    model = models.ProgramSubject
    serializer = serializers.ProgramSubjectSerializer
    required_permissions = {
        "GET": "program.view",
        "PUT": "program.manage",
        "PATCH": "program.manage",
        "DELETE": "program.manage",
    }


class ProgramSubjectSearchView(RBACSearchView):
    name = "ProgramSubject search view"
    model = models.ProgramSubject
    serializer = serializers.ProgramSubjectSerializer
    required_permissions = {"POST": "program.view"}


class ProgramLevelSubjectListView(RBACListView):
    name = "ProgramLevelSubject list view"
    model = models.ProgramLevelSubject
    serializer = serializers.ProgramLevelSubjectSerializer
    required_permissions = {"GET": "program.view", "POST": "program.manage"}


class ProgramLevelSubjectDetailsView(RBACDetailsView):
    name = "ProgramLevelSubject details view"
    model = models.ProgramLevelSubject
    serializer = serializers.ProgramLevelSubjectSerializer
    required_permissions = {
        "GET": "program.view",
        "PUT": "program.manage",
        "PATCH": "program.manage",
        "DELETE": "program.manage",
    }


class ProgramLevelSubjectSearchView(RBACSearchView):
    name = "ProgramLevelSubject search view"
    model = models.ProgramLevelSubject
    serializer = serializers.ProgramLevelSubjectSerializer
    required_permissions = {"POST": "program.view"}


class ProgramLevelListView(RBACListView):
    name = "ProgramLevel list view"
    model = models.ProgramLevel
    serializer = serializers.ProgramLevelSerializer
    required_permissions = {"GET": "program.view", "POST": "program.manage"}


class ProgramLevelDetailsView(RBACDetailsView):
    name = "ProgramLevel details view"
    model = models.ProgramLevel
    serializer = serializers.ProgramLevelSerializer
    required_permissions = {
        "GET": "program.view",
        "PUT": "program.manage",
        "PATCH": "program.manage",
        "DELETE": "program.manage",
    }


class ProgramLevelSearchView(RBACSearchView):
    name = "ProgramLevel search view"
    model = models.ProgramLevel
    serializer = serializers.ProgramLevelSerializer
    required_permissions = {"POST": "program.view"}


class ProgramLevelSectionListView(RBACListView):
    name = "ProgramLevelSection list view"
    model = models.ProgramLevelSection
    serializer = serializers.ProgramLevelSectionSerializer
    required_permissions = {"GET": "program.view", "POST": "program.manage"}


class ProgramLevelSectionDetailsView(RBACDetailsView):
    name = "ProgramLevelSection details view"
    model = models.ProgramLevelSection
    serializer = serializers.ProgramLevelSectionSerializer
    required_permissions = {
        "GET": "program.view",
        "PUT": "program.manage",
        "PATCH": "program.manage",
        "DELETE": "program.manage",
    }


class ProgramLevelSectionSearchView(RBACSearchView):
    name = "ProgramLevelSection search view"
    model = models.ProgramLevelSection
    serializer = serializers.ProgramLevelSectionSerializer
    required_permissions = {"POST": "program.view"}


class IntakeListView(RBACListView):
    name = "Intake list view"
    model = models.Intake
    serializer = serializers.IntakeSerializer
    required_permissions = {"GET": "intake.view", "POST": "intake.manage"}

    def post(self, request: Request):
        from django.db import IntegrityError

        try:
            return super().post(request)
        except IntegrityError as exc:
            if "uniq_intake_program_name" in str(exc):
                return self.send_response(
                    True,
                    "validation_error",
                    {
                        "details": (
                            "An intake with this name already exists for this program."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            raise

    def augment_search_queryset(self, queryset, expand, is_csv):
        from django.db.models import Count

        queryset = super().augment_search_queryset(queryset, expand, is_csv)
        return queryset.annotate(_courses_count=Count("courses"))


class IntakeDetailsView(RBACDetailsView):
    name = "Intake details view"
    model = models.Intake
    serializer = serializers.IntakeSerializer
    required_permissions = {
        "GET": "intake.view",
        "PUT": "intake.manage",
        "PATCH": "intake.manage",
        "DELETE": "intake.manage",
    }

    @staticmethod
    def _courses_outside_intake_range(intake, start, end):
        return models.Course.objects.filter(intake=intake).filter(
            Q(start_date__lt=start) | Q(end_date__gt=end)
        )

    @classmethod
    def _clamp_courses_to_intake(cls, intake, start, end):
        for course in cls._courses_outside_intake_range(intake, start, end):
            new_course_start = max(course.start_date, start)
            new_course_end = min(course.end_date, end)
            if new_course_start >= new_course_end:
                continue
            course.start_date = new_course_start
            course.end_date = new_course_end
            course.save(update_fields=["start_date", "end_date"])

    def put(self, request: Request, obj_id: int):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)

        payload = {
            key: value
            for key, value in request.data.items()
            if key != "course_range_action"
        }
        serialized_data = self.get_serializer(obj, data=payload, partial=True)
        serialized_data.is_valid(raise_exception=True)

        validated = serialized_data.validated_data
        new_start = validated.get("start_date", obj.start_date)
        new_end = validated.get("end_date", obj.end_date)
        action = request.data.get("course_range_action")
        dates_changed = new_start != obj.start_date or new_end != obj.end_date

        if dates_changed and action not in ("adjust", "ignore"):
            conflicting = self._courses_outside_intake_range(obj, new_start, new_end)
            if conflicting.exists():
                courses = [
                    {
                        "id": course.id,
                        "title": course.title,
                        "start_date": course.start_date.isoformat(),
                        "end_date": course.end_date.isoformat(),
                    }
                    for course in conflicting[:20]
                ]
                count = conflicting.count()
                return self.send_response(
                    True,
                    "courses_outside_intake_range",
                    {
                        "details": {
                            "code": "courses_outside_intake_range",
                            "non_field_errors": [
                                f"{count} linked course(s) fall outside the new "
                                "intake date range."
                            ],
                            "courses": courses,
                        }
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        with transaction.atomic():
            if dates_changed and action == "adjust":
                self._clamp_courses_to_intake(obj, new_start, new_end)
            serialized_data.save()

        return self.updated(serialized_data.data)

    def delete(self, request: Request, obj_id: int):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)

        course_count = obj.courses.count()
        if course_count > 0:
            return self.bad_request(
                {
                    "code": "intake_has_courses",
                    "non_field_errors": [
                        f"This intake still has {course_count} course(s). "
                        "Delete those courses one by one first, then delete the intake."
                    ],
                }
            )

        serialized_data = self.get_serializer(obj)
        response_payload = serialized_data.data
        obj.delete()
        return self.deleted(response_payload)


class IntakeSearchView(RBACSearchView):
    name = "Intake search view"
    model = models.Intake
    serializer = serializers.IntakeSerializer
    required_permissions = {"POST": "intake.view"}

    def augment_search_queryset(self, queryset, expand, is_csv):
        from django.db.models import Count

        queryset = super().augment_search_queryset(queryset, expand, is_csv)
        return queryset.annotate(_courses_count=Count("courses"))


class CourseSubjectListView(RBACListView):
    name = "CourseSubject list view"
    model = models.CourseSubject
    serializer = serializers.CourseSubjectSerializer
    required_permissions = {"GET": "subject.view", "POST": "subject.manage"}


class CourseSubjectDetailsView(RBACDetailsView):
    name = "CourseSubject details view"
    model = models.CourseSubject
    serializer = serializers.CourseSubjectSerializer
    required_permissions = {
        "GET": "subject.view",
        "PUT": "subject.manage",
        "PATCH": "subject.manage",
        "DELETE": "subject.manage",
    }


class IntakePreviewCoursesView(RBACView):
    name = "Intake preview courses"
    model = models.Intake
    serializer = serializers.IntakeSerializer
    required_permissions = {"POST": "intake.view"}

    def post(self, request: Request, obj_id: int):
        intake = models.Intake.objects.select_related("program").filter(pk=obj_id).first()
        if not intake:
            return self.send_response(
                True, "not_found", {"details": "No such intake."}, status=404
            )
        from app_course.intake_services import build_intake_course_preview

        overrides = request.data.get("overrides")
        defaults = request.data.get("defaults") or {}
        rows = build_intake_course_preview(intake, overrides, defaults=defaults)
        return self.send_response(
            False,
            "ok",
            {"intake_id": intake.id, "courses": rows, "count": len(rows)},
        )


class IntakeGenerateCoursesView(RBACView):
    name = "Intake generate courses"
    model = models.Intake
    serializer = serializers.IntakeSerializer
    required_permissions = {"POST": "intake.manage"}

    def post(self, request: Request, obj_id: int):
        intake = models.Intake.objects.select_related("program").filter(pk=obj_id).first()
        if not intake:
            return self.send_response(
                True, "not_found", {"details": "No such intake."}, status=404
            )
        from app_course.intake_services import generate_intake_courses

        from app_auth.models import User

        overrides = request.data.get("overrides")
        defaults = request.data.get("defaults") or {}
        tenant = getattr(request, "tenant", None)
        if tenant and getattr(tenant, "is_exam_board_in_course_enabled", False):
            exam_errors = {}
            if not defaults.get("exam_session_date"):
                exam_errors["exam_session_date"] = (
                    "This organization requires an exam session on every course."
                )
            if not defaults.get("exam_board"):
                exam_errors["exam_board"] = (
                    "This organization requires an exam board on every course."
                )
            if exam_errors:
                return self.send_response(
                    True, "validation_error", exam_errors, status=400
                )
        created_by = User.get_user_from_request(request)
        ser = serializers.CourseSerializer(
            context={"request": request, "defer_team_provisioning": True},
        )

        def _create(payload):
            return ser.create(payload)

        try:
            with transaction.atomic():
                created_ids = generate_intake_courses(
                    intake,
                    overrides=overrides,
                    defaults=defaults,
                    course_serializer_create=_create,
                    created_by=created_by,
                )
        except ValueError as e:
            return self.send_response(
                True, "validation_error", {"details": str(e)}, status=400
            )
        except ValidationError as e:
            return self.send_response(
                True, "validation_error", e.detail, status=400
            )

        return self.send_response(
            False,
            "ok",
            {"intake_id": intake.id, "course_ids": created_ids, "count": len(created_ids)},
        )


class CourseRosterExpandSerializeMixin:
    """Prime caches and compact nested expands for course list/search serialization."""

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["omit_nested_user_scopes"] = True
        context["omit_nested_fk_counts"] = True
        return context

    def get_serializer(self, *args, **kwargs):
        if kwargs.get("many") and args:
            from app_custom_fields.validation import prime_custom_field_representation_cache

            expand = kwargs.get("expand") or []
            prime_custom_field_representation_cache(self.request)
            prime_course_roster_id_card_cache(self.request, args[0], expand)
        return super().get_serializer(*args, **kwargs)


_COURSE_USER_COURSES_EXPAND_SPEC = ExpandPrefetchSpec(
    trigger_expand="user_courses",
    replace_lookup="user_courses",
    queryset_factory=build_user_course_queryset_for_roster_user_expand,
)
_COURSE_CREATED_BY_EXPAND_SPEC = ExpandPrefetchSpec(
    trigger_expand="created_by",
    replace_lookup="created_by",
    queryset_factory=build_user_queryset_for_roster_expand,
)
_COURSE_INTAKE_EXPAND_SPEC = ExpandPrefetchSpec(
    trigger_expand="intake",
    replace_lookup="intake",
    queryset_factory=build_intake_queryset_for_course_expand,
)
_COURSE_PROGRAM_EXPAND_SPEC = ExpandPrefetchSpec(
    trigger_expand="program",
    replace_lookup="program",
    queryset_factory=build_program_queryset_for_course_expand,
)
_COURSE_SUBJECTS_EXPAND_SPEC = ExpandPrefetchSpec(
    trigger_expand="course_subjects",
    replace_lookup="course_subjects",
    queryset_factory=build_course_subject_queryset_for_expand,
)
_COURSE_EXPAND_PREFETCH_SPECS = [
    _COURSE_USER_COURSES_EXPAND_SPEC,
    _COURSE_CREATED_BY_EXPAND_SPEC,
    _COURSE_INTAKE_EXPAND_SPEC,
    _COURSE_PROGRAM_EXPAND_SPEC,
    _COURSE_SUBJECTS_EXPAND_SPEC,
]


class CourseListView(
    CourseRosterExpandSerializeMixin, OptimizedSearchMixin, RBACListView
):
    name = "Course list view"
    model = models.Course
    serializer = serializers.CourseSerializer
    required_permissions = {"GET": "course.view"}
    expand_prefetch_specs = _COURSE_EXPAND_PREFETCH_SPECS

    def check_permissions(self, request):
        if request.method == "POST":
            user = acting_user(request)
            if user is None:
                raise PermissionDenied("Authentication credentials were not provided.")
            held = effective_permissions(user)
            teacher_with_flag = (
                "teacher" in (user.roles or [])
                and getattr(request.tenant, "can_teacher_create_course", False)
            )
            if "course.create" not in held and not teacher_with_flag:
                raise PermissionDenied("You don't have permission to create courses.")
            return
        super().check_permissions(request)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.request.query_params.get("bulk"):
            context["defer_team_provisioning"] = True
        return context

    def augment_search_queryset(self, queryset, expand, is_csv):
        queryset = super().augment_search_queryset(queryset, expand, is_csv)
        queryset = annotate_course_queryset_first_event_times(queryset)
        return prefetch_course_teacher_roster_for_list_serializer(queryset)

    def get(self, request):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        held = set(effective_permissions(user))
        if scoping.has_read_breadth("course", held):
            return super().post(request)
        course_ids = list(scope_courses_for_user(user).values_list("id", flat=True))
        return super().get(request, course_ids)


class CourseDetailsView(OptimizedDetailMixin, RBACDetailsView):
    name = "Course details view"
    model = models.Course
    serializer = serializers.CourseSerializer
    required_permissions = {
        "GET": "course.view",
        "PUT": "course.update",
        "PATCH": "course.update",
        "DELETE": "course.delete",
    }

    def annotate_detail_queryset(self, queryset):
        queryset = annotate_course_queryset_first_event_times(queryset)
        return prefetch_course_teacher_roster_for_list_serializer(queryset)

    def get_object(self, obj_id: int, prefetch_fields=None):
        if prefetch_fields is None:
            prefetch_fields = set()
        elif not isinstance(prefetch_fields, (set, frozenset)):
            prefetch_fields = set(prefetch_fields)

        qs = self.annotate_detail_queryset(self.model.objects.filter(pk=obj_id))

        has_user_courses_expand = any(
            name == "user_courses" or name.startswith("user_courses__")
            for name in prefetch_fields
        )
        if not has_user_courses_expand:
            qs = apply_expand_lookups(qs, self.model, prefetch_fields)
            return qs.first()

        remaining = {
            p
            for p in prefetch_fields
            if p != "user_courses" and not p.startswith("user_courses__")
        }
        custom_prefetch_fields = {"created_by", "intake"}
        simple_lookups = remaining - custom_prefetch_fields
        if simple_lookups:
            qs = apply_expand_lookups(qs, self.model, simple_lookups)

        prefetches = [
            Prefetch(
                "user_courses",
                queryset=build_user_course_queryset_for_roster_user_expand(),
            )
        ]
        if "created_by" in remaining:
            prefetches.append(
                Prefetch(
                    "created_by",
                    queryset=build_user_queryset_for_roster_expand(),
                )
            )
        if "intake" in remaining:
            prefetches.append(
                Prefetch(
                    "intake",
                    queryset=annotate_intake_queryset_courses_count(
                        models.Intake.objects.all()
                    ),
                )
            )
        qs = qs.prefetch_related(*prefetches)
        return qs.first()

    def get(self, request: Request, obj_id: int):
        query_params = self.get_query_params(request)
        query_params.pop("sorts")
        expand_raw = query_params.get("expand", [])
        expand = self.translate_expand_params(expand_raw)
        obj = self.get_object(obj_id, expand)
        if obj is None:
            return self.send_not_found(obj_id)
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        check_course_read(user, obj)
        if expand_includes_prefix(expand_raw, "user_courses"):
            prime_id_card_class_cache(
                request, (uc.user for uc in obj.user_courses.all())
            )
        serialized_data = self.get_serializer(obj, **query_params)
        return self.ok(serialized_data.data)

    def put(self, request: Request, obj_id: int):
        course = self.get_object(obj_id)
        if course is None:
            return self.send_not_found(obj_id)
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        check_course_write(user, course)
        return super().put(request, obj_id)

    def patch(self, request: Request, obj_id: int):
        return self.put(request, obj_id)

    def delete(self, request: Request, obj_id: int):
        course = self.get_object(obj_id)
        if course is None:
            return self.send_not_found(obj_id)
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        check_course_write(user, course)
        return super().delete(request, obj_id)


def _get_course_for_status_action(course_id: int):
    return models.Course.objects.filter(id=course_id).first()


class CoursePauseView(RBACView):
    name = "Course pause view"
    serializer = serializers.CourseSerializer
    required_permissions = {"POST": "course.update"}

    def post(self, request: Request, course_id: int):
        from app_course.course_status import pause_course, user_can_edit_course_status

        course = _get_course_for_status_action(course_id)
        if course is None:
            return self.not_found("No such course with the given id.")
        user = User.get_user_from_request(request)
        try:
            check_course_write(user, course)
        except PermissionDenied:
            return self.send_response(
                True,
                "forbidden",
                {"details": "You cannot change this course's status."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not user_can_edit_course_status(user, course):
            return self.send_response(
                True,
                "forbidden",
                {"details": "You cannot change this course's status."},
                status=status.HTTP_403_FORBIDDEN,
            )
        pause_course(course=course, user=user)
        course.refresh_from_db()
        return self.ok(
            self.get_serializer(course).data,
            message="Course paused.",
        )


class CourseResumeView(RBACView):
    name = "Course resume view"
    serializer = serializers.CourseSerializer
    required_permissions = {"POST": "course.update"}

    def post(self, request: Request, course_id: int):
        from app_course.course_status import resume_course, user_can_edit_course_status

        course = _get_course_for_status_action(course_id)
        if course is None:
            return self.not_found("No such course with the given id.")
        user = User.get_user_from_request(request)
        try:
            check_course_write(user, course)
        except PermissionDenied:
            return self.send_response(
                True,
                "forbidden",
                {"details": "You cannot change this course's status."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not user_can_edit_course_status(user, course):
            return self.send_response(
                True,
                "forbidden",
                {"details": "You cannot change this course's status."},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            resume_course(course=course, user=user)
        except ValueError as exc:
            return self.send_response(
                True,
                "bad_request",
                {"details": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        course.refresh_from_db()
        return self.ok(
            self.get_serializer(course).data,
            message="Course resumed.",
        )


class CourseEndView(RBACView):
    name = "Course end view"
    serializer = serializers.CourseSerializer
    required_permissions = {"POST": "course.update"}

    def post(self, request: Request, course_id: int):
        from app_course.course_status import (
            compute_effective_status,
            end_course,
            user_can_edit_course_status,
        )

        course = _get_course_for_status_action(course_id)
        if course is None:
            return self.not_found("No such course with the given id.")
        user = User.get_user_from_request(request)
        try:
            check_course_write(user, course)
        except PermissionDenied:
            return self.send_response(
                True,
                "forbidden",
                {"details": "You cannot end this course."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not user_can_edit_course_status(user, course):
            return self.send_response(
                True,
                "forbidden",
                {"details": "You cannot end this course."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if compute_effective_status(course) == models.Course.CourseStatus.ENDED:
            return self.send_response(
                True,
                "bad_request",
                {"details": "Course is already ended."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = (request.data.get("reason") or "").strip() or None
        end_course(course=course, user=user, reason=reason)
        course.refresh_from_db()
        return self.ok(
            self.get_serializer(course).data,
            message="Course ended.",
        )


class CourseReactivateView(RBACView):
    name = "Course reactivate view"
    serializer = serializers.CourseSerializer
    required_permissions = {"POST": "course.update"}

    def post(self, request: Request, course_id: int):
        from app_course.course_status import (
            compute_effective_status,
            reactivate_course,
            user_can_edit_course_status,
        )

        course = _get_course_for_status_action(course_id)
        if course is None:
            return self.not_found("No such course with the given id.")
        user = User.get_user_from_request(request)
        try:
            check_course_write(user, course)
        except PermissionDenied:
            return self.send_response(
                True,
                "forbidden",
                {"details": "You cannot reactivate this course."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not user_can_edit_course_status(user, course):
            return self.send_response(
                True,
                "forbidden",
                {"details": "You cannot reactivate this course."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if compute_effective_status(course) != models.Course.CourseStatus.ENDED:
            return self.send_response(
                True,
                "bad_request",
                {"details": "Course is not ended."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        input_serializer = serializers.CourseReactivateSerializer(data=request.data)
        if not input_serializer.is_valid():
            return self.send_response(
                True,
                "bad_request",
                {"details": input_serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            reactivate_course(
                course=course,
                user=user,
                start_date=input_serializer.validated_data["start_date"],
                end_date=input_serializer.validated_data["end_date"],
            )
        except ValueError as exc:
            return self.send_response(
                True,
                "bad_request",
                {"details": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        course.refresh_from_db()
        return self.ok(
            self.get_serializer(course).data,
            message="Course reactivated.",
        )


class CourseSearchView(
    CourseRosterExpandSerializeMixin, OptimizedSearchMixin, RBACSearchView
):
    name = "Course search view"
    model = models.Course
    serializer = serializers.CourseSerializer
    required_permissions = {"POST": "course.view"}
    expand_prefetch_specs = _COURSE_EXPAND_PREFETCH_SPECS

    def get_filter_params(self, request: Request):
        from app_course.course_search import get_search_q, strip_status_filters
        from app_course.course_status import (
            extract_status_filter_values,
            filter_params_without_status,
        )

        filter_params = request.data.get("filter_params", [])
        self._effective_status_filter = extract_status_filter_values(filter_params)
        filter_params = filter_params_without_status(filter_params)
        if get_search_q(request):
            filter_params = strip_status_filters(filter_params)
        new_filter_params = [i for i in filter_params if "|" not in i["field_name"]]
        validated = self.validate_body_params(new_filter_params, request)
        return self.build_body_params(validated)

    def get_chained_filter_params(self, request: Request):
        from app_course.course_search import get_search_q, strip_status_filters

        filter_params = request.data.get("filter_params", [])
        if get_search_q(request):
            filter_params = strip_status_filters(filter_params)
        new_filter_params = [i for i in filter_params if "|" in i["field_name"]]
        validated = self.validate_body_params(new_filter_params, request)
        q_objects = []
        for i in validated:
            field_names = i["field_name"].split("|")
            op = i["operator"]
            value = i["value"]
            q_chain = Q()
            for f in field_names:
                if op == "in":
                    q_object = Q(**{f"{f}__{op}": value.split(",")})
                elif op == "isnull":
                    q_object = Q(**{f"{f}__{op}": value in ("true", "True", "1")})
                else:
                    q_object = Q(**{f"{f}__{op}": value})
                q_chain = q_chain | q_object
            q_objects.append(q_chain)
        return q_objects

    def augment_search_queryset(self, queryset, expand, is_csv):
        queryset = super().augment_search_queryset(queryset, expand, is_csv)
        queryset = annotate_course_queryset_first_event_times(queryset)
        queryset = prefetch_course_teacher_roster_for_list_serializer(queryset)
        from app_course.course_search import (
            apply_course_search_q_with_meta,
            extract_scope_ids_from_filter_params,
            get_search_q,
            load_scope_names,
        )
        from app_course.course_status import apply_effective_status_filter

        q = get_search_q(self.request)
        if q:
            filter_params = self.request.data.get("filter_params") or []
            program_id, intake_id = extract_scope_ids_from_filter_params(filter_params)
            scope_program_name, scope_intake_name = load_scope_names(program_id, intake_id)
            queryset, self._search_used_fallback = apply_course_search_q_with_meta(
                queryset,
                q,
                program_name=scope_program_name,
                intake_name=scope_intake_name,
            )
        else:
            self._search_used_fallback = False
        status_values = getattr(self, "_effective_status_filter", None)
        if status_values:
            queryset = apply_effective_status_filter(queryset, status_values)
        return queryset.distinct()

    # find courses the user is assigned to or courses they created then combine without duplicates
    def post(self, request: Request, filter_ids=None):
        from app_course.course_search import get_search_q
        from app_course.services.aggregate import build_course_aggregates

        self._search_used_fallback = False
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        facets = request.data.get("facets") or []

        held = set(effective_permissions(user))
        if scoping.has_read_breadth("course", held):
            base_qs = models.Course.objects.all()
            response = super().post(request, filter_ids)
        else:
            base_qs = scope_courses_for_user(user)
            course_ids = list(base_qs.values_list("id", flat=True))
            response = super().post(request, course_ids)

        q = None
        try:
            q = get_search_q(request)
        except Exception:
            pass

        if hasattr(response, "data") and isinstance(response.data, dict):
            if q:
                response.data["used_fallback"] = getattr(
                    self, "_search_used_fallback", False
                )
            if facets:
                response.data["facets"] = build_course_aggregates(
                    base_qs=base_qs,
                    request_filter_params=request.data.get("filter_params") or [],
                    facets=facets,
                    q=q or None,
                )
        return response


class CourseSuggestView(RBACView):
    """GET /courses/suggest?q= — typeahead (FTS, Redis-cached)."""

    name = "Course suggest view"
    model = models.Course
    required_permissions = {"GET": "course.view"}

    def get(self, request: Request):
        from django.db.models import F

        from app_course.cache import cached_suggest
        from app_course.course_search import course_suggest_queryset

        q = (request.query_params.get("q") or "").strip()
        if len(q) < 2:
            return self.ok([])

        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        base_qs = scope_courses_for_user(user).select_related("program", "subject")

        def load():
            from app_course.course_status import annotate_effective_status

            qs = course_suggest_queryset(base_qs, q, limit=8)
            rows = list(
                annotate_effective_status(qs)
                .annotate(
                    program_name=F("program__name"),
                    subject_name=F("subject__name"),
                )
                .values(
                    "id",
                    "title",
                    "code",
                    "effective_status",
                    "program_name",
                    "subject_name",
                )
            )
            for row in rows:
                row["status"] = row.pop("effective_status")
            return rows

        results = cached_suggest(q, load)
        return self.ok(results)


class CourseAggregateView(RBACSearchView):
    """POST /courses/aggregate — facet counts for Academic Hub filter chips."""

    name = "Course aggregate view"
    model = models.Course
    serializer = serializers.CourseSerializer
    required_permissions = {"POST": "course.view"}

    def post(self, request: Request):
        from app_course.course_search import get_search_q
        from app_course.services.aggregate import build_course_aggregates

        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        facets = request.data.get("facets") or []
        q = get_search_q(request) or None

        held = set(effective_permissions(user))
        base_qs = (
            models.Course.objects.all()
            if scoping.has_read_breadth("course", held)
            else scope_courses_for_user(user)
        )

        raw_filters = request.data.get("filter_params") or []
        return self.ok(
            build_course_aggregates(
                base_qs=base_qs,
                request_filter_params=raw_filters,
                facets=facets,
                q=q,
            )
        )


class CourseSubjectUsageView(RBACSearchView):
    """POST /courses/subject-usage — shared subject usage rows."""

    name = "Course subject usage view"
    model = models.Course
    serializer = serializers.CourseSerializer
    required_permissions = {"POST": "course.view"}

    def post(self, request: Request):
        from app_course.course_search import get_search_q
        from app_course.services.aggregate import build_subject_usage_rows

        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        q = get_search_q(request) or None
        include_all_courses = bool(request.data.get("include_all_courses", False))

        held = set(effective_permissions(user))
        base_qs = (
            models.Course.objects.all()
            if scoping.has_read_breadth("course", held)
            else scope_courses_for_user(user)
        )

        return self.ok(
            {
                "subjects": build_subject_usage_rows(
                    base_qs=base_qs,
                    request_filter_params=request.data.get("filter_params") or [],
                    include_all_courses=include_all_courses,
                    q=q,
                )
            }
        )


class AssignedAsRoleListView(RBACListView):
    name = "AssignedAsRole list view"
    model = models.AssignedAsRole
    serializer = serializers.AssignedAsRoleSerializer
    required_permissions = {"GET": "course_role.manage", "POST": "course_role.manage"}


class AssignedAsRoleDetailsView(RBACDetailsView):
    name = "AssignedAsRole details view"
    model = models.AssignedAsRole
    serializer = serializers.AssignedAsRoleSerializer
    required_permissions = {
        "GET": "course_role.manage",
        "PUT": "course_role.manage",
        "PATCH": "course_role.manage",
        "DELETE": "course_role.manage",
    }


class AssignedAsRoleSearchView(RBACSearchView):
    name = "AssignedAsRole search view"
    model = models.AssignedAsRole
    serializer = serializers.AssignedAsRoleSerializer
    required_permissions = {"POST": "course_role.manage"}


class CourseAvailabilityView(RBACView):
    model = models.User
    serializer = serializers.UserSerializer
    required_permissions = {"POST": "course.manage_members"}

    def _apply_candidate_search(self, request, queryset):
        from app_auth.user_search import apply_user_search_q_with_meta, get_search_q

        q = get_search_q(request)
        if not q:
            return queryset
        filtered, _used_fallback = apply_user_search_q_with_meta(queryset, q)
        return filtered

    def post(self, request: Request, course_id: int):
        course = (
            models.Course.objects.filter(id=course_id)
            .prefetch_related("events")
            .first()
        )
        if not course:
            return self.not_found("No such course with the given id.")
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_write(user, course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")
        from app_course.collision_availability import (
            collision_check_disabled_for_role,
            fetch_busy_collisions_for_course_sessions,
        )

        raw_role_id = request.query_params.get("assigned_as_role_id")
        assigned_as_role_id = None
        if raw_role_id not in (None, ""):
            try:
                assigned_as_role_id = int(raw_role_id)
            except (TypeError, ValueError):
                return self.bad_request("Invalid assigned_as_role_id.")

        skip_collision = collision_check_disabled_for_role(assigned_as_role_id)
        tenant_tz = getattr(request.tenant, "timezone", None) or "UTC"
        if skip_collision:
            busy_collisions: list = []
        else:
            busy_collisions = fetch_busy_collisions_for_course_sessions(
                course_id=course_id,
                tenant_tz=tenant_tz,
            )
        busy_by_user = {row.user_id: row.reason for row in busy_collisions}
        try:
            self.sorts = self.get_sort_param(request)
            self.expand = self.get_expand_param(request)
            self.fields = self.get_fields_param(request)
        except BadRequest as e:
            return self.send_response(
                True, "bad_request", {"details": str(e)}, status=400
            )
        if request.query_params.get("onlyFree"):
            only_free = bool(request.query_params.get("onlyFree"))
            if only_free:
                users = self._apply_candidate_search(
                    request,
                    models.User.objects.active()
                    .filter(**self.get_filter_params(request))
                    .filter(*self.get_chained_filter_params(request))
                    .exclude(**self.get_exclude_params(request)),
                )
                users = users.exclude(id__in=busy_by_user.keys()).order_by(*self.sorts)
                serialized_users = self.get_serializer(
                    self.paginate_queryset(users, request),
                    many=True,
                    expand=self.expand,
                    fields=self.fields,
                )
                return self.send_response(
                    False,
                    "ok",
                    {**self.get_paginated_response(), "data": serialized_users.data},
                )
        users = self._apply_candidate_search(
            request,
            models.User.objects.active()
            .filter(**self.get_filter_params(request))
            .filter(*self.get_chained_filter_params(request))
            .exclude(**self.get_exclude_params(request)),
        )
        users = users.order_by(*self.sorts)
        serialized_users = self.get_serializer(
            self.paginate_queryset(users, request),
            many=True,
            expand=self.expand,
            fields=self.fields,
        )
        for i in serialized_users.data:
            reason = busy_by_user.get(i["id"])
            if reason is not None:
                i["isFree"] = False
                i["busyReason"] = reason
            else:
                i["isFree"] = True
                i["busyReason"] = None
        return self.send_response(
            False,
            "ok",
            {**self.get_paginated_response(), "data": serialized_users.data},
        )


class UserCourseListView(RBACListView):
    name = "UserCourse list view"
    model = models.UserCourse
    serializer = serializers.UserCourseSerializer
    required_permissions = {"GET": "course.view"}

    def get(self, request: Request, filter_ids=None):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        held = set(effective_permissions(user))
        if scoping.has_read_breadth("course", held):
            return super().get(request, filter_ids)
        ids = list(scope_user_courses_for_user(user).values_list("id", flat=True))
        return super().get(request, ids)

    def post(self, request: Request):
        raise MethodNotAllowed("POST")


class UserCourseDetailsView(RBACDetailsView):
    name = "UserCourse details view"
    model = models.UserCourse
    serializer = serializers.UserCourseSerializer
    required_permissions = {
        "GET": "course.view",
        "PUT": "course.manage_members",
        "PATCH": "course.manage_members",
        "DELETE": "course.manage_members",
    }

    def get(self, request: Request, obj_id: int):
        user_course = models.UserCourse.objects.filter(id=obj_id).select_related("course").first()
        if not user_course:
            return self.send_not_found(obj_id)
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_user_course_read(user, user_course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this roster record.")
        return super().get(request, obj_id)

    def put(self, request: Request, obj_id: int):
        user_course = models.UserCourse.objects.filter(id=obj_id).select_related("course").first()
        if not user_course:
            return self.send_not_found(obj_id)
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        if user.is_student():
            raise MethodNotAllowed("PUT")
        try:
            check_user_course_write(user, user_course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this roster record.")
        return super().put(request, obj_id)

    def delete(self, request: Request, obj_id: int):
        user_course = models.UserCourse.objects.filter(id=obj_id).select_related("course").first()
        if not user_course:
            return self.send_not_found(obj_id)
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_user_course_write(user, user_course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this roster record.")
        if (
            user_course.user_id == user.id
            and user_course.assigned_as == models.UserCourse.AssignedAs.TEACHER
        ):
            try:
                check_teacher_event_assignment(
                    user, user_course.user_id, user_course.course
                )
            except PermissionDenied:
                return self.forbidden(
                    "You don't have permission to assign yourself to course events."
                )

        course_id = user_course.course_id

        if user_course.assigned_as != models.UserCourse.AssignedAs.STUDENT:
            soft_delete_userevents(
                UserEvent.objects.filter(
                    user_id=user_course.user.id,
                    event__course_id=user_course.course.id,
                )
            )
        if tenant_syncs_course_team_roster(request.tenant):
            task = Task(name=Task.TaskName.REMOVE_MS_MEMBER, data={"group_id": user_course.course.microsoft_group_id,
                                                                   "user_id": user_course.user.microsoft_id,
                                                                   "role": "owners"})
            task.save()

        if user_course.assigned_as == models.UserCourse.AssignedAs.TEACHER:
            serialized_data = self.get_serializer(user_course)
            response_payload = serialized_data.data
            close_teacher_user_course(user_course)
            refresh_course_member_counts_now([course_id])
            return self.deleted(response_payload)

        response = super().delete(request, obj_id)
        refresh_course_member_counts_now([course_id])
        return response


class UserCourseRosterExpandSerializeMixin:
    """Prime caches for user-courses search when clients expand user."""

    def _is_roster_order_request(self) -> bool:
        qp = self.request.query_params
        return (
            qp.get("student_roster_order") == "true"
            or qp.get("teacher_roster_order") == "true"
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self._is_roster_order_request():
            context["omit_nested_user_scopes"] = True
        return context

    def get_serializer(self, *args, **kwargs):
        if kwargs.get("many") and args:
            from app_custom_fields.validation import prime_custom_field_representation_cache

            expand = kwargs.get("expand") or []
            if expand_includes_prefix(expand, "user"):
                prime_custom_field_representation_cache(self.request)
                prime_user_course_roster_id_card_cache(self.request, args[0], expand)
        return super().get_serializer(*args, **kwargs)


_USER_COURSE_USER_EXPAND_SPEC = ExpandPrefetchSpec(
    trigger_expand="user",
    replace_lookup="user",
    queryset_factory=build_user_queryset_for_roster_expand,
)


class UserCourseSearchView(
    UserCourseRosterExpandSerializeMixin, OptimizedSearchMixin, RBACSearchView
):
    name = "UserCourse search view"
    model = models.UserCourse
    serializer = serializers.UserCourseSerializer
    required_permissions = {"POST": "course.view"}
    base_select_related = ("assigned_as_role", "course")
    expand_prefetch_specs = [_USER_COURSE_USER_EXPAND_SPEC]

    def post(self, request: Request, filter_ids=None):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        held = set(effective_permissions(user))
        try:
            if scoping.has_read_breadth("course", held):
                return super().post(request, filter_ids)
            ids = list(scope_user_courses_for_user(user).values_list("id", flat=True))
            return super().post(request, ids)
        except BadRequest as e:
            return self.bad_request(str(e))

    def augment_search_queryset(self, queryset, expand, is_csv):
        queryset = super().augment_search_queryset(queryset, expand, is_csv)
        if not expand_includes_prefix(expand, "user"):
            queryset = queryset.select_related("user")
        sorts = self.get_sort_param(self.request)
        explicit_sorts = [s for s in sorts if s != "is_fully_paid"]
        if explicit_sorts:
            order_fields = normalize_user_course_sorts(explicit_sorts)
            return queryset.order_by(*order_fields, "id")
        if self.request.query_params.get("student_roster_order") == "true":
            return queryset.order_by("user__name", "id")
        if self.request.query_params.get("teacher_roster_order") != "true":
            return queryset
        from django.db.models import Case, IntegerField, When

        role = models.AssignedAsRole
        return (
            queryset.annotate(
                _roster_rank=Case(
                    When(assigned_as_role__isnull=True, then=2),
                    When(
                        assigned_as_role__seniority=role.Seniority.MAIN_TEACHER,
                        then=0,
                    ),
                    When(
                        assigned_as_role__seniority=role.Seniority.ASSISTANT_TEACHER,
                        then=1,
                    ),
                    When(
                        assigned_as_role__seniority=role.Seniority.OTHER,
                        then=3,
                    ),
                    default=2,
                    output_field=IntegerField(),
                ),
            )
            .order_by("_roster_rank", "user__name", "id")
        )


class UserCourseManagementView(RBACView):
    """
    Receives an array of UserCourses. Filter to two arrays: those which has isRemoved true, and those which don't.

    For the second array, if the UserCourse already exists (check the existence by
    UserCourse.objects.filter(user_id=user_id, course_id=course_id).all() because they are unique together.
    ), delete the row. Else, ignore.

    For the second array, if the UserCourse exists (checking logic same as above),
    update the row, else, create one.
    """

    model = models.UserCourse
    serializer = serializers.UserCourseSerializer
    required_permissions = {"POST": "course.manage_members"}

    def post(self, request: Request):
        from app_course.roster_management import (
            apply_user_course_management,
            classify_roster_creates,
            validate_roster_creates_for_teams,
        )

        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        course_ids = {i.get("course") for i in request.data if i.get("course") is not None}
        for course_id in course_ids:
            course = models.Course.objects.filter(id=course_id).only("id").first()
            if not course:
                return self.not_found(f"No such course with id {course_id}.")
            try:
                check_course_write(user, course)
            except PermissionDenied:
                return self.forbidden("You do not have access to one or more courses.")
        to_be_removed = []
        entities = []
        for i in request.data:
            if i.get("isRemoved"):
                to_be_removed.append(i)
            else:
                entities.append(i)
        for i in entities:
            if "isRemoved" in i.keys():
                del i["isRemoved"]

        to_be_created = classify_roster_creates(
            entities=entities, to_be_removed=to_be_removed
        )
        created_entities = self.get_serializer(data=to_be_created, many=True)
        if not created_entities.is_valid():
            return self.send_response(
                True, "error", {"details": [created_entities.errors]}, status=400
            )
        teams_error = validate_roster_creates_for_teams(
            tenant=request.tenant, to_be_created=to_be_created
        )
        if teams_error:
            return self.send_response(
                True,
                "bad_request",
                {"details": teams_error},
                status=400,
            )

        try:
            graph_sync_rows = apply_user_course_management(
                actor=user,
                tenant=request.tenant,
                to_be_removed=to_be_removed,
                entities=entities,
            )
        except ValidationError as exc:
            return self.send_response(
                True, "error", {"details": [exc.detail]}, status=400
            )
        if graph_sync_rows:
            try:
                users = User.objects.filter(
                    id__in=[i["user"] for i in graph_sync_rows]
                ).all()
                courses = models.Course.objects.filter(
                    id__in=[i["course"] for i in graph_sync_rows]
                ).all()
                group = MSGroup(request.tenant)
                for i in graph_sync_rows:
                    role = "owners"
                    if i["assigned_as"] == "student":
                        role = "members"
                    group.add_member(
                        users.filter(id=i["user"]).first().microsoft_id,
                        courses.filter(id=i["course"]).first().microsoft_group_id,
                        role,
                    )
            except ValueError as e:
                return self.bad_request(str(e))
            except RuntimeError as e:
                return self.send_response(
                    True,
                    "bad_gateway",
                    {"details": str(e)},
                    status=502,
                )
            except RequestException as e:
                return self.send_response(
                    True,
                    "bad_gateway",
                    {
                        "details": (
                            "Could not reach Microsoft to update class teams. "
                            f"Try again in a moment. ({e})"
                        )
                    },
                    status=502,
                )
        affected_course_ids = {i["course"] for i in to_be_removed} | {
            i["course"] for i in entities
        }
        refresh_course_member_counts_now(affected_course_ids)
        return self.send_response(
            False, "ok", {"details": "All good. Don't worry about it."}
        )


class CourseStudentCandidateSearchView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "course.manage_members"}

    def post(self, request: Request, course_id: int):
        course = models.Course.objects.filter(id=course_id).only("id").first()
        if not course:
            return self.not_found("No such course with the given id.")
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_write(user, course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")

        input_serializer = CourseStudentCandidateSearchSerializer(data=request.data)
        if not input_serializer.is_valid():
            return self.send_response(
                True, "bad_request", {"details": input_serializer.errors}, status=400
            )

        query = input_serializer.validated_data.get("query")
        limit = input_serializer.validated_data.get("limit")

        candidates_queryset = build_student_candidates_queryset(course_id, query)
        candidates = list(
            candidates_queryset[:limit].values("id", "name", "email", "code")
        )
        return self.ok(candidates, message="ok")


class CourseStudentListCreateView(RBACView):
    name = "Course student list/create view"
    required_permissions = {
        "GET": "course.manage_members",
        "POST": "course.manage_members",
    }

    def get(self, request: Request, course_id: int):
        course = models.Course.objects.filter(id=course_id).only("id").first()
        if not course:
            return self.not_found("No such course with the given id.")
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_write(user, course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")

        user_courses = (
            models.UserCourse.objects.filter(
                course_id=course_id,
                assigned_as=models.UserCourse.AssignedAs.STUDENT,
            )
            .select_related("user")
            .only("id", "user__id", "user__name", "user__email", "user__code")
            .order_by("user__name", "id")
        )

        students = [
            {
                "user_course_id": user_course.id,
                "id": user_course.user.id,
                "name": user_course.user.name,
                "email": user_course.user.email,
                "code": user_course.user.code,
            }
            for user_course in user_courses
        ]
        return self.ok(students, message="ok")

    def post(self, request: Request, course_id: int):
        course: models.Course = (
            models.Course.objects.filter(id=course_id)
            .only("id", "microsoft_group_id")
            .first()
        )
        if not course:
            return self.not_found("No such course with the given id")
        actor = acting_user(request)
        if actor is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_write(actor, course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")

        input_serializer = CourseStudentAddSerializer(data=request.data)
        if not input_serializer.is_valid():
            return self.send_response(
                True, "bad_request", {"details": input_serializer.errors}, status=400
            )

        user_id = input_serializer.validated_data.get("user_id")
        user: models.User = models.User.objects.filter(id=user_id).only(
            "id", "microsoft_id"
        ).first()
        if not user:
            return self.not_found("No such user with the given id")
        if tenant_syncs_course_team_roster(request.tenant):
            if not user.microsoft_id:
                return self.send_response(
                    True,
                    "bad_request",
                    {
                        "details": (
                            "This student is not linked to Microsoft 365 yet. "
                            "Link their Microsoft account before adding them to a class that uses Teams."
                        )
                    },
                    status=400,
                )
            if not course.microsoft_group_id:
                return self.send_response(
                    True,
                    "bad_request",
                    {
                        "details": (
                            "This class does not have a Microsoft team linked. "
                            "Link or create the team for this class before adding students."
                        )
                    },
                    status=400,
                )
            try:
                MSGroup(request.tenant).add_member(
                    user.microsoft_id,
                    course.microsoft_group_id,
                    "members",
                )
            except ValueError as e:
                return self.bad_request(str(e))
            except RuntimeError as e:
                return self.send_response(
                    True,
                    "bad_gateway",
                    {"details": str(e)},
                    status=502,
                )
            except RequestException as e:
                return self.send_response(
                    True,
                    "bad_gateway",
                    {
                        "details": (
                            "Could not reach Microsoft to update the class team. "
                            f"Try again in a moment. ({e})"
                        )
                    },
                    status=502,
                )

        with transaction.atomic():
            user.is_waiting_for_activation = False
            user.save()
            user_course, created = models.UserCourse.objects.get_or_create(
                user_id=user.id,
                course_id=course.id,
                defaults={"assigned_as": models.UserCourse.AssignedAs.STUDENT},
            )
            if created:
                record_membership_event(
                    course_id=course.id,
                    user_id=user.id,
                    event_type=models.CourseMembershipEvent.EventType.JOINED,
                    actor_id=actor.id,
                    source=models.CourseMembershipEvent.Source.API,
                )
        refresh_course_member_counts_now([course.id])
        return self.send_response(False, "ok", {"details": "Student added."})


class CourseStudentRemoveView(RBACView):
    name = "Course student remove view"
    required_permissions = {"DELETE": "course.manage_members"}

    def delete(self, request: Request, course_id: int, user_id: int):
        course = models.Course.objects.filter(id=course_id).only("id").first()
        if not course:
            return self.not_found("No such course with the given id.")
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_write(user, course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")

        user_course: models.UserCourse = models.UserCourse.objects.filter(
            course_id=course_id,
            user_id=user_id,
            assigned_as=models.UserCourse.AssignedAs.STUDENT,
        ).prefetch_related("course", "user").first()
        if not user_course:
            return self.not_found("No suh student asignment exists.")

        if tenant_syncs_course_team_roster(request.tenant):
            group = MSGroup(request.tenant)
            try:
                x = group.remove_member(user_course.course.microsoft_group_id, user_course.user.microsoft_id, "members")
            except Exception as e:
                print("Error removing member from MS Group:", str(e))
        with transaction.atomic():
            record_membership_event(
                course_id=course_id,
                user_id=user_id,
                event_type=models.CourseMembershipEvent.EventType.REMOVED,
                actor_id=user.id,
                source=models.CourseMembershipEvent.Source.API,
            )
            user_course.delete()
        refresh_course_member_counts_now([course_id])

        return self.send_response(False, "ok", {"details": "Student removed."})


class CourseMembershipHistoryView(RBACView):
    name = "Course membership history view"
    required_permissions = {"GET": "course.manage_members"}

    def get(self, request: Request, course_id: int):
        course = models.Course.objects.filter(id=course_id).only("id").first()
        if not course:
            return self.not_found("No such course with the given id.")
        actor = acting_user(request)
        if actor is None:
            return self.forbidden("Authentication required.")
        if actor.is_student():
            return self.forbidden("Students cannot view membership history.")
        try:
            check_course_write(actor, course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")

        qs = models.CourseMembershipEvent.objects.filter(course_id=course_id).select_related(
            "user", "actor"
        )
        event_type = request.query_params.get("event_type")
        if event_type in (
            models.CourseMembershipEvent.EventType.JOINED,
            models.CourseMembershipEvent.EventType.REMOVED,
        ):
            qs = qs.filter(event_type=event_type)

        page_size = min(int(request.query_params.get("page_size", 50)), 200)
        page = max(int(request.query_params.get("page", 1)), 1)
        total = qs.count()
        offset = (page - 1) * page_size
        events = qs[offset : offset + page_size]

        active_student_user_ids = set(
            models.UserCourse.objects.filter(
                course_id=course_id,
                assigned_as=models.UserCourse.AssignedAs.STUDENT,
            ).values_list("user_id", flat=True)
        )

        results = [
            {
                "id": event.id,
                "event_type": event.event_type,
                "occurred_at": event.occurred_at,
                "user": {
                    "id": event.user_id,
                    "name": event.user.name,
                    "email": event.user.email,
                },
                "actor": (
                    {"id": event.actor_id, "name": event.actor.name}
                    if event.actor_id
                    else None
                ),
                "can_re_enroll": (
                    event.event_type == models.CourseMembershipEvent.EventType.REMOVED
                    and event.user_id not in active_student_user_ids
                ),
            }
            for event in events
        ]
        return self.ok({"results": results, "count": total})


class TeacherAssignView(RBACView):
    model = UserEvent
    serializer = UserEventSerializer
    required_permissions = {"POST": "course.manage_members"}

    def post(self, request: Request, course_id: int):
        from app_course.course_role_policy import (
            MissingMainTeacherRole,
            course_roles_enabled,
            resolve_teacher_assigned_as_role,
        )

        course = models.Course.objects.filter(id=course_id).first()
        if not course:
            return self.not_found("No such course exists.")
        acting = acting_user(request)
        if acting is None:
            return self.forbidden("Authentication required.")

        required_fields = ("user_id", "new_events", "removed_events")
        if course_roles_enabled(request.tenant):
            required_fields = required_fields + ("assigned_as_role_id",)
        missing = [field for field in required_fields if field not in request.data]
        if missing:
            return self.bad_request(f"Missing required fields: {', '.join(missing)}")

        user_id = request.data["user_id"]
        try:
            check_teacher_event_assignment(acting, user_id, course)
        except PermissionDenied as exc:
            return self.forbidden(str(exc))

        user = User.objects.filter(id=user_id).first()
        if not user:
            return self.not_found("No such user exists.")

        try:
            assigned_as_role = resolve_teacher_assigned_as_role(
                tenant=request.tenant,
                requested_role_id=request.data.get("assigned_as_role_id"),
            )
        except MissingMainTeacherRole as exc:
            return self.bad_request(str(exc))
        except ValidationError as exc:
            return self.bad_request(exc.detail)

        from app_course.substitute_policy import substitute_teachers_enabled
        from django.utils.dateparse import parse_date

        raw_auto_remove = request.data.get("substitute_auto_remove_on")
        auto_remove_on = None
        if raw_auto_remove not in (None, ""):
            if not (
                substitute_teachers_enabled(request.tenant)
                and assigned_as_role.is_substitute
            ):
                return self.bad_request(
                    {
                        "substitute_auto_remove_on": (
                            "Automatic removal is only available for substitute course roles."
                        )
                    }
                )
            parsed = parse_date(str(raw_auto_remove))
            if parsed is None:
                return self.bad_request(
                    {
                        "substitute_auto_remove_on": (
                            "Expected a date in YYYY-MM-DD format."
                        )
                    }
                )
            auto_remove_on = parsed

        new_events = request.data["new_events"]
        removed_events = request.data["removed_events"]
        if not isinstance(new_events, list) or not isinstance(removed_events, list):
            return self.bad_request("new_events and removed_events must be lists.")

        user_course = None
        if not models.UserCourse.objects.filter(user_id=user.id, course_id=course_id).exists():
            hourly_rate = get_rate_from_user_course_rates(user, course)
            user_course = models.UserCourse(
                user=user,
                course=course,
                assigned_as="teacher",
                assigned_as_role=assigned_as_role,
                hourly_rate=hourly_rate,
                substitute_auto_remove_on=auto_remove_on,
            )
            if tenant_syncs_course_team_roster(request.tenant):
                if not user.microsoft_id:
                    return self.send_response(
                        True,
                        "bad_request",
                        {
                            "details": (
                                "This teacher is not linked to Microsoft 365 yet. "
                                "Link their Microsoft account before adding them to a class that uses Teams."
                            )
                        },
                        status=400,
                    )
                if not course.microsoft_group_id:
                    return self.send_response(
                        True,
                        "bad_request",
                        {
                            "details": (
                                "This class does not have a Microsoft team linked. "
                                "Link or create the team for this class before adding teachers."
                            )
                        },
                        status=400,
                    )
                try:
                    MSGroup(request.tenant).add_member(
                        user.microsoft_id,
                        course.microsoft_group_id,
                        "owners",
                    )
                except ValueError as e:
                    return self.bad_request(str(e))
                except RuntimeError as e:
                    return self.send_response(
                        True,
                        "bad_gateway",
                        {"details": str(e)},
                        status=502,
                    )
                except RequestException as e:
                    return self.send_response(
                        True,
                        "bad_gateway",
                        {
                            "details": (
                                "Could not reach Microsoft to update the class team. "
                                f"Try again in a moment. ({e})"
                            )
                        },
                        status=502,
                    )
                schedule_update_course_meeting_attendees(course, request.tenant)
        else:
            user_course = models.UserCourse.objects.filter(
                user_id=user.id,
                course_id=course_id,
            ).first()
            if not user_course:
                return self.not_found("No such user course assignment exists.")
            user_course.assigned_as_role = assigned_as_role
            user_course.substitute_auto_remove_on = auto_remove_on

        removed_event_ids = [i["id"] for i in removed_events]
        new_event_ids = [i["id"] for i in new_events]

        with transaction.atomic():
            if user_course:
                user_course.save()
                refresh_course_member_counts_now([course_id])

            removed_events_instances = UserEvent.objects.filter(
                user_id=user.id,
                event_id__in=removed_event_ids,
            )
            from app_attendance.userevent_sync import ensure_teacher_userevents_for_events

            ensure_teacher_userevents_for_events(
                course_id=course_id,
                event_ids=new_event_ids,
                user_ids=[user.id],
            )
            soft_delete_userevents(removed_events_instances)

        return self.send_response(False, "ok", {"details": "All good."})


class EventListView(RBACListView):
    name = "Event list view"
    model = models.Event
    serializer = serializers.EventSerializer
    required_permissions = {"GET": "course.view", "POST": "course.manage_content"}

    def augment_search_queryset(self, queryset, expand, is_csv):
        from app_course.event_annotations import annotate_events_has_checkin

        return annotate_events_has_checkin(queryset)

    def get(self, request: Request, filter_ids=None):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        held = set(effective_permissions(user))
        if scoping.has_read_breadth("course", held):
            return super().get(request, filter_ids)
        ids = list(scope_events_for_user(user).values_list("id", flat=True))
        return super().get(request, ids)

    def post(self, request: Request):
        if request.query_params.get("bulk", None):
            return super().post(request)

        serialized_data = self.get_serializer(data=request.data)
        if not serialized_data.is_valid():
            return self.bad_request(serialized_data.errors)

        from app_course.event_overlap import (
            event_local_date,
            org_timezone,
            validate_no_overlapping_events,
        )

        new_event = models.Event(**serialized_data.validated_data)
        tz = org_timezone(request.tenant)
        local_day = event_local_date(new_event, tz)
        same_day = [
            event
            for event in models.Event.objects.filter(course_id=new_event.course_id)
            if event_local_date(event, tz) == local_day
        ]
        try:
            validate_no_overlapping_events(same_day + [new_event], tz)
        except ValidationError as exc:
            return self.send_response(
                True,
                "bad_request",
                {"details": exc.detail},
                status=400,
            )

        serialized_data.save()
        return self.created(serialized_data.data)


class CourseEventEditView(RBACView):
    name = "Course event edit view"
    model = models.Event
    serializer = serializers.EventSerializer
    required_permissions = {"POST": "course.manage_content"}

    def post(self, request: Request, obj_id: int):
        course = models.Course.objects.filter(id=obj_id).first()
        if not course:
            return self.not_found("No such course exists.")
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_write(user, course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")

        events_to_be_deleted = []
        events_to_be_created = []
        events_to_be_updated = []
        create_draft_ids: list[str | None] = []

        overlap_merges = request.data.get("overlap_merges") or []
        merge_source_ids = {
            int(source_id)
            for entry in overlap_merges
            for source_id in entry.get("source_event_ids", [])
        }

        for i in request.data["events"]:
            if i.get("is_deleted"):
                events_to_be_deleted.append(i["id"])
            elif "new" in str(i.get("id")):
                create_draft_ids.append(i.get("id"))
                events_to_be_created.append(i)
            elif i.get("is_edit"):
                events_to_be_updated.append(i)

        to_be_updated = models.Event.objects.filter(id__in=[i["id"] for i in events_to_be_updated]).all()
        for i in events_to_be_created:
            i["course"] = obj_id
            del i['id']
        serialized_events_to_be_created = self.get_serializer(
            data=events_to_be_created, many=True, context={"cached_object": course}
        )
        serialized_events_to_be_updated = self.get_serializer(
            to_be_updated,
            data=events_to_be_updated,
            many=True,
            partial=True,
            context={"cached_object": course},
        )

        errors = []
        if not serialized_events_to_be_created.is_valid():
            errors.append(serialized_events_to_be_created.errors)
        if not serialized_events_to_be_updated.is_valid():
            errors.append(serialized_events_to_be_updated.errors)
        if len(errors) > 0:
            return self.validation_error(errors)

        course_payload = dict(request.data.get("course") or {})
        if course.program.is_session_credit_scheduling:
            from app_course.session_credit_services import (
                simulate_remaining_events,
                span_dates_from_events,
                validate_session_credit_simulated_events,
            )

            simulated = simulate_remaining_events(
                course_id=obj_id,
                delete_ids=events_to_be_deleted,
                update_payloads=events_to_be_updated,
                update_validated=serialized_events_to_be_updated.validated_data,
                create_validated=serialized_events_to_be_created.validated_data,
            )
            effective_max = course_payload.get("max_sessions", course.max_sessions)
            try:
                validate_session_credit_simulated_events(
                    simulated, effective_max, program=course.program
                )
            except ValidationError as exc:
                return self.validation_error(exc.detail)
            span = span_dates_from_events(simulated)
            if span is not None:
                start, end = span
                if end <= start:
                    end = start + timedelta(days=1)
                course_payload["start_date"] = start.isoformat()
                course_payload["end_date"] = end.isoformat()
            else:
                course_payload.pop("start_date", None)
                course_payload.pop("end_date", None)

        course_serializer = serializers.CourseSerializer(
            course,
            data=course_payload,
            partial=True,
            context={
                "request": request,
                "skip_mandatory_exam_fields": True,
                "session_credit_events_pending": True,
            },
        )
        if not course_serializer.is_valid():
            errors.append(course_serializer.errors)
        if errors:
            return self.validation_error(errors)

        from app_course.event_edit_services import apply_course_event_edit
        from app_course.event_overlap import validate_simulated_course_event_edit

        try:
            validate_simulated_course_event_edit(
                course_id=obj_id,
                delete_ids=events_to_be_deleted,
                update_payloads=events_to_be_updated,
                update_validated=serialized_events_to_be_updated.validated_data,
                create_validated=serialized_events_to_be_created.validated_data,
                org=request.tenant,
            )
        except ValidationError as exc:
            return self.send_response(
                True,
                "bad_request",
                {"details": exc.detail},
                status=400,
            )

        delete_ids_for_guard = [
            event_id
            for event_id in events_to_be_deleted
            if int(event_id) not in merge_source_ids
        ]
        blocked = (
            UserEvent.objects.filter(
                event_id__in=delete_ids_for_guard,
                checkin_time__isnull=False,
            )
            .values_list("event_id", flat=True)
            .distinct()
        )
        if blocked:
            return self.send_response(
                True,
                "bad_request",
                {
                    "details": {
                        "message": (
                            "Cannot delete sessions that have check-in records. "
                            "Remove or adjust check-ins first."
                        ),
                        "event_ids": list(blocked),
                    }
                },
                status=400,
            )

        created_data, updated_events = apply_course_event_edit(
            course=course,
            course_serializer=course_serializer,
            serialized_events_to_be_created=serialized_events_to_be_created,
            create_draft_ids=create_draft_ids,
            overlap_merges=overlap_merges,
            events_to_be_deleted=events_to_be_deleted,
            merge_source_ids=merge_source_ids,
            events_to_be_updated=events_to_be_updated,
            has_creates=bool(events_to_be_created),
        )

        return self.send_response(
            False,
            "created and updated",
            {"details": [*created_data, *updated_events]},
        )


class EventDetailsView(RBACDetailsView):
    name = "Event details view"
    model = models.Event
    serializer = serializers.EventSerializer
    required_permissions = {
        "GET": "course.view",
        "PUT": "course.manage_content",
        "PATCH": "course.manage_content",
        "DELETE": "course.manage_content",
    }

    def _get_event(self, obj_id: int):
        return models.Event.objects.filter(id=obj_id).select_related("course").first()

    def get(self, request: Request, obj_id: int):
        event = self._get_event(obj_id)
        if event is None:
            return self.send_not_found(obj_id)
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_read(user, event.course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this event.")
        return super().get(request, obj_id)

    def put(self, request: Request, obj_id: int):
        event = self._get_event(obj_id)
        if event is None:
            return self.send_not_found(obj_id)
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_write(user, event.course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this event.")
        return super().put(request, obj_id)

    def patch(self, request: Request, obj_id: int):
        return self.put(request, obj_id)

    def delete(self, request: Request, obj_id: int):
        event = self._get_event(obj_id)
        if event is None:
            return self.send_not_found(obj_id)
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_write(user, event.course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this event.")
        return super().delete(request, obj_id)


class EventSearchView(RBACSearchView):
    name = "Event search view"
    model = models.Event
    serializer = serializers.EventSerializer
    required_permissions = {"POST": "course.view"}

    def post(self, request: Request, filter_ids=None):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        held = set(effective_permissions(user))
        if scoping.has_read_breadth("course", held):
            return super().post(request, filter_ids)
        ids = list(scope_events_for_user(user).values_list("id", flat=True))
        return super().post(request, ids)

    def augment_search_queryset(self, queryset, expand, is_csv):
        from app_course.event_annotations import annotate_events_has_checkin

        queryset = annotate_events_has_checkin(queryset)
        queryset = super().augment_search_queryset(queryset, expand, is_csv)
        if is_csv or not expand or "course" not in expand:
            return queryset
        return queryset.prefetch_related(
            Prefetch(
                "course__user_courses",
                queryset=models.UserCourse.objects.filter(
                    assigned_as=models.UserCourse.AssignedAs.TEACHER,
                ).select_related("user", "assigned_as_role"),
                to_attr="_prefetched_teacher_user_courses",
            )
        )


class AssignmentListView(RBACListView):
    name = "Assignment list view"
    model = models.Assignment
    serializer = serializers.AssignmentSerializer
    required_permissions = {"GET": "assignment.author", "POST": "assignment.author"}


class AssignmentDetailsView(RBACDetailsView):
    name = "Assignment details view"
    model = models.Assignment
    serializer = serializers.AssignmentSerializer
    required_permissions = {
        "GET": "assignment.author",
        "PUT": "assignment.author",
        "PATCH": "assignment.author",
        "DELETE": "assignment.author",
    }
    
    def get(self, request: Request, obj_id: int):
        
        assignment = models.Assignment.objects.filter(id=obj_id).first()
        if assignment:
            check_and_release_results(assignment)
        return super().get(request, obj_id)


class AssignmentSearchView(RBACSearchView):
    name = "Assignment search view"
    model = models.Assignment
    serializer = serializers.AssignmentSerializer
    required_permissions = {"POST": "assignment.author"}

    def get_queryset(self, request, *args, **kwargs):
        """
        Check submissions requested or not, if so prefetch submissions with their created_by users
        """
        expand_params = self.get_expand_param(request)

        if "submissions" in expand_params:
            filter_params = self.get_filter_params(request)
            exclude_params = self.get_exclude_params(request)
            sorts = self.get_sort_param(request)
            expand = self.get_expand_param(request)
            filter_ids = kwargs.get('filter_ids', None)
            chained_filter_params = kwargs.get('chained_filter_params', [])

            if filter_ids:
                queryset = (
                    self.model.objects.filter(**filter_params)
                    .filter(*chained_filter_params)
                    .filter(id__in=filter_ids)
                    .exclude(**exclude_params)
                    .all()
                    .order_by(*sorts)
                )
            else:
                queryset = (
                    self.model.objects.filter(**filter_params)
                    .filter(*chained_filter_params)
                    .exclude(**exclude_params)
                    .all()
                    .order_by(*sorts)
                )

            translated_expand = self.translate_expand_params(expand)
            translated_expand.discard('submissions')

            if translated_expand:
                queryset = queryset.prefetch_related(*translated_expand)

            queryset = queryset.prefetch_related(
                Prefetch(
                    'submissions',
                    queryset=models.Submission.objects.select_related('created_by')
                )
            )

            is_csv = kwargs.get('is_csv', False)
            if not is_csv:
                paginated_data = self.paginate_queryset(queryset, request)
                serialized_data = self.get_serializer(
                    paginated_data,
                    many=True,
                    fields=kwargs.get('fields', []),
                    expand=expand,
                    context={"model": self.model},
                )
                return serialized_data
            else:
                return queryset
        else:
            return super().get_queryset(request, *args, **kwargs)


class SubmissionListView(RBACListView):
    name = "Submission list view"
    model = models.Submission
    serializer = serializers.SubmissionSerializer
    required_permissions = {"GET": "grade.view_all", "POST": "assignment.submit"}


class SubmissionDetailView(RBACDetailsView):
    name = "Submission details view"
    model = models.Submission
    serializer = serializers.SubmissionSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    required_permissions = {
        "PUT": "assignment.grade",
        "PATCH": "assignment.grade",
        "DELETE": "assignment.grade",
    }

    def check_permissions(self, request):
        if request.method == "GET":
            if not getattr(request.user, "is_authenticated", False):
                raise PermissionDenied("Authentication credentials were not provided.")
            return
        super().check_permissions(request)

    def put(self, request: Request, obj_id: int):
        user = models.User.get_user_from_request(request)
        if user.is_student():
            return self.forbidden("Students cannot grade submissions.")
        return super().put(request, obj_id)

    def delete(self, request: Request, obj_id: int):
        user = models.User.get_user_from_request(request)
        
        if user.is_student():
            return self.forbidden("Students cannot delete submissions.")
        
        return super().delete(request, obj_id)


class SubmissionSearchView(OptimizedSearchMixin, RBACSearchView):
    name = "Submission search view"
    model = models.Submission
    serializer = serializers.SubmissionSerializer
    required_permissions = {"POST": "assignment.grade"}
    expand_prefetch_specs = [
        ExpandPrefetchSpec(
            trigger_expand="assignment__course",
            replace_lookup="assignment",
            queryset_factory=build_assignment_queryset_with_optimized_course,
        ),
    ]


class DailyNoteListView(RBACListView):
    name = "DailyNote list view"
    model = models.DailyNote
    serializer = serializers.DailyNoteSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "course.view", "POST": "course.manage_content"}

    def post(self, request: Request):
        user = models.User.get_user_from_request(request)
        event = models.Event.objects.filter(id=request.data.get("event")).select_related("course").first()
        if not event:
            return self.not_found("No such event.")
        if user.is_teacher():
            course = event.course
            if not course or not user_can_access_course(user, course):
                return self.send_response(
                    True,
                    "not_authorized",
                    {"details": "You are not authorized to perform this action."},
                )
        return super().post(request)


class DailyNoteDetailsView(RBACDetailsView):
    name = "DailyNote details view"
    model = models.DailyNote
    serializer = serializers.DailyNoteSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {
        "GET": "course.view",
        "PUT": "course.manage_content",
        "PATCH": "course.manage_content",
        "DELETE": "course.manage_content",
    }

    def put(self, request: Request, obj_id: int):
        user = models.User.get_user_from_request(request)
        daily_note = (
            models.DailyNote.objects.filter(id=obj_id)
            .prefetch_related("event__course")
            .first()
        )
        if not daily_note:
            return self.send_not_found(obj_id)
        if user.is_teacher():
            course = models.Course.objects.filter(
                id=daily_note.event.course_id
            ).first()
            if not course or not user_can_access_course(user, course):
                return self.send_response(
                    True,
                    "not_authorized",
                    {"details": "You are not authorized to perform this action."},
                )
        return super().put(request, obj_id)


class DailyNoteSearchView(RBACSearchView):
    name = "DailyNote search view"
    model = models.DailyNote
    serializer = serializers.DailyNoteSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "course.view"}


class CourseHistoryListView(RBACListView):
    name = "CourseHistory list view"
    model = models.CourseHistory
    serializer = serializers.CourseHistorySerializer
    required_permissions = {"GET": "course.view", "POST": "course.view"}


class CourseHistoryDetailsView(RBACDetailsView):
    name = "CourseHistory details view"
    model = models.CourseHistory
    serializer = serializers.CourseHistorySerializer
    required_permissions = {
        "GET": "course.view",
        "PUT": "course.view",
        "PATCH": "course.view",
        "DELETE": "course.view",
    }


class CourseHistorySearchView(RBACSearchView):
    name = "CourseHistory search view"
    model = models.CourseHistory
    serializer = serializers.CourseHistorySerializer
    required_permissions = {"POST": "course.view"}


class UserAttendanceListView(RBACListView):
    name = "UserAttendance list view"
    model = models.UserAttendance
    serializer = serializers.UserAttendanceSerializer
    required_permissions = {"GET": "payroll.view", "POST": "payroll.view_all"}

    def get(self, request: Request, filter_ids=None):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        held = set(effective_permissions(user))
        if "payroll.view_all" in held:
            return super().get(request, filter_ids)
        ids = list(scope_user_attendances_for_user(user).values_list("id", flat=True))
        return super().get(request, ids)


class UserAttendanceDetailsView(RBACDetailsView):
    name = "UserAttendance details view"
    model = models.UserAttendance
    serializer = serializers.UserAttendanceSerializer
    required_permissions = {
        "GET": "payroll.view",
        "PUT": "payroll.view_all",
        "PATCH": "payroll.view_all",
        "DELETE": "payroll.view_all",
    }

    def get(self, request: Request, obj_id: int):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_user_attendance_read(user, obj)
        except PermissionDenied:
            return self.forbidden("You don't have permission to view this payroll record.")
        return super().get(request, obj_id)


class UserAttendanceSearchView(OptimizedSearchMixin, RBACSearchView):
    name = "UserAttendance search view"
    model = models.UserAttendance
    serializer = serializers.UserAttendanceSerializer
    required_permissions = {"POST": "payroll.view"}
    base_select_related = ("user",)
    expand_prefetch_specs = [
        ExpandPrefetchSpec(
            trigger_expand="course",
            replace_lookup="course",
            queryset_factory=optimized_course_queryset_for_serializer,
        ),
    ]

    def post(self, request: Request, filter_ids=None):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        held = set(effective_permissions(user))
        if "payroll.view_all" in held:
            return super().post(request, filter_ids)
        ids = list(scope_user_attendances_for_user(user).values_list("id", flat=True))
        return super().post(request, ids)


class UserEventDetailsView(RBACDetailsView):
    name = "UserEvent details view"
    model = UserEvent
    serializer = UserEventSerializer
    required_permissions = {
        "GET": "attendance.mark",
        "PUT": "attendance.mark",
        "PATCH": "attendance.mark",
        "DELETE": "attendance.mark",
    }

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["refresh_student_count_on_update"] = True
        return context

    def put(self, request: Request, obj_id: int):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_userevent_write(user, obj)
        except PermissionDenied:
            return self.forbidden("Not allowed for this attendance record.")
        return super().put(request, obj_id)

    def delete(self, request: Request, obj_id: int):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_userevent_write(user, obj)
        except PermissionDenied:
            return self.forbidden("Not allowed for this attendance record.")
        if obj.checkin_time is not None:
            return self.send_response(
                True,
                "bad_request",
                {
                    "details": {
                        "message": (
                            "Cannot delete a check-in record. "
                            "Clear check-in times first or contact support."
                        ),
                    }
                },
                status=400,
            )
        serialized_data = self.get_serializer(obj)
        response_payload = serialized_data.data
        soft_delete_userevents(UserEvent.objects.filter(pk=obj.pk))
        return self.deleted(response_payload)


class UserEventSearchView(OptimizedSearchMixin, RBACSearchView):
    name = "UserEvent search view"
    model = UserEvent
    serializer = UserEventSerializer
    required_permissions = {"POST": "attendance.mark"}
    base_select_related = ("user",)

    def post(self, request: Request, filter_ids=None):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        held = set(effective_permissions(user))
        if scoping.has_read_breadth("attendance", held):
            return super().post(request, filter_ids)
        ids = list(scope_userevents_for_user(user).values_list("id", flat=True))
        return super().post(request, ids)


class GenerateJoinCodeView(RBACView):
    model = models.Course
    serializer = serializers.CourseSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "course.manage_members"}

    def post(self, request: Request, course_id: int):
        course: models.Course = models.Course.objects.filter(id=course_id).first()
        if not course:
            return self.not_found("This course does not exists.")
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_write(user, course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")

        course.join_code = generate_join_code()
        course.join_code_expiry_date = datetime.now() + timedelta(days=7)
        course.save()
        return self.send_response(
            False, "ok", {"data": {"join_code": course.join_code}}
        )


class SearchCourseByJoinCodeView(RBACView):
    model = models.Course
    serializer = serializers.CourseSerializer
    # Optional JWT: no token keeps the endpoint public; a valid token enriches
    # has_user / enrollment / previous_join_request for logged-in students.
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "public"

    def get(self, request: Request, join_code: str):
        user = None
        if request.user:
            user = models.User.get_user_from_request(request)
        course = get_course_by_join_code(join_code)
        if not course:
            return self.not_found("This join code is invalid.")
        data = {
            "id": course.id,
            "title": course.title,
            "is_join_code_enabled": course.is_join_code_enabled,
        }
        if not course.is_join_code_enabled:
            data["is_join_code_disabled"] = True
        elif is_join_code_expired(course):
            data["is_join_code_expired"] = True

        if user:
            already_joined = models.UserCourse.objects.filter(
                user_id=user.id,
                course_id=course.id
            ).exists()
            data["is_already_joined"] = already_joined
            previous_join_request = models.CourseJoinRequest.objects.filter(
                course_id=course.id,
                user_id=user.id
            ).order_by("-created_at").first()
            if previous_join_request is not None:
                serialized_join_request = serializers.CourseJoinRequestSerializer(
                    previous_join_request
                )
                data["previous_join_request"] = serialized_join_request.data
        return self.send_response(
            False, "ok", {"data": {**data, "has_user": user is not None}}
        )


class StudentCourseJoinRequestView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    rbac_decision = "authenticated_only"

    def post(self, request: Request, join_code: str):
        user = models.User.get_user_from_request(request)
        if user is None:
            return self.forbidden("Authentication required.")
        if not user.is_student():
            return self.forbidden("Only students can request to join a course.")

        course = get_course_by_join_code(join_code)
        if not course:
            return self.not_found("This join code is invalid.")
        if not course.is_join_code_enabled:
            return self.send_response(
                True,
                "join_code_disabled",
                {"details": "Joining this course with a code is not available."},
                status=400,
            )
        if is_join_code_expired(course):
            return self.send_response(
                True,
                "join_code_expired",
                {"details": "This invite link is invalid or expired."},
                status=400,
            )
        if models.UserCourse.objects.filter(user_id=user.id, course_id=course.id).exists():
            return self.send_response(
                False,
                "already_enrolled",
                {"details": "You are already enrolled in this course."},
                status=200,
            )

        join_request = models.CourseJoinRequest.objects.filter(
            course_id=course.id,
            user_id=user.id,
        ).first()
        created = False
        if join_request is None:
            join_request = models.CourseJoinRequest.objects.create(
                course_id=course.id,
                user_id=user.id,
                status=models.CourseJoinRequest.Status.PENDING,
            )
            created = True
        elif join_request.status == models.CourseJoinRequest.Status.REJECTED:
            join_request.status = models.CourseJoinRequest.Status.PENDING
            join_request.save(update_fields=["status"])

        return self.send_response(
            False,
            "success",
            {"details": "Join request submitted.", "data": {"id": join_request.id}},
            status=201 if created else 200,
        )


class CourseJoinRequestListView(RBACListView):
    name = "CourseJoinRequest list view"
    model = models.CourseJoinRequest
    serializer = serializers.CourseJoinRequestSerializer
    required_permissions = {"GET": "course.manage_members", "POST": "course.manage_members"}


class CourseJoinRequestDetailsView(RBACDetailsView):
    name = "CourseJoinRequest details view"
    model = models.CourseJoinRequest
    serializer = serializers.CourseJoinRequestSerializer
    required_permissions = {
        "GET": "course.manage_members",
        "PUT": "course.manage_members",
        "PATCH": "course.manage_members",
        "DELETE": "course.manage_members",
    }


class CourseJoinRequestSearchView(RBACSearchView):
    name = "CourseJoinRequest search view"
    model = models.CourseJoinRequest
    serializer = serializers.CourseJoinRequestSerializer
    required_permissions = {"POST": "course.manage_members"}


class UserAssignmentView(RBACView):
    model = models.Assignment
    serializer = serializers.AssignmentSerializer
    rbac_decision = "authenticated_only"

    def post(self, request: Request, user_id: int):
        filter_params = {}
        try:
            query_params = self.get_query_params(request)
            filter_params = self.get_filter_params(request)
            exclude_params = self.get_exclude_params(request)
            chained_filter_params = self.get_chained_filter_params(request)
        except BadRequest as e:
            return self.send_response(
                True, "bad_request", {"details": str(e)}, status=400
            )
        if filter_params is None:
            filter_params = {}

        if exclude_params is None:
            exclude_params = {}
        fields = query_params.get("fields")
        if fields is None:
            fields = []
        expand = query_params.get("expand")
        if expand is None:
            expand = []
        translated_expand = self.translate_expand_params(expand)
        sorts = query_params.get("sorts")
        if sorts is None:
            sorts = []
        queryset = models.Assignment.objects.filter(
            course__in=models.UserCourse.objects.filter(user_id=user_id).values_list('course_id', flat=True)
        ).filter(**filter_params).exclude(**exclude_params).prefetch_related(*translated_expand).order_by(*sorts).all()

        paginated_data = self.paginate_queryset(queryset, request)

        # serialize the paginated data
        serialized_data = self.get_serializer(
            paginated_data,
            many=True,
            fields=fields,
            expand=expand,
            context={"model": self.model},
        )

        return self.send_response(
            False,
            "success",
            {**self.get_paginated_response(), "data": serialized_data.data},
            status=200,
        )


class StudentSubmissionView(RBACView):
    """
    Allow students to view ONLY their own submissions.
    Students can only see grades if are_results_released is True.
    Teachers can see everything.
    """
    model = models.Submission
    serializer = serializers.SubmissionSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    rbac_decision = "authenticated_only"
    
    def get(self, request: Request, submission_id: int):
        user = models.User.get_user_from_request(request)
        
        submission = models.Submission.objects.filter(id=submission_id).select_related('assignment', 'created_by').first()
        if not submission:
            return self.send_response(
                True, "not_found", {"details": "Submission not found"}, status=404
            )

        if user.is_student() and submission.created_by_id != user.id:
            return self.send_response(
                True, "forbidden", {"details": "You can only view your own submissions"}, status=403
            )
        
        try:
            expand = self.get_expand_param(request)
        except BadRequest as e:
            return self.send_response(
                True, "bad_request", {"details": str(e)}, status=400
            )
        if user.is_student() and not submission.are_results_released:
            serialized = self.get_serializer(submission, expand=expand)
            response_data = serialized.data
            response_data['user_score'] = None
            response_data['feedback'] = None
            response_data['is_graded'] = False
            return self.ok(response_data, message="ok")
        
        serialized = self.get_serializer(submission, expand=expand)
        return self.ok(serialized.data, message="ok")


class BulkReleaseSubmissionsView(RBACView):
    model = models.Submission
    serializer = serializers.SubmissionSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    required_permissions = {"POST": "grade.manage"}
    
    def post(self, request: Request):
        user = models.User.get_user_from_request(request)
        if user.is_student():
            return self.forbidden("Students cannot release results.")
        
        assignment_id = request.data.get("assignment_id")
        submission_ids = request.data.get("submission_ids", [])
        are_results_released = request.data.get("are_results_released", True)
        
        if assignment_id:
            updated_count = models.Submission.objects.filter(
                assignment_id=assignment_id,
                is_graded=True,
                are_results_released=False
            ).update(are_results_released=are_results_released)
        elif submission_ids:
            updated_count = models.Submission.objects.filter(
                id__in=submission_ids,
                is_graded=True
            ).update(are_results_released=are_results_released)
        else:
            return self.bad_request("Either assignment_id or submission_ids is required.")
        
        return self.send_response(
            False,
            "success",
            {
                "message": f"Successfully updated {updated_count} submissions.",
                "updated_count": updated_count,
            },
            status=200,
        )


def _get_accessible_course_ids(user) -> list[int] | None:
    """Return course IDs the user can access, or None when they have read breadth."""
    held = set(effective_permissions(user))
    if scoping.has_read_breadth("course", held):
        return None
    uc_ids = set(
        models.UserCourse.objects.filter(user_id=user.id).values_list(
            "course_id", flat=True
        )
    )
    created_ids = set(
        models.Course.objects.filter(created_by=user.id).values_list("id", flat=True)
    )
    return list(uc_ids | created_ids)


class RecordingListView(RBACListView):
    name = "Recording list view"
    model = models.ProcessedTeamsRecording
    serializer = serializers.ProcessedTeamsRecordingSerializer
    required_permissions = {"GET": "course.manage_content"}

    def get(self, request: Request, filter_ids=None):
        user = models.User.get_user_from_request(request)
        course_ids = _get_accessible_course_ids(user)

        course_id_param = request.query_params.get("course_id")
        if course_id_param:
            try:
                cid = int(course_id_param)
                if course_ids is not None and cid not in course_ids:
                    return self.forbidden("You do not have access to this course.")
                course_ids = [cid]
            except ValueError:
                pass

        # BaseListView.get filters by model pk (recording id)
        recording_ids = None
        if course_ids is not None:
            recording_ids = list(
                models.ProcessedTeamsRecording.objects.filter(
                    course_id__in=course_ids
                ).values_list("id", flat=True)
            )

        return super().get(request, filter_ids=recording_ids)


class RecordingDetailsView(RBACDetailsView):
    name = "Recording details view"
    model = models.ProcessedTeamsRecording
    serializer = serializers.ProcessedTeamsRecordingSerializer
    required_permissions = {
        "GET": "course.manage_content",
        "PUT": "course.manage_content",
        "PATCH": "course.manage_content",
        "DELETE": "course.manage_content",
    }

    def get(self, request: Request, obj_id: int):
        user = models.User.get_user_from_request(request)
        course_ids = _get_accessible_course_ids(user)

        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)

        if course_ids is not None and obj.course_id not in course_ids:
            return self.forbidden("You do not have access to this recording.")

        serialized_data = self.get_serializer(obj)
        return self.ok(serialized_data.data)


class UserUploadedRecordingListView(RBACListView):
    name = "User uploaded recording list view"
    model = models.UserUploadedRecording
    serializer = serializers.UserUploadedRecordingSerializer
    required_permissions = {"GET": "course.manage_content", "POST": "course.manage_content"}

    def get(self, request: Request, filter_ids=None):
        user = models.User.get_user_from_request(request)
        if user.is_student():
            return self.forbidden("Students cannot access recordings.")

        course_ids = _get_accessible_course_ids(user)

        course_id_param = request.query_params.get("course_id")
        if course_id_param:
            try:
                cid = int(course_id_param)
                if course_ids is not None and cid not in course_ids:
                    return self.forbidden("You do not have access to this course.")
                course_ids = [cid]
            except ValueError:
                pass

        recording_ids = None
        if course_ids is not None:
            recording_ids = list(
                models.UserUploadedRecording.objects.filter(
                    course_id__in=course_ids
                ).values_list("id", flat=True)
            )

        return super().get(request, filter_ids=recording_ids)

    def post(self, request: Request):
        user = models.User.get_user_from_request(request)
        if user.is_student():
            return self.forbidden("Students cannot upload recordings.")

        course_id = request.data.get("course")
        if not course_id:
            return self.bad_request("course is required.")

        course = models.Course.objects.filter(id=course_id).first()
        if not course:
            return self.not_found("No such course with the given id.")
        try:
            check_course_write(user, course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")

        data = {**request.data, "uploaded_by": user.id}
        s = self.get_serializer(data=data)
        if not s.is_valid():
            return self.send_response(True, "bad_request", {"errors": s.errors}, status=status.HTTP_400_BAD_REQUEST)
        s.save()
        return self.created(s.data)


class UserUploadedRecordingDetailsView(RBACDetailsView):
    name = "User uploaded recording details view"
    model = models.UserUploadedRecording
    serializer = serializers.UserUploadedRecordingSerializer
    required_permissions = {
        "GET": "course.manage_content",
        "PUT": "course.manage_content",
        "PATCH": "course.manage_content",
        "DELETE": "course.manage_content",
    }

    def get(self, request: Request, obj_id: int):
        user = models.User.get_user_from_request(request)
        if user.is_student():
            return self.forbidden("Students cannot access recordings.")

        course_ids = _get_accessible_course_ids(user)
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)

        if course_ids is not None and obj.course_id not in course_ids:
            return self.forbidden("You do not have access to this recording.")

        serialized_data = self.get_serializer(obj)
        return self.ok(serialized_data.data)

    def delete(self, request: Request, obj_id: int):
        user = models.User.get_user_from_request(request)
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)

        is_owner = obj.uploaded_by_id == user.id
        if not is_owner and not user.is_admin():
            return self.forbidden("Only the uploader or a manager can delete this recording.")

        # Soft-delete the linked juice-box attachment so the daily cron removes the file from S3
        from app_attachment.models import Attachment
        Attachment.objects.filter(
            table_name="app_course_useruploadedrecording",
            foreign_key=obj.id,
        ).update(is_deleted=True)

        obj.delete()
        return self.send_response(False, "deleted", {}, status=status.HTTP_200_OK)


JWT_SECRET = config("JWT")


class RecordingShareView(RBACView):
    """Generate a 10-day shareable link for a Teams recording."""
    required_permissions = {"POST": "course.manage_content"}

    def post(self, request: Request, obj_id: int):
        user = models.User.get_user_from_request(request)
        course_ids = _get_accessible_course_ids(user)

        obj = models.ProcessedTeamsRecording.objects.filter(id=obj_id).first()
        if obj is None:
            return self.not_found()

        if course_ids is not None and obj.course_id not in course_ids:
            return self.forbidden("You do not have access to this recording.")

        token = jwt.encode(
            {
                "type": "teams",
                "id": obj.id,
                "schema": connection.schema_name,
                "purpose": "recording-share",
                "exp": datetime.utcnow() + settings.RECORDING_SHARE_JWT_EXPIRES,
            },
            JWT_SECRET,
            algorithm="HS256",
        )
        return self.send_response(False, "success", {"data": {"token": token}}, status=status.HTTP_200_OK)


class UserRecordingShareView(RBACView):
    """Generate a 10-day shareable link for a user-uploaded recording."""
    required_permissions = {"POST": "course.manage_content"}

    def post(self, request: Request, obj_id: int):
        user = models.User.get_user_from_request(request)
        if user.is_student():
            return self.forbidden("Students cannot share recordings.")

        course_ids = _get_accessible_course_ids(user)
        obj = models.UserUploadedRecording.objects.filter(id=obj_id).first()
        if obj is None:
            return self.not_found()

        if course_ids is not None and obj.course_id not in course_ids:
            return self.forbidden("You do not have access to this recording.")

        token = jwt.encode(
            {
                "type": "uploaded",
                "id": obj.id,
                "schema": connection.schema_name,
                "purpose": "recording-share",
                "exp": datetime.utcnow() + settings.RECORDING_SHARE_JWT_EXPIRES,
            },
            JWT_SECRET,
            algorithm="HS256",
        )
        return self.send_response(False, "success", {"data": {"token": token}}, status=status.HTTP_200_OK)


class SharedRecordingView(RBACView):
    """Public endpoint — validates a share token and returns recording metadata + video URL."""

    authentication_classes = []
    rbac_decision = "public"

    def get(self, request: Request, token: str):
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            return self.send_response(True, "expired", {"details": "This share link has expired."}, status=status.HTTP_410_GONE)
        except jwt.InvalidTokenError:
            return self.send_response(True, "invalid", {"details": "Invalid share link."}, status=status.HTTP_400_BAD_REQUEST)

        if payload.get("purpose") != "recording-share":
            return self.send_response(True, "invalid", {"details": "Invalid share link."}, status=status.HTTP_400_BAD_REQUEST)

        schema = payload.get("schema")
        rec_type = payload.get("type")
        rec_id = payload.get("id")

        # Switch to the correct tenant schema
        connection.set_schema(schema)

        try:
            if rec_type == "teams":
                obj = models.ProcessedTeamsRecording.objects.select_related("course").filter(id=rec_id).first()
                if obj is None:
                    return self.not_found("Recording not found.")

                download_url = None
                if obj.file_path:
                    try:
                        from schedjuice_backend.storages import PrivateMediaStorage
                        storage = PrivateMediaStorage()
                        download_url = storage.url(
                            obj.file_path,
                            parameters={"ResponseContentDisposition": "inline", "ResponseContentType": "video/mp4"},
                            expire=settings.RECORDING_PRESIGNED_EXPIRES_SECONDS,
                        )
                    except Exception:
                        pass

                return self.send_response(False, "success", {
                    "data": {
                        "type": "teams",
                        "id": obj.id,
                        "course_name": obj.course.title if obj.course else None,
                        "created_datetime": obj.created_datetime.isoformat() if obj.created_datetime else None,
                        "download_url": download_url,
                    }
                }, status=status.HTTP_200_OK)

            elif rec_type == "uploaded":
                obj = models.UserUploadedRecording.objects.select_related("course").filter(id=rec_id).first()
                if obj is None:
                    return self.not_found("Recording not found.")

                # Same presign logic as UserUploadedRecordingSerializer (juice-box may use a different DATABASE_URL).
                _upload_ser = serializers.UserUploadedRecordingSerializer()
                download_url = _upload_ser.get_download_url(obj)

                return self.send_response(False, "success", {
                    "data": {
                        "type": "uploaded",
                        "id": obj.id,
                        "course_name": obj.course.title if obj.course else None,
                        "recorded_date": obj.recorded_date.isoformat() if obj.recorded_date else None,
                        "description": obj.description,
                        "schema": schema,
                        "share_token": token,
                        "source_type": obj.source_type,
                        "youtube_url": obj.youtube_url or None,
                        "youtube_video_id": obj.youtube_video_id or None,
                        "playback": _upload_ser.get_playback(obj),
                        "download_url": download_url,
                    }
                }, status=status.HTTP_200_OK)

            else:
                return self.send_response(True, "invalid", {"details": "Unknown recording type."}, status=status.HTTP_400_BAD_REQUEST)
        finally:
            connection.set_schema_to_public()


class CourseScopeOverseersView(RBACView):
    """Users who oversee this course via program/category scope."""

    authentication_classes = [TenantBoundJWTStatelessAuthentication]

    def get(self, request: Request, course_id: int):
        from app_course.course_oversight import get_course_scope_overseers

        course = models.Course.objects.filter(id=course_id).first()
        if not course:
            return self.not_found("Course not found.")
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_read(user, course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")
        return self.ok(get_course_scope_overseers(course))


class CourseAttendanceMarkingBootstrapView(RBACView):
    """Bootstrap payload for the course attendance marking page."""

    required_permissions = {"GET": "attendance.mark"}

    def get(self, request: Request, course_id: int):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_attendance_access(user, course_id)
        except PermissionDenied:
            return self.forbidden("Not allowed for this course.")

        raw_event_id = request.query_params.get("event_id")
        event_id = (
            int(raw_event_id)
            if raw_event_id and str(raw_event_id).isdigit()
            else None
        )
        try:
            include_removed = parse_include_removed_students(request, user)
        except PermissionDenied as exc:
            return self.forbidden(str(exc))

        try:
            data = build_attendance_marking_bootstrap(
                course_id,
                request.tenant,
                event_id=event_id,
                include_removed=include_removed,
            )
        except models.Course.DoesNotExist:
            return self.not_found("Course not found.")

        return self.ok(data)


class CourseMeetingAttendanceDashboardView(RBACView):
    """Staff-only: aggregated UserAttendance + Events for the meeting attendance UI."""

    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "attendance.view_all"}

    def get(self, request: Request, course_id: int):
        try:
            year = int(request.query_params.get("year", ""))
            month = int(request.query_params.get("month", ""))
        except ValueError:
            return self.bad_request("Invalid year or month.")
        if month < 1 or month > 12:
            return self.bad_request("month must be 1-12.")

        course = (
            models.Course.objects.filter(id=course_id)
            .prefetch_related("events")
            .first()
        )
        if not course:
            return self.not_found("Course not found.")
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_read(user, course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")

        data = build_meeting_attendance_dashboard(course, request.tenant, year, month)
        return self.ok(data)


class CoursePaymentAssignmentMonthStatusView(RBACView):
    """Whether a Teams payment-assignment row exists for this course and calendar month."""

    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "payroll.view_all"}

    def get(self, request: Request, course_id: int):
        try:
            year = int(request.query_params.get("year", ""))
            month = int(request.query_params.get("month", ""))
        except ValueError:
            return self.bad_request("Invalid year or month.")
        if month < 1 or month > 12:
            return self.bad_request("month must be 1-12.")

        if not request.tenant.is_microsoft_on:
            return self.send_response(
                True,
                "bad_request",
                {
                    "details": "Microsoft integration is not enabled for this organization.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        course = (
            models.Course.objects.filter(id=course_id)
            .select_related("category")
            .first()
        )
        if not course:
            return self.not_found("Course not found.")

        payload = get_payment_assignment_month_status(
            course, year, month, org=request.tenant
        )
        return self.send_response(
            False,
            "ok",
            {"data": payload},
            status=status.HTTP_200_OK,
        )


def _schedule_zoom_precheck_organization_zoom(course: models.Course, tenant):
    """School-linked courses need org OAuth; personal courses do not."""
    if (
        course.zoom_meeting_source
        == models.Course.ZoomMeetingSource.PERSONAL
    ):
        return None
    if not tenant.has_active_zoom_account():
        return (
            "Connect a Zoom account in organization settings before scheduling."
        )
    return None


def _first_event_local_window(course, tenant) -> tuple[datetime, int, str] | None:
    ev = course.events.order_by("date", "time_from").first()
    if not ev:
        return None
    tz_name = (tenant.timezone or "UTC").strip() or "UTC"
    tz = pytz.timezone(tz_name)
    ev_dt = ev.date
    if django_timezone.is_naive(ev_dt):
        ev_dt = django_timezone.make_aware(ev_dt, dt_timezone.utc)
    ev_local = ev_dt.astimezone(tz)
    d = ev_local.date()
    start_local = datetime.combine(d, ev.time_from)
    end_local = datetime.combine(d, ev.time_to)
    duration = max(15, int((end_local - start_local).total_seconds() // 60))
    return start_local, duration, tz_name


class CourseScheduleZoomMeetingView(RBACView):
    """POST: create a Zoom meeting from the first scheduled session."""

    name = "Course schedule Zoom meeting"
    serializer = serializers.CourseSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "course.update"}

    def post(self, request: Request, course_id: int):
        force = bool((request.data or {}).get("force"))
        course = (
            models.Course.objects.filter(id=course_id).prefetch_related("events").first()
        )
        if not course:
            return self.not_found("No such course.")
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_write(user, course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")
        org_zoom_msg = _schedule_zoom_precheck_organization_zoom(
            course,
            request.tenant,
        )
        if org_zoom_msg:
            return self.bad_request(org_zoom_msg)
        if (course.zoom_meeting_id or "").strip():
            return self.bad_request("This course already has a Zoom meeting.")

        actor = User.get_user_from_request(request)
        if not actor:
            return self.bad_request("User not found.")
        ctx, zerr, zstatus = resolve_zoom_course_context(
            course=course,
            actor=actor,
            tenant=request.tenant,
        )
        if zerr:
            return self.send_response(
                True,
                "forbidden" if zstatus == status.HTTP_403_FORBIDDEN else "bad_request",
                {"details": zerr},
                status=zstatus or status.HTTP_400_BAD_REQUEST,
            )

        credential = ctx.credential
        host_uid = ctx.host_zoom_user_id

        window = _first_event_local_window(course, request.tenant)
        if window is None:
            return self.send_response(
                True,
                "bad_request",
                {
                    "details": (
                        "Add at least one session to the schedule first."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        start_local, duration, tz_name = window

        if not force:
            tz = pytz.timezone(tz_name)
            start_utc = (
                tz.localize(start_local).astimezone(pytz.UTC).replace(tzinfo=None)
            )
            existing = list_user_meetings(
                credential,
                host_uid,
                meeting_type="upcoming",
            )
            conflicts = detect_conflicts(
                existing, start_utc=start_utc, duration_minutes=duration
            )
            if conflicts:
                return self.send_response(
                    True,
                    "zoom_schedule_conflict",
                    {
                        "details": "The host has another Zoom meeting at this time.",
                        "conflicts": [
                            {
                                "id": c.get("id"),
                                "topic": c.get("topic"),
                                "start_time": c.get("start_time"),
                                "duration": c.get("duration"),
                            }
                            for c in conflicts
                        ],
                    },
                    status=409,
                )

        payload = build_create_meeting_payload(
            topic=course.title,
            start_local=start_local,
            duration_minutes=duration,
            timezone_name=tz_name,
        )
        try:
            response = create_user_meeting(credential, host_uid, payload)
        except RuntimeError as e:
            return self.bad_request(str(e))

        apply_meeting_response_to_course(course, response=response)
        if getattr(credential, "account_id", None):
            course.zoom_account_id = credential.account_id
        else:
            course.zoom_account_id = (credential.zoom_account_id or "").strip() or None
        course.meeting_scheduled_at = django_timezone.now()
        course.save()

        return self.send_response(
            False,
            "ok",
            {
                "data": serializers.CourseSerializer(
                    course, context={"request": request}
                ).data,
            },
            status=status.HTTP_200_OK,
        )


class CourseUpdateZoomMeetingView(RBACView):
    """PATCH: edit Zoom meeting topic / schedule fields."""

    name = "Course update Zoom meeting"
    serializer = serializers.CourseSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"PATCH": "course.update"}

    def patch(self, request: Request, course_id: int):
        course = models.Course.objects.filter(id=course_id).first()
        if not course or not (course.zoom_meeting_id or "").strip():
            return self.not_found("No Zoom meeting on this course.")
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_write(user, course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")
        actor = User.get_user_from_request(request)
        if not actor:
            return self.bad_request("User not found.")
        ctx, zerr, zstatus = resolve_zoom_course_context(
            course=course,
            actor=actor,
            tenant=request.tenant,
        )
        if zerr:
            return self.send_response(
                True,
                "forbidden" if zstatus == status.HTTP_403_FORBIDDEN else "bad_request",
                {"details": zerr},
                status=zstatus or status.HTTP_400_BAD_REQUEST,
            )
        credential = ctx.credential

        body = request.data or {}
        allowed = {
            k: v
            for k, v in body.items()
            if k in {"topic", "start_time", "duration", "timezone"}
        }
        if not allowed:
            return self.send_response(
                True,
                "bad_request",
                {
                    "details": "Provide topic, start_time, duration, or timezone.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            update_meeting(credential, course.zoom_meeting_id.strip(), allowed)
        except RuntimeError as e:
            return self.bad_request(str(e))

        meeting = get_meeting(credential, course.zoom_meeting_id.strip()) or {}
        if meeting.get("join_url"):
            course.meeting_link = meeting["join_url"]
        if meeting.get("uuid"):
            course.zoom_meeting_uuid = str(meeting["uuid"])
        if meeting.get("host_id"):
            course.zoom_meeting_host_id = str(meeting["host_id"])
        course.meeting_scheduled_at = django_timezone.now()
        course.save()

        return self.send_response(
            False,
            "ok",
            {
                "data": serializers.CourseSerializer(
                    course, context={"request": request}
                ).data,
            },
            status=status.HTTP_200_OK,
        )


class CourseRefreshZoomMeetingView(RBACView):
    """POST: re-fetch meeting metadata from Zoom."""

    name = "Course refresh Zoom meeting"
    serializer = serializers.CourseSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "course.update"}

    def post(self, request: Request, course_id: int):
        course = models.Course.objects.filter(id=course_id).first()
        if not course or not (course.zoom_meeting_id or "").strip():
            return self.not_found("No Zoom meeting on this course.")
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_write(user, course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")
        actor = User.get_user_from_request(request)
        if not actor:
            return self.bad_request("User not found.")
        ctx, zerr, zstatus = resolve_zoom_course_context(
            course=course,
            actor=actor,
            tenant=request.tenant,
        )
        if zerr:
            return self.send_response(
                True,
                "forbidden" if zstatus == status.HTTP_403_FORBIDDEN else "bad_request",
                {"details": zerr},
                status=zstatus or status.HTTP_400_BAD_REQUEST,
            )
        credential = ctx.credential
        meeting = get_meeting(credential, course.zoom_meeting_id.strip())
        if meeting is None:
            return self.not_found("That Zoom meeting no longer exists.")
        apply_meeting_response_to_course(course, response=meeting)
        course.save()

        return self.send_response(
            False,
            "ok",
            {
                "data": serializers.CourseSerializer(
                    course, context={"request": request}
                ).data,
            },
            status=status.HTTP_200_OK,
        )


class CourseSyncZoomMeetingFromScheduleView(RBACView):
    """
    POST: update the course's Zoom meeting time/topic to match the first calendar
    session — same window as "Schedule Zoom meeting".
    """

    name = "Course sync Zoom meeting from schedule"
    serializer = serializers.CourseSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "course.update"}

    def post(self, request: Request, course_id: int):
        force = bool((request.data or {}).get("force"))
        course = (
            models.Course.objects.filter(id=course_id)
            .prefetch_related("events")
            .first()
        )
        if not course or not (course.zoom_meeting_id or "").strip():
            return self.not_found("No Zoom meeting on this course.")
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_write(user, course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")
        actor = User.get_user_from_request(request)
        if not actor:
            return self.bad_request("User not found.")
        ctx, zerr, zstatus = resolve_zoom_course_context(
            course=course,
            actor=actor,
            tenant=request.tenant,
        )
        if zerr:
            return self.send_response(
                True,
                "forbidden" if zstatus == status.HTTP_403_FORBIDDEN else "bad_request",
                {"details": zerr},
                status=zstatus or status.HTTP_400_BAD_REQUEST,
            )
        credential = ctx.credential
        host_uid = ctx.host_zoom_user_id

        window = _first_event_local_window(course, request.tenant)
        if window is None:
            return self.send_response(
                True,
                "bad_request",
                {
                    "details": (
                        "Add at least one session to the schedule first."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        start_local, duration, tz_name = window

        if not force:
            tz = pytz.timezone(tz_name)
            start_utc = (
                tz.localize(start_local).astimezone(pytz.UTC).replace(tzinfo=None)
            )
            existing = list_user_meetings(
                credential,
                host_uid,
                meeting_type="upcoming",
            )
            conflicts = detect_conflicts(
                existing, start_utc=start_utc, duration_minutes=duration
            )
            # Exclude this course's meeting from conflicts (same id).
            mid = (course.zoom_meeting_id or "").strip()
            conflicts = [
                c
                for c in conflicts
                if str(c.get("id")) != str(mid)
                and str(c.get("uuid") or "") != str(mid)
            ]
            if conflicts:
                return self.send_response(
                    True,
                    "zoom_schedule_conflict",
                    {
                        "details": "The host has another Zoom meeting at this time.",
                        "conflicts": [
                            {
                                "id": c.get("id"),
                                "topic": c.get("topic"),
                                "start_time": c.get("start_time"),
                                "duration": c.get("duration"),
                            }
                            for c in conflicts
                        ],
                    },
                    status=409,
                )

        full_payload = build_create_meeting_payload(
            topic=course.title,
            start_local=start_local,
            duration_minutes=duration,
            timezone_name=tz_name,
        )
        allowed = {
            k: full_payload[k]
            for k in ("topic", "start_time", "duration", "timezone")
            if k in full_payload
        }
        try:
            update_meeting(credential, course.zoom_meeting_id.strip(), allowed)
        except RuntimeError as e:
            return self.bad_request(str(e))

        meeting = get_meeting(credential, course.zoom_meeting_id.strip()) or {}
        if meeting.get("join_url"):
            course.meeting_link = meeting["join_url"]
        if meeting.get("uuid"):
            course.zoom_meeting_uuid = str(meeting["uuid"])
        if meeting.get("host_id"):
            course.zoom_meeting_host_id = str(meeting["host_id"])
        course.meeting_scheduled_at = django_timezone.now()
        course.save()

        return self.send_response(
            False,
            "ok",
            {
                "data": serializers.CourseSerializer(
                    course, context={"request": request}
                ).data,
            },
            status=status.HTTP_200_OK,
        )


class CourseValidateZoomMeetingView(RBACView):
    """POST: validate a typed Zoom meeting id before saving the course."""

    name = "Course validate Zoom meeting"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "course.update"}

    def post(self, request: Request, course_id: int):
        course_ob = models.Course.objects.filter(id=course_id).select_related(
            "zoom_personal_user"
        ).first()
        if not course_ob:
            return self.not_found("No such course.")
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_write(user, course_ob)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")
        mid = (request.data.get("zoom_meeting_id") or "").strip()
        aid = (request.data.get("zoom_account_id") or "").strip() or None
        if not mid:
            return self.bad_request("zoom_meeting_id is required.")
        src_raw = (request.data.get("zoom_meeting_source") or "").strip()
        valid = {
            models.Course.ZoomMeetingSource.SCHOOL,
            models.Course.ZoomMeetingSource.PERSONAL,
        }
        if src_raw in valid:
            zoom_src = src_raw
        else:
            zoom_src = course_ob.zoom_meeting_source
        try:
            data = resolve_manual_zoom_meeting_for_tenant(
                request.tenant,
                mid,
                zoom_account_id=aid,
                zoom_meeting_source=zoom_src,
                personal_oauth=(
                    getattr(
                        getattr(course_ob, "zoom_personal_user", None),
                        "zoom_oauth",
                        None,
                    )
                    if zoom_src == models.Course.ZoomMeetingSource.PERSONAL
                    else None
                ),
            )
        except SerializerValidationError as e:
            return self.bad_request(e.detail)

        return self.send_response(
            False,
            "ok",
            {"data": data},
            status=status.HTTP_200_OK,
        )


# superadmin OR admin (mirrors frontend visibility for these recovery actions)

class CourseCreateMicrosoftTeamView(RBACView):
    """POST courses/<id>/create-microsoft-team — provision a Team for a null-group course."""

    model = models.Course
    serializer = serializers.CourseSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "course.update"}

    def check_permissions(self, request):
        super().check_permissions(request)
        user = acting_user(request)
        if user is not None:
            require_superadmin_or_admin(user)

    def post(self, request: Request, course_id: int):
        from app_microsoft.provisioning import (
            REPAIRABLE_STATUSES,
            evaluate_course_candidate,
            provision_course_team_for,
        )

        if not request.tenant.is_microsoft_on:
            return self.bad_request(
                "Microsoft integration is not enabled for this organization."
            )
        course = (
            models.Course.objects.filter(id=course_id)
            .select_related("category")
            .first()
        )
        if not course:
            return self.not_found("No such course with the given id.")
        if course.microsoft_group_id:
            return self.ok(
                self.get_serializer(course).data, message="already_linked"
            )

        evaluation = evaluate_course_candidate(course, request.tenant)
        if evaluation["status"] not in REPAIRABLE_STATUSES:
            return self.bad_request(evaluation["detail"])

        try:
            provision_course_team_for(course, request.tenant)
        except ValidationError as exc:
            return self.send_response(
                True,
                "ms_error",
                {"details": exc.detail},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        course.refresh_from_db()
        return self.ok(self.get_serializer(course).data, message="created")


class CourseLinkMicrosoftTeamView(RBACView):
    """POST courses/<id>/link-microsoft-team {group_id} — link an existing Team."""

    model = models.Course
    serializer = serializers.CourseSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "course.update"}

    def check_permissions(self, request):
        super().check_permissions(request)
        user = acting_user(request)
        if user is not None:
            require_superadmin_or_admin(user)

    def post(self, request: Request, course_id: int):
        from app_microsoft.provisioning import link_course_team

        if not request.tenant.is_microsoft_on:
            return self.bad_request(
                "Microsoft integration is not enabled for this organization."
            )
        course = models.Course.objects.filter(id=course_id).first()
        if not course:
            return self.not_found("No such course with the given id.")

        group_id = (request.data or {}).get("group_id") or (request.data or {}).get(
            "microsoft_group_id"
        )
        try:
            link_course_team(course, request.tenant, group_id)
        except ValueError as exc:
            return self.bad_request(str(exc))
        except Exception as exc:  # noqa: BLE001
            return self.send_response(
                True,
                "ms_error",
                {"details": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        course.refresh_from_db()
        return self.ok(self.get_serializer(course).data, message="linked")


class CourseMicrosoftChannelsView(RBACView):
    """GET courses/<id>/microsoft-channels — list Teams channels for a linked course Team."""

    model = models.Course
    serializer = serializers.CourseSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "course.update"}

    def check_permissions(self, request):
        super().check_permissions(request)
        user = acting_user(request)
        if user is None:
            return
        course_id = self.kwargs.get("course_id")
        course = models.Course.objects.filter(id=course_id).first()
        if not course:
            return
        roles = user.roles or []
        if User.UserRole.SUPERADMIN in roles or User.UserRole.ADMIN in roles:
            return
        check_course_write(user, course)

    def get(self, request: Request, course_id: int):
        from app_microsoft.delegated_auth import resolve_teams_meeting_for_actor

        if not request.tenant.is_microsoft_on:
            return self.bad_request(
                "Microsoft integration is not enabled for this organization."
            )
        course = models.Course.objects.filter(id=course_id).first()
        if not course:
            return self.not_found("No such course with the given id.")
        if not course.microsoft_group_id:
            return self.ok([])

        meeting, err = resolve_teams_meeting_for_actor(request.tenant, acting_user(request))
        if meeting is None:
            return self.bad_request(
                err or "Microsoft Teams is not connected for this user or organization."
            )

        channels = meeting.list_channels(course.microsoft_group_id) or []
        data = [
            {"id": ch.get("id"), "displayName": ch.get("displayName", "")}
            for ch in channels
            if ch.get("id")
        ]
        return self.ok(data)


class CourseResolveBulkView(RBACView):
    """POST /courses/resolve-bulk — bulk fuzzy course name matching for Import Wizard."""

    name = "Course bulk resolve view"
    required_permissions = {"POST": "course.view"}

    def post(self, request):
        from app_course.import_matching import (
            load_tier1_catalog,
            load_tier2_catalog,
            match_course_names,
        )

        names = request.data.get("names") or []
        names = [str(n) for n in names if isinstance(n, (str, int, float))]
        if not names:
            return self.ok({})

        def _opt_int(value):
            try:
                return int(value) if value not in (None, "") else None
            except (TypeError, ValueError):
                return None

        program_id = _opt_int(request.data.get("program_id"))
        intake_id = _opt_int(request.data.get("intake_id"))

        scope_program_name = None
        scope_intake_name = None
        if program_id is not None:
            program = models.Program.objects.filter(pk=program_id).only("name").first()
            scope_program_name = program.name if program else None
        if intake_id is not None:
            intake = models.Intake.objects.filter(pk=intake_id).only("name").first()
            scope_intake_name = intake.name if intake else None

        tier1 = load_tier1_catalog(program_id, intake_id)
        tier2 = load_tier2_catalog(program_id, intake_id)
        results = match_course_names(
            names,
            tier1=tier1,
            tier2=tier2,
            scope_program_name=scope_program_name,
            scope_intake_name=scope_intake_name,
        )
        return self.ok(results)


class CourseInsightsSearchView(RBACView):
    """Staff: list effectively active courses with course insight issues."""

    required_permissions = {"POST": "course.view_all"}

    def post(self, request: Request):
        from app_course.course_insights_services import (
            build_data_health_rows,
            paginate_rows,
            parse_data_health_filters,
        )

        body = request.data if isinstance(request.data, dict) else {}
        filters = parse_data_health_filters(body, request.query_params)
        summary, rows = build_data_health_rows(filters, request.tenant)
        page_rows, count = paginate_rows(rows, filters.page, filters.size)
        return self.send_response(
            False,
            "success",
            {
                "data": {"summary": summary, "results": page_rows},
                "page": filters.page,
                "size": filters.size,
                "count": count,
            },
            status=200,
        )


class OverlapFixPreviewView(RBACView):
    """Preview merge plan for overlapping sessions on a course."""

    required_permissions = {"POST": "course.manage_content"}

    def post(self, request: Request, course_id: int):
        from app_course.overlap_fix_services import build_overlap_fix_preview

        course = models.Course.objects.filter(id=course_id).first()
        if course is None:
            return self.not_found("No such course exists.")
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_write(user, course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")
        data = build_overlap_fix_preview(course, request.tenant)
        return self.send_response(False, "success", {"data": data}, status=200)


class OverlapFixApplyView(RBACView):
    """Apply merge plan for overlapping sessions on a course."""

    required_permissions = {"POST": "course.manage_content"}

    def post(self, request: Request, course_id: int):
        from app_course.overlap_fix_services import apply_overlap_fix

        course = models.Course.objects.filter(id=course_id).first()
        if course is None:
            return self.not_found("No such course exists.")
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_write(user, course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")
        data = apply_overlap_fix(course, request.tenant)
        return self.send_response(False, "success", {"data": data}, status=200)


class OverlapReschedulePreviewView(RBACView):
    """Preview future overlapping sessions for shared-time reschedule (Fix)."""

    required_permissions = {"POST": "course.manage_content"}

    def post(self, request: Request, course_id: int):
        from app_course.overlap_reschedule_services import build_overlap_reschedule_preview

        course = models.Course.objects.filter(id=course_id).first()
        if course is None:
            return self.not_found("No such course exists.")
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_write(user, course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")
        data = build_overlap_reschedule_preview(course, request.tenant)
        return self.send_response(False, "success", {"data": data}, status=200)


class OverlapRescheduleApplyView(RBACView):
    """Apply shared time_from/time_to to selected overlapping sessions (Fix)."""

    required_permissions = {"POST": "course.manage_content"}

    def post(self, request: Request, course_id: int):
        from app_course.overlap_reschedule_services import apply_overlap_reschedule
        from rest_framework.exceptions import ValidationError

        course = models.Course.objects.filter(id=course_id).first()
        if course is None:
            return self.not_found("No such course exists.")
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_write(user, course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")

        event_ids = request.data.get("event_ids") or []
        time_from = request.data.get("time_from")
        time_to = request.data.get("time_to")
        try:
            data = apply_overlap_reschedule(
                course,
                request.tenant,
                event_ids=event_ids,
                time_from=time_from,
                time_to=time_to,
            )
        except ValidationError as exc:
            return self.bad_request(exc.detail)
        return self.send_response(False, "success", {"data": data}, status=200)


class ScheduleResolveOverlapsView(RBACView):
    """One-click overlap resolution from calendar draft state."""

    required_permissions = {"POST": "course.manage_content"}

    def post(self, request: Request, course_id: int):
        from app_course.schedule_resolve_services import resolve_schedule_overlaps

        course = models.Course.objects.filter(id=course_id).first()
        if course is None:
            return self.not_found("No such course exists.")
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_write(user, course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")

        mode = request.data.get("mode")
        if mode not in ("auto_global", "pin_survivor"):
            return self.bad_request({"message": "Invalid mode."})

        draft_events = request.data.get("draft_events") or []
        pin = None
        if mode == "pin_survivor":
            pin = {
                "survivor": request.data.get("survivor") or {},
                "local_date": request.data.get("local_date"),
                "remove_event_ids": request.data.get("remove_event_ids") or [],
                "remove_draft_ids": request.data.get("remove_draft_ids") or [],
            }

        try:
            data = resolve_schedule_overlaps(
                course=course,
                org=request.tenant,
                mode=mode,
                draft_events=draft_events,
                pin=pin,
            )
        except ValidationError as exc:
            return self.send_response(
                True,
                "bad_request",
                {"details": exc.detail},
                status=400,
            )
        return self.send_response(False, "success", {"data": data}, status=200)

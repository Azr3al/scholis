from django.db.models import Q
from rest_framework.request import Request

from app_admissions.course_unit import annotate_current_unit
from app_admissions.serializers import (
    AdmissionsCourseSerializer,
    AdmissionsPersonSerializer,
)
from app_admissions.services import attending_classes_for_user
from app_auth.models import User
from app_course.course_search_queryset import annotate_course_queryset_first_event_times
from app_course.models import Course
from app_rbac.views import RBACSearchView, RBACView
from utilitas.queryset_mixins import OptimizedSearchMixin


class AdmissionsPeopleSearchView(OptimizedSearchMixin, RBACSearchView):
    model = User
    serializer = AdmissionsPersonSerializer
    required_permissions = {"POST": "admissions.view"}

    def get_serializer_class(self):
        return AdmissionsPersonSerializer

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
        from app_admissions.services import is_admissions_students_search

        if is_admissions_students_search(request):
            get = request._request.GET.copy()
            get["include_inactive"] = "true"
            request._request.GET = get
        return super().get_queryset(
            request,
            filter_params,
            exclude_params,
            is_csv,
            fields,
            sorts,
            expand,
            filter_ids,
            chained_filter_params,
        )

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
        from app_admissions.services import (
            annotate_is_attending,
            include_alumni_requested,
            is_admissions_students_search,
        )

        queryset = annotate_is_attending(queryset)
        if is_admissions_students_search(self.request) and not include_alumni_requested(
            self.request
        ):
            queryset = queryset.filter(is_attending=True)
        return queryset

    def post(self, request, filter_ids=None):
        return super().post(request, None)


class AdmissionsPersonAttendingView(RBACView):
    name = "Admissions person attending"
    model = User
    serializer = AdmissionsPersonSerializer
    required_permissions = {"GET": "admissions.view"}

    def get(self, request, id: int):
        from app_admissions.services import annotate_is_attending, attending_classes_for_user

        user = annotate_is_attending(User.objects.filter(pk=id)).first()
        if user is None:
            return self.not_found()
        data = dict(AdmissionsPersonSerializer(user).data)
        data["classes"] = attending_classes_for_user(user, request=request)
        return self.ok(data)


class AdmissionsCourseSearchView(OptimizedSearchMixin, RBACSearchView):
    name = "Admissions course search"
    model = Course
    serializer = AdmissionsCourseSerializer
    required_permissions = {"POST": "admissions.view"}

    def get_serializer_class(self):
        return AdmissionsCourseSerializer

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
        queryset = annotate_current_unit(queryset)
        from app_course.course_search import (
            apply_course_search_q_with_meta,
            extract_scope_ids_from_filter_params,
            get_search_q,
            load_scope_names,
        )
        from app_course.course_status import (
            annotate_effective_status,
            apply_effective_status_filter,
        )

        queryset = annotate_effective_status(queryset)
        q = get_search_q(self.request)
        if q:
            filter_params = self.request.data.get("filter_params") or []
            program_id, intake_id = extract_scope_ids_from_filter_params(filter_params)
            scope_program_name, scope_intake_name = load_scope_names(
                program_id, intake_id
            )
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

    def post(self, request, filter_ids=None):
        return super().post(request, None)

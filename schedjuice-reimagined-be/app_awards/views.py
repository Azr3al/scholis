from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from app_auth.models import User
from app_awards import models, serializers, services
from app_course.course_scoping import acting_user
from app_course.models import Course
from app_rbac.views import RBACDetailsView, RBACListView, RBACView

import json


def _forbid_unless_can_grade(view, request):
    if not services.can_grade_awards(request.user):
        return view.forbidden("You cannot manage course awards.")
    return None


class AwardTitleListView(RBACListView):
    name = "Award title list"
    model = models.AwardTitle
    serializer = serializers.AwardTitleSerializer
    required_permissions = {
        "GET": "award_title.manage",
        "POST": "award_title.manage",
    }

    def get_queryset(self, request, filter_params=None, **kwargs):
        filter_params = dict(filter_params or {})
        filter_params["course__isnull"] = True
        filter_params["retired_at__isnull"] = True
        return super().get_queryset(request, filter_params=filter_params, **kwargs)


class AwardTitleDetailsView(RBACDetailsView):
    name = "Award title details"
    model = models.AwardTitle
    serializer = serializers.AwardTitleSerializer
    required_permissions = {
        "GET": "award_title.manage",
        "PUT": "award_title.manage",
        "PATCH": "award_title.manage",
    }

    def patch(self, request, obj_id: int):
        return self.put(request, obj_id)


class AwardTitleRetireView(RBACView):
    name = "Award title retire"
    model = models.AwardTitle
    serializer = serializers.AwardTitleSerializer
    required_permissions = {"POST": "award_title.manage"}

    def post(self, request, obj_id: int):
        title = models.AwardTitle.objects.filter(pk=obj_id, course__isnull=True).first()
        if title is None:
            return self.not_found("Award title not found.")
        if title.retired_at is None:
            title.retired_at = timezone.now()
            title.save(update_fields=["retired_at"])
        return self.ok(serializers.AwardTitleSerializer(title).data)


class CourseAwardsBoardView(RBACView):
    name = "Course awards board"
    rbac_decision = "authenticated_only"

    def get(self, request, course_id: int):
        denied = _forbid_unless_can_grade(self, request)
        if denied is not None:
            return denied
        course = Course.objects.filter(pk=course_id).first()
        if course is None:
            return self.not_found("Course not found.")
        try:
            payload = services.course_awards_board(
                course,
                request.query_params.get("period_kind"),
                year=request.query_params.get("year"),
                month=request.query_params.get("month"),
                request=request,
            )
        except ValidationError as exc:
            return self.validation_error(exc.detail)
        return self.ok(payload)


class CourseAwardGrantCreateView(RBACView):
    name = "Course award grant create"
    rbac_decision = "authenticated_only"

    def post(self, request, course_id: int):
        denied = _forbid_unless_can_grade(self, request)
        if denied is not None:
            return denied
        course = Course.objects.filter(pk=course_id).first()
        if course is None:
            return self.not_found("Course not found.")
        body = request.data or {}
        student = User.objects.filter(pk=body.get("user")).first()
        if student is None:
            return self.validation_error({"user": "Student not found."})
        actor = acting_user(request)
        try:
            title = services.resolve_title_for_grant(
                course,
                title_id=body.get("title_id"),
                name=body.get("name"),
                actor=actor,
            )
            grant = services.grant_award(
                course=course,
                title=title,
                user=student,
                period_kind=body.get("period_kind"),
                year=body.get("year"),
                month=body.get("month"),
                granted_by=actor,
            )
        except ValidationError as exc:
            return self.validation_error(exc.detail)
        return self.created({"id": grant.id, "title": services.serialize_title(grant.title)})


class CourseAwardGrantBatchView(RBACView):
    name = "Course award grant batch"
    rbac_decision = "authenticated_only"

    def post(self, request, course_id: int):
        denied = _forbid_unless_can_grade(self, request)
        if denied is not None:
            return denied
        course = Course.objects.filter(pk=course_id).first()
        if course is None:
            return self.not_found("Course not found.")
        body = request.data or {}
        try:
            payload = services.grant_awards_batch(
                course=course,
                title_id=body.get("title_id"),
                name=body.get("name"),
                user_ids=body.get("user_ids"),
                period_kind=body.get("period_kind"),
                year=body.get("year"),
                month=body.get("month"),
                granted_by=acting_user(request),
            )
        except ValidationError as exc:
            return self.validation_error(exc.detail)
        return self.ok(payload)


class AwardGrantDeleteView(RBACView):
    name = "Award grant delete"
    rbac_decision = "authenticated_only"

    def delete(self, request, obj_id: int):
        denied = _forbid_unless_can_grade(self, request)
        if denied is not None:
            return denied
        grant = models.AwardGrant.objects.filter(pk=obj_id).first()
        if grant is None:
            return self.not_found("Award grant not found.")
        services.delete_grant(grant)
        return self.deleted()


class CourseAwardTitlePromoteView(RBACView):
    name = "Course award title promote"
    rbac_decision = "authenticated_only"

    def post(self, request, course_id: int, obj_id: int):
        denied = _forbid_unless_can_grade(self, request)
        if denied is not None:
            return denied
        course = Course.objects.filter(pk=course_id).first()
        if course is None:
            return self.not_found("Course not found.")
        title = models.AwardTitle.objects.filter(pk=obj_id).first()
        if title is None:
            return self.not_found("Award title not found.")
        try:
            org = services.promote_local_title(course, title, acting_user(request))
        except ValidationError as exc:
            return self.validation_error(exc.detail)
        return self.created(serializers.AwardTitleSerializer(org).data)


class CourseAwardDisplayTemplateView(RBACView):
    name = "Course award display template"
    rbac_decision = "authenticated_only"

    def get(self, request, course_id: int, obj_id: int):
        denied = _forbid_unless_can_grade(self, request)
        if denied is not None:
            return denied
        course = Course.objects.filter(pk=course_id).first()
        if course is None:
            return self.not_found("Course not found.")
        title = models.AwardTitle.objects.filter(pk=obj_id).first()
        if title is None:
            return self.not_found("Award title not found.")
        try:
            services._assert_title_usable(course, title)
        except ValidationError:
            return self.not_found("Award title not found.")
        return self.ok(services.serialize_display_template(title, request))


def _parse_document(raw):
    if raw is None or raw == "":
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ValidationError({"document": "Must be valid JSON."}) from exc
        if not isinstance(parsed, dict):
            raise ValidationError({"document": "Must be an object."})
        return parsed
    raise ValidationError({"document": "Must be an object."})


def _template_payload(template, request):
    return serializers.AwardTemplateSerializer(
        template, context={"request": request}
    ).data


class AwardTitleCertificateView(RBACView):
    name = "Award title certificate"
    required_permissions = {
        "GET": "award_title.manage",
        "POST": "award_title.manage",
        "PATCH": "award_title.manage",
        "DELETE": "award_title.manage",
    }

    def _title(self, obj_id: int):
        return models.AwardTitle.objects.filter(pk=obj_id).first()

    def get(self, request, obj_id: int):
        title = self._title(obj_id)
        if title is None:
            return self.not_found("Award title not found.")
        if title.course_id is not None:
            return self.validation_error(
                {"title": "Local titles cannot have templates."}
            )
        template = services.get_award_certificate(title)
        if template is None:
            return self.not_found("Certificate not found.")
        return self.ok(_template_payload(template, request))

    def post(self, request, obj_id: int):
        title = self._title(obj_id)
        if title is None:
            return self.not_found("Award title not found.")
        try:
            template = services.create_award_certificate(title, acting_user(request))
        except ValidationError as exc:
            detail = exc.detail
            if isinstance(detail, dict) and "certificate" in detail:
                return Response(
                    {
                        "isError": True,
                        "message": "conflict",
                        "details": detail,
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            return self.validation_error(detail)
        return self.created(_template_payload(template, request))

    def patch(self, request, obj_id: int):
        title = self._title(obj_id)
        if title is None:
            return self.not_found("Award title not found.")
        template = services.get_award_certificate(title)
        if template is None:
            return self.not_found("Certificate not found.")
        body = request.data or {}
        try:
            document = _parse_document(body.get("document")) if "document" in body else None
            background = body.get("background")
            if background == "" or background is None:
                background = request.FILES.get("background")
            template = services.save_award_certificate(
                template,
                document=document,
                background=background,
            )
        except ValidationError as exc:
            return self.validation_error(exc.detail)
        return self.ok(_template_payload(template, request))

    def delete(self, request, obj_id: int):
        title = self._title(obj_id)
        if title is None:
            return self.not_found("Award title not found.")
        template = services.get_award_certificate(title)
        if template is None:
            return self.not_found("Certificate not found.")
        template.delete()
        return self.deleted()

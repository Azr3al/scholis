from __future__ import annotations

from django.db.models import Q
from rest_framework.exceptions import PermissionDenied
from rest_framework.views import Request

from app_auth.models import User, UserTeachingSubject
from app_auth.staff_helpers import user_is_staff
from app_auth.teaching_subject_serializers import UserTeachingSubjectSerializer
from app_auth.user_scoping import acting_user, check_user_write
from app_course.models import Category, ProgramLevel, Subject
from app_rbac.views import RBACView
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication

SEARCH_OPTION_LIMIT = 50


def _can_manage_teaching_subjects(actor: User, subject: User) -> bool:
    if actor.id == subject.id:
        return True
    try:
        check_user_write(actor, subject)
        return True
    except PermissionDenied:
        return False


def _get_staff_subject(user_id: int) -> User | None:
    subject = User.objects.filter(pk=user_id).first()
    if subject is None or not user_is_staff(subject):
        return None
    return subject


def _teaching_subject_select_related():
    return (
        "subject",
        "program_level",
        "program_level__default_category",
        "category",
    )


class UserTeachingSubjectListCreateView(RBACView):
    name = "User teaching subjects list/create"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def get(self, request: Request, user_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        subject = _get_staff_subject(user_id)
        if subject is None:
            return self.not_found("User not found.")
        if not _can_manage_teaching_subjects(actor, subject):
            return self.forbidden("Not allowed for this user.")
        qs = (
            UserTeachingSubject.objects.filter(user=subject)
            .select_related(*_teaching_subject_select_related())
            .order_by("sort_order", "created_at")
        )
        ser = UserTeachingSubjectSerializer(
            qs,
            many=True,
            context={"tenant": request.tenant},
        )
        return self.ok(ser.data)

    def post(self, request: Request, user_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        subject = _get_staff_subject(user_id)
        if subject is None:
            return self.not_found("User not found.")
        if not _can_manage_teaching_subjects(actor, subject):
            return self.forbidden("Not allowed for this user.")
        ser = UserTeachingSubjectSerializer(
            data=request.data,
            context={"subject_user": subject, "tenant": request.tenant},
        )
        if not ser.is_valid():
            return self.bad_request(details=ser.errors)
        row = ser.save()
        out = UserTeachingSubjectSerializer(
            UserTeachingSubject.objects.select_related(
                *_teaching_subject_select_related()
            ).get(pk=row.pk),
            context={"tenant": request.tenant},
        )
        return self.created(out.data)


class UserTeachingSubjectDetailView(RBACView):
    name = "User teaching subject detail"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def _get_row(self, user_id: int, row_id: int):
        return (
            UserTeachingSubject.objects.select_related(
                *_teaching_subject_select_related(),
                "user",
            )
            .filter(user_id=user_id, pk=row_id)
            .first()
        )

    def patch(self, request: Request, user_id: int, row_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        row = self._get_row(user_id, row_id)
        if row is None:
            return self.not_found("Teaching subject not found.")
        if not _can_manage_teaching_subjects(actor, row.user):
            return self.forbidden("Not allowed for this user.")
        ser = UserTeachingSubjectSerializer(
            row,
            data=request.data,
            partial=True,
            context={"subject_user": row.user, "tenant": request.tenant},
        )
        if not ser.is_valid():
            return self.bad_request(details=ser.errors)
        row = ser.save()
        out = UserTeachingSubjectSerializer(row, context={"tenant": request.tenant})
        return self.ok(out.data)

    def delete(self, request: Request, user_id: int, row_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        row = self._get_row(user_id, row_id)
        if row is None:
            return self.not_found("Teaching subject not found.")
        if not _can_manage_teaching_subjects(actor, row.user):
            return self.forbidden("Not allowed for this user.")
        row.delete()
        return self.deleted()


class UserTeachingSubjectSearchView(RBACView):
    name = "User teaching subjects search"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def get(self, request: Request, user_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        subject = _get_staff_subject(user_id)
        if subject is None:
            return self.not_found("User not found.")
        if not _can_manage_teaching_subjects(actor, subject):
            return self.forbidden("Not allowed for this user.")

        q = (request.query_params.get("q") or "").strip()
        allow_level_category = bool(
            getattr(request.tenant, "teaching_subjects_allow_level_category_search", False)
        )

        existing = UserTeachingSubject.objects.filter(user=subject)
        existing_subject_ids = set(
            existing.filter(entity_type=UserTeachingSubject.EntityType.SUBJECT).values_list(
                "subject_id", flat=True
            )
        )
        existing_level_ids = set(
            existing.filter(
                entity_type=UserTeachingSubject.EntityType.PROGRAM_LEVEL
            ).values_list("program_level_id", flat=True)
        )
        existing_category_ids = set(
            existing.filter(entity_type=UserTeachingSubject.EntityType.CATEGORY).values_list(
                "category_id", flat=True
            )
        )

        options: list[dict[str, str]] = []

        subjects_qs = Subject.objects.all().order_by("name")
        if q:
            subjects_qs = subjects_qs.filter(name__icontains=q)
        for item in subjects_qs:
            if item.id in existing_subject_ids:
                continue
            options.append(
                {
                    "value": f"subject:{item.id}",
                    "label": item.name,
                    "entity_type": UserTeachingSubject.EntityType.SUBJECT,
                }
            )
            if len(options) >= SEARCH_OPTION_LIMIT:
                break

        if allow_level_category and len(options) < SEARCH_OPTION_LIMIT:
            levels_qs = ProgramLevel.objects.filter(is_active=True).order_by(
                "sort_order", "name"
            )
            if q:
                levels_qs = levels_qs.filter(name__icontains=q)
            for item in levels_qs:
                if item.id in existing_level_ids:
                    continue
                options.append(
                    {
                        "value": f"program_level:{item.id}",
                        "label": item.name,
                        "entity_type": UserTeachingSubject.EntityType.PROGRAM_LEVEL,
                    }
                )
                if len(options) >= SEARCH_OPTION_LIMIT:
                    break

        if allow_level_category and len(options) < SEARCH_OPTION_LIMIT:
            categories_qs = Category.objects.all().order_by("sort_order", "name")
            if q:
                categories_qs = categories_qs.filter(
                    Q(name__icontains=q) | Q(search_text__icontains=q)
                )
            for item in categories_qs:
                if item.id in existing_category_ids:
                    continue
                options.append(
                    {
                        "value": f"category:{item.id}",
                        "label": item.name,
                        "entity_type": UserTeachingSubject.EntityType.CATEGORY,
                    }
                )
                if len(options) >= SEARCH_OPTION_LIMIT:
                    break

        return self.ok(
            {
                "allow_level_category_search": allow_level_category,
                "options": options,
            }
        )

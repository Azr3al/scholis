from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from app_awards.models import AwardGrant, AwardTitle, AwardTemplate
from app_awards.document import EMPTY_AWARD_DOCUMENT, validate_award_document
from app_course.models import UserCourse
from app_rbac.resolution import effective_permissions

GRADE_AWARD_CODES = frozenset({"assignment.grade", "grade.manage"})


def can_grade_awards(user) -> bool:
    return bool(GRADE_AWARD_CODES & set(effective_permissions(user)))


def serialize_display_template(title: AwardTitle, request=None) -> dict | None:
    if title.course_id is not None:
        return None
    template = getattr(title, "template", None)
    if template is None:
        try:
            template = title.template
        except AwardTemplate.DoesNotExist:
            return None
    from app_awards.serializers import AwardTemplateSerializer

    data = AwardTemplateSerializer(template, context={"request": request}).data
    return {
        "id": data["id"],
        "name": data["name"],
        "document": data["document"],
        "background_url": data.get("background_url"),
    }


def serialize_title(
    title: AwardTitle,
    *,
    has_display_template: bool | None = None,
    display_template=None,
    include_display_template: bool = False,
) -> dict:
    payload = {
        "id": title.id,
        "name": title.name,
        "family": title.family,
        "origin": title.origin,
        "is_pinned": title.is_pinned,
    }
    if has_display_template is not None:
        payload["has_display_template"] = has_display_template
    if include_display_template:
        payload["display_template"] = display_template
    return payload


def _period_kwargs(period_kind, year, month):
    if period_kind == AwardGrant.PeriodKind.MONTH:
        return {
            "period_kind": AwardGrant.PeriodKind.MONTH,
            "year": year,
            "month": month,
        }
    return {
        "period_kind": AwardGrant.PeriodKind.OVERALL,
        "year": None,
        "month": None,
    }


def _assert_enrolled_student(course, user):
    enrolled = UserCourse.objects.filter(
        course=course,
        user=user,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).exists()
    if not enrolled:
        raise ValidationError({"user": "Student is not on this course roster."})


def _assert_title_usable(course, title):
    if title.course_id is not None and title.course_id != course.id:
        raise ValidationError({"title": "Title does not belong to this course."})
    if title.course_id is None and title.retired_at is not None:
        raise ValidationError({"title": "Cannot grant a retired title."})


def _assert_not_duplicate(course, title, user, period_kwargs):
    if AwardGrant.objects.filter(course=course, title=title, user=user, **period_kwargs).exists():
        raise ValidationError({"title": "This student already has this award for this period."})


def _assert_family_unique(course, title, user, period_kwargs):
    if not title.family:
        return
    clash = (
        AwardGrant.objects.filter(course=course, user=user, **period_kwargs)
        .exclude(title=title)
        .filter(title__family=title.family)
        .select_related("title")
        .first()
    )
    if clash is not None:
        raise ValidationError(
            {
                "family": (
                    f"This student already has {clash.title.name} "
                    f"in the same family for this period."
                )
            }
        )


def parse_period(period_kind, year=None, month=None):
    if period_kind == AwardGrant.PeriodKind.MONTH:
        try:
            year_i = int(year)
            month_i = int(month)
        except (TypeError, ValueError):
            raise ValidationError(
                {"period": "year and month are required for month periods."}
            )
        if not 1 <= month_i <= 12:
            raise ValidationError({"month": "Invalid month."})
        return _period_kwargs(AwardGrant.PeriodKind.MONTH, year_i, month_i)
    if period_kind == AwardGrant.PeriodKind.OVERALL:
        return _period_kwargs(AwardGrant.PeriodKind.OVERALL, None, None)
    raise ValidationError({"period_kind": "Must be month or overall."})


def resolve_title_for_grant(course, *, title_id, name, actor):
    if title_id not in (None, ""):
        title = AwardTitle.objects.filter(pk=title_id).first()
        if title is None:
            raise ValidationError({"title_id": "Award title not found."})
        return title
    trimmed = (name or "").strip()
    if not trimmed:
        raise ValidationError({"name": "Provide a title_id or a name."})
    org = AwardTitle.objects.filter(
        course__isnull=True,
        retired_at__isnull=True,
        name__iexact=trimmed,
    ).first()
    if org is not None:
        return org
    local = AwardTitle.objects.filter(course=course, name__iexact=trimmed).first()
    if local is not None:
        return local
    return AwardTitle.objects.create(
        name=trimmed,
        family=None,
        course=course,
        is_pinned=False,
        origin=AwardTitle.Origin.LOCAL,
        created_by=actor,
    )


def typeahead_groups(course) -> dict:
    org = AwardTitle.objects.filter(course__isnull=True, retired_at__isnull=True)
    pinned = list(org.filter(is_pinned=True).order_by("sort_order", "name"))
    pinned_ids = {title.id for title in pinned}
    since = timezone.now() - timedelta(days=365)
    top10 = list(
        org.filter(is_pinned=False)
        .annotate(usage=Count("grants", filter=Q(grants__created_at__gte=since)))
        .order_by("-usage", "sort_order", "name")[:10]
    )
    top10_ids = {title.id for title in top10}
    local = list(AwardTitle.objects.filter(course=course).order_by("name"))
    other = list(
        org.exclude(id__in=pinned_ids | top10_ids).order_by("sort_order", "name")
    )
    ids = [title.id for title in pinned + top10 + local + other]
    with_tmpl = set(
        AwardTemplate.objects.filter(title_id__in=ids).values_list("title_id", flat=True)
    )

    def _pick(titles):
        return [
            serialize_title(title, has_display_template=title.id in with_tmpl)
            for title in titles
        ]

    return {
        "pinned": _pick(pinned),
        "top10": _pick(top10),
        "local": _pick(local),
        "other": _pick(other),
    }


def course_awards_board(course, period_kind, year=None, month=None, request=None) -> dict:
    period_kwargs = parse_period(period_kind, year, month)
    roster = (
        UserCourse.objects.filter(
            course=course,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        .select_related("user")
        .order_by("user__name", "user_id")
    )
    grants = (
        AwardGrant.objects.filter(course=course, **period_kwargs)
        .select_related("title")
        .select_related("title__template")
        .order_by("id")
    )
    by_user: dict[int, list] = {}
    for grant in grants:
        by_user.setdefault(grant.user_id, []).append(
            {
                "id": grant.id,
                "title": serialize_title(
                    grant.title,
                    include_display_template=True,
                    display_template=serialize_display_template(grant.title, request),
                ),
            }
        )
    return {
        "students": [
            {
                "id": membership.user_id,
                "name": membership.user.name,
                "grants": by_user.get(membership.user_id, []),
            }
            for membership in roster
        ],
        "picker": typeahead_groups(course),
    }


def grant_award(
    *,
    course,
    title,
    user,
    period_kind,
    granted_by,
    year=None,
    month=None,
):
    period_kwargs = parse_period(period_kind, year, month)
    _assert_enrolled_student(course, user)
    _assert_title_usable(course, title)
    _assert_not_duplicate(course, title, user, period_kwargs)
    _assert_family_unique(course, title, user, period_kwargs)
    return AwardGrant.objects.create(
        course=course,
        title=title,
        user=user,
        granted_by=granted_by,
        **period_kwargs,
    )


def first_validation_message(exc: ValidationError) -> str:
    detail = exc.detail
    if isinstance(detail, dict):
        for value in detail.values():
            if isinstance(value, list) and value:
                return str(value[0])
            return str(value)
    if isinstance(detail, list) and detail:
        return str(detail[0])
    return str(detail)


def grant_awards_batch(
    *,
    course,
    title_id,
    name,
    user_ids,
    period_kind,
    granted_by,
    year=None,
    month=None,
):
    if not isinstance(user_ids, list) or len(user_ids) == 0:
        raise ValidationError({"user_ids": "Select at least one student."})
    ids = []
    for raw in user_ids:
        try:
            ids.append(int(raw))
        except (TypeError, ValueError):
            raise ValidationError({"user_ids": "Each id must be an integer."})
    from app_auth.models import User

    title = resolve_title_for_grant(
        course, title_id=title_id, name=name, actor=granted_by
    )
    created_local = (
        title.origin == AwardTitle.Origin.LOCAL
        and not AwardGrant.objects.filter(title=title).exists()
    )
    title_payload = serialize_title(title)
    granted = []
    errors = []
    for uid in ids:
        user = User.objects.filter(pk=uid).first()
        try:
            if user is None:
                raise ValidationError({"user": "Student not found."})
            grant = grant_award(
                course=course,
                title=title,
                user=user,
                period_kind=period_kind,
                year=year,
                month=month,
                granted_by=granted_by,
            )
            granted.append(
                {
                    "id": grant.id,
                    "user": uid,
                    "title": serialize_title(grant.title),
                }
            )
        except ValidationError as exc:
            errors.append({"user": uid, "message": first_validation_message(exc)})
    if created_local and not granted:
        if not AwardGrant.objects.filter(title=title).exists():
            title.delete()
    return {"title": title_payload, "granted": granted, "errors": errors}


def delete_grant(grant: AwardGrant) -> None:
    title = grant.title
    grant.delete()
    if (
        title.origin == AwardTitle.Origin.LOCAL
        and not AwardGrant.objects.filter(title=title).exists()
    ):
        title.delete()


def promote_local_title(course, title, actor) -> AwardTitle:
    if title.origin != AwardTitle.Origin.LOCAL or title.course_id != course.id:
        raise ValidationError(
            {"title": "Only a local title on this course can be promoted."}
        )
    org = AwardTitle.objects.filter(
        course__isnull=True,
        retired_at__isnull=True,
        name__iexact=title.name,
    ).first()
    with transaction.atomic():
        if org is None:
            org = AwardTitle.objects.create(
                name=title.name,
                family=None,
                course=None,
                is_pinned=False,
                origin=AwardTitle.Origin.PROMOTED,
                created_by=actor,
            )
        AwardGrant.objects.filter(title=title).update(title=org)
        title.delete()
    return org


def create_award_certificate(title: AwardTitle, actor) -> AwardTemplate:
    if title.course_id is not None:
        raise ValidationError({"title": "Local titles cannot have templates."})
    if AwardTemplate.objects.filter(title=title).exists():
        raise ValidationError(
            {"certificate": "This title already has a certificate."}
        )
    return AwardTemplate.objects.create(
        title=title,
        name=title.name,
        document=dict(EMPTY_AWARD_DOCUMENT),
        background=None,
        created_by=actor,
    )


def get_award_certificate(title: AwardTitle) -> AwardTemplate | None:
    return AwardTemplate.objects.filter(title=title).first()


def save_award_certificate(
    template: AwardTemplate,
    *,
    document=None,
    background=None,
) -> AwardTemplate:
    if document is not None:
        validate_award_document(document)
        if not template.background and background is None:
            raise ValidationError({"background": "Background image is required."})
        template.document = document
    if background is not None:
        template.background = background
    template.save()
    return template

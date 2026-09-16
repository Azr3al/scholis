from __future__ import annotations

from django.db.models import Exists, OuterRef, QuerySet
from rest_framework.fields import DateTimeField

from app_auth.models import User
from app_course.course_status import compute_effective_status, effective_status_q
from app_course.models import Course, UserCourse
from app_finance.models import UserPayment
from app_finance.serializers import UserPaymentSerializer

ATTENDING_STATUSES = {
    Course.CourseStatus.ACTIVE,
    Course.CourseStatus.PAUSED,
    Course.CourseStatus.PLANNED,
}

ENDED_STATUS = Course.CourseStatus.ENDED

_payment_date_field = DateTimeField()


def _truthy_query_param(request, name: str) -> bool:
    raw = request.query_params.get(name)
    if raw is None:
        return False
    return str(raw).lower() in ("true", "1", "yes")


def include_alumni_requested(request) -> bool:
    return _truthy_query_param(request, "include_alumni")


def is_admissions_students_search(request) -> bool:
    for fp in request.data.get("filter_params") or []:
        if fp.get("field_name") != "roles":
            continue
        if fp.get("operator") != "contained_by":
            continue
        raw = str(fp.get("value") or "").strip()
        if raw.startswith("{") and raw.endswith("}"):
            raw = raw[1:-1]
        parts = {p.strip() for p in raw.split(",") if p.strip()}
        return parts == {User.UserRole.STUDENT}
    return False


def attending_membership_exists():
    return Exists(
        UserCourse.objects.filter(
            user_id=OuterRef("pk"),
            assigned_as=UserCourse.AssignedAs.STUDENT,
            course__in=Course.objects.filter(
                effective_status_q(*ATTENDING_STATUSES)
            ),
        )
    )


def annotate_is_attending(queryset: QuerySet) -> QuerySet:
    return queryset.annotate(is_attending=attending_membership_exists())


def _file_url(field) -> str | None:
    if not field:
        return None
    try:
        return field.url
    except (ValueError, OSError):
        return None


def payment_screenshot_url(payment: UserPayment) -> str | None:
    url = _file_url(getattr(payment, "screenshot", None))
    if url:
        return url
    if not payment.group_id:
        return None
    parts = payment.group.parts.all() if payment.group_id else []
    for sibling in parts:
        if sibling.id == payment.id:
            continue
        url = _file_url(getattr(sibling, "screenshot", None))
        if url:
            return url
    return None


def _amount_json(payment: UserPayment):
    field = UserPaymentSerializer().fields["actual_amount"]
    return field.to_representation(payment.actual_amount)


def _created_by_json(payment: UserPayment) -> dict | None:
    staff = payment.created_by
    if staff is None:
        return None
    return {"id": staff.id, "name": staff.name}


def serialize_latest_payment(payment: UserPayment) -> dict:
    remarks = (payment.remarks or "").strip() or None
    return {
        "payment_date": _payment_date_field.to_representation(payment.payment_date),
        "amount": _amount_json(payment),
        "receipt_number": payment.receipt.number if payment.receipt_id else None,
        "covered_months": [
            {"year": cm.year, "month_index": cm.month_index}
            for cm in payment.covered_months.all()
        ],
        "status": payment.status,
        "created_by": _created_by_json(payment),
        "remarks": remarks,
        "screenshot": payment_screenshot_url(payment),
    }


def latest_payment(user_id: int, course_id: int) -> dict | None:
    payment = (
        UserPayment.objects.filter(
            user_id=user_id,
            course_id=course_id,
        )
        .select_related("receipt", "created_by", "group")
        .prefetch_related("covered_months", "group__parts")
        .order_by("-id")
        .first()
    )
    if payment is None:
        return None
    return serialize_latest_payment(payment)


def _main_teachers_by_course(course_ids: list[int]) -> dict[int, list[dict]]:
    from app_course.models import AssignedAsRole

    out: dict[int, list[dict]] = {cid: [] for cid in course_ids}
    rows = (
        UserCourse.objects.filter(
            course_id__in=course_ids,
            assigned_as=UserCourse.AssignedAs.TEACHER,
            assigned_as_role__seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
            assigned_as_role__is_substitute=False,
        )
        .select_related("user")
        .order_by("user__name", "user_id")
    )
    for uc in rows:
        out[uc.course_id].append(
            {
                "id": uc.user_id,
                "name": uc.user.name,
                "phone_number": uc.user.phone_number,
            }
        )
    return out


def _serialize_class_rows(
    user: User, courses: list[Course], *, request=None
) -> list[dict]:
    from app_admissions.course_unit import annotate_current_unit
    from app_admissions.serializers import AdmissionsCourseSerializer
    from app_course.course_search_queryset import annotate_course_queryset_first_event_times
    from app_course.course_status import annotate_effective_status

    if not courses:
        return []
    ids = [c.id for c in courses]
    qs = annotate_effective_status(
        annotate_current_unit(
            annotate_course_queryset_first_event_times(
                Course.objects.filter(id__in=ids)
            )
        )
    )
    by_id = {c.id: c for c in qs}
    teachers = _main_teachers_by_course(ids)
    context = {"request": request} if request is not None else {}
    out = []
    for course_id in ids:
        course = by_id[course_id]
        data = AdmissionsCourseSerializer(course, context=context).data
        out.append(
            {
                "course_id": data["id"],
                "title": data["title"],
                "status": data["status"],
                "start_date": data["start_date"],
                "end_date": data["end_date"],
                "weekday_pattern": data["weekday_pattern"],
                "first_event_time_from": data["first_event_time_from"],
                "first_event_time_to": data["first_event_time_to"],
                "current_unit": data["current_unit"],
                "current_unit_updated_at": data["current_unit_updated_at"],
                "main_teachers": teachers.get(course_id, []),
                "latest_payment": latest_payment(user.id, course_id),
            }
        )
    return out


def attending_classes_for_user(user: User, *, request=None) -> list[dict]:
    memberships = UserCourse.objects.filter(
        user=user,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).select_related("course")
    attending_courses = []
    ended_courses = []
    for uc in memberships:
        status = compute_effective_status(uc.course)
        if status in ATTENDING_STATUSES:
            attending_courses.append(uc.course)
        elif status == ENDED_STATUS:
            ended_courses.append(uc.course)
    chosen = attending_courses or ended_courses
    return _serialize_class_rows(user, chosen, request=request)

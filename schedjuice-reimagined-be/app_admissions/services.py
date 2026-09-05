from __future__ import annotations

from rest_framework.fields import DateTimeField

from app_auth.models import User
from app_course.course_status import compute_effective_status
from app_course.models import Course, UserCourse
from app_finance.models import UserPayment
from app_finance.serializers import UserPaymentSerializer

ATTENDING_STATUSES = {
    Course.CourseStatus.ACTIVE,
    Course.CourseStatus.PAUSED,
    Course.CourseStatus.PLANNED,
}

_payment_date_field = DateTimeField()


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


def attending_classes_for_user(user: User) -> list[dict]:
    memberships = UserCourse.objects.filter(
        user=user,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).select_related("course")
    out = []
    for uc in memberships:
        if compute_effective_status(uc.course) not in ATTENDING_STATUSES:
            continue
        out.append(
            {
                "course_id": uc.course_id,
                "title": uc.course.title,
                "latest_payment": latest_payment(user.id, uc.course_id),
            }
        )
    return out
